/**
 * 一次性迁移：用 data/数据明细表.xlsx 重建陆运明细子表
 *
 * 步骤：
 *  1. 删除 4 张旧子表：陆运明细 / 海运明细 / 国内段明细 / 海运国内
 *  2. 按 xlsx「泰国陆运」表头重建「陆运明细」（50 字段，跳第 40 列空表头，3 个备注重命名为 业务/物流/财务备注）
 *  3. 6 个语义为枚举的字段建为 SINGLE_SELECT，options 自动从数据收集
 *  4. 删除子表新建时自带的「智能表列」默认列
 *  5. 导入 44 条柜号非空的真实数据
 *
 * 用法：node scripts/migrate-from-xlsx.js
 * 注意：服务器或本地 IP 需在企微「企业可信IP」白名单中
 */
require('dotenv').config();
const path = require('path');
const XLSX = require('xlsx');
const wecom = require('../lib/wecom');

const XLSX_PATH = path.join(__dirname, '..', 'data', '数据明细表.xlsx');
const SHEET_NAME_IN_XLSX = '泰国陆运';
const TARGET_SHEET_TITLE = '陆运明细';

// 要删除的旧子表标题
const OLD_SHEETS_TO_DELETE = ['陆运明细', '海运明细', '国内段明细', '海运国内'];

// 53 列里：第 40 列（索引 39）表头为空，跳过
const SKIP_COLUMN_INDICES = new Set([39]);

// 3 个「备注」按列位置语义重命名
const RENAME_BY_INDEX = {
  30: '业务备注',  // 第 31 列，跟「是否中查验」一组
  38: '物流备注',  // 第 39 列，跟物流费用一组
  52: '财务备注',  // 第 53 列，跟付汇一组
};

// 适合做单选的字段（语义是枚举/状态）
const SINGLE_SELECT_FIELDS = new Set([
  '当前状况', '单证状态', '是否中查验', '是否出账单', '是否付汇', '付汇是否开票'
]);

// ---- 字段类型推断（含枚举扩展）----
function inferFieldType(title) {
  if (SINGLE_SELECT_FIELDS.has(title)) {
    return { field_type: 'FIELD_TYPE_SINGLE_SELECT' }; // options 后填
  }
  if (/时间|日期/.test(title)) {
    return { field_type: 'FIELD_TYPE_DATE_TIME', property_date_time: { format: 'yyyy-mm-dd hh:mm', auto_fill: false } };
  }
  if (/金额|费用|税金|单价|总金额|清关费|保险费|账单|回款|净货值|手续费/.test(title)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 2 } };
  }
  if (/重量|净重|毛重/.test(title)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 1 } };
  }
  if (/箱数|件数|数量/.test(title)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 0 } };
  }
  return { field_type: 'FIELD_TYPE_TEXT' };
}

// Excel 日期序列号 → ms 时间戳字符串
function excelDateToTimestamp(val) {
  if (val == null || val === '') return null;
  if (typeof val === 'number' && val > 25569 && val < 80000) {
    return String(Math.round((val - 25569) * 86400 * 1000));
  }
  // 已经是字符串日期
  const d = new Date(val);
  if (!isNaN(d.getTime())) return String(d.getTime());
  return null;
}

// ---- 从 xlsx 读取表头 + 数据 ----
function loadXlsx() {
  console.log(`📖 读取 ${XLSX_PATH}`);
  const wb = XLSX.readFile(XLSX_PATH);
  const ws = wb.Sheets[SHEET_NAME_IN_XLSX];
  if (!ws) throw new Error(`xlsx 中找不到 sheet「${SHEET_NAME_IN_XLSX}」`);

  const range = XLSX.utils.decode_range(ws['!ref']);
  const colCount = range.e.c + 1;

  // 表头（第 0 行）
  const rawHeaders = [];
  for (let c = 0; c < colCount; c++) {
    const cell = ws[XLSX.utils.encode_cell({ r: 0, c })];
    rawHeaders.push(cell ? String(cell.v).trim() : '');
  }

  // 数据（柜号非空）
  const containerCol = rawHeaders.indexOf('柜号');
  if (containerCol < 0) throw new Error('表头缺少「柜号」列');

  const rows = [];
  for (let r = 1; r <= range.e.r; r++) {
    const cell = ws[XLSX.utils.encode_cell({ r, c: containerCol })];
    if (!cell || !String(cell.v).trim()) continue;
    const row = {};
    for (let c = 0; c < colCount; c++) {
      const v = ws[XLSX.utils.encode_cell({ r, c })];
      row[c] = v ? v.v : null;
    }
    rows.push(row);
  }

  console.log(`✅ 表头 ${colCount} 列，有效数据 ${rows.length} 条`);
  return { rawHeaders, rows };
}

// ---- 主逻辑 ----
(async () => {
  const docid = process.env.DOCID;
  if (!docid) throw new Error('.env 缺少 DOCID');

  // 1. 读 xlsx
  const { rawHeaders, rows } = loadXlsx();

  // 1a. 决定保留的列 + 最终标题
  const finalCols = []; // [{srcIndex, title, ...inferFieldType}]
  rawHeaders.forEach((title, idx) => {
    if (SKIP_COLUMN_INDICES.has(idx)) return;
    if (!title) return;
    const finalTitle = RENAME_BY_INDEX[idx] || title;
    finalCols.push({ srcIndex: idx, title: finalTitle });
  });
  // 检查重名
  const titles = finalCols.map(f => f.title);
  const dupes = titles.filter((t, i) => titles.indexOf(t) !== i);
  if (dupes.length) throw new Error('字段重名：' + dupes.join(','));
  console.log(`📋 最终字段 ${finalCols.length} 个`);

  // 1b. 收集 SINGLE_SELECT 的 options
  for (const f of finalCols) {
    const inf = inferFieldType(f.title);
    if (inf.field_type === 'FIELD_TYPE_SINGLE_SELECT') {
      const set = new Set();
      rows.forEach(r => {
        const v = r[f.srcIndex];
        if (v != null && String(v).trim()) set.add(String(v).trim());
      });
      const options = Array.from(set).map(text => ({ text }));
      f.field_type = 'FIELD_TYPE_SINGLE_SELECT';
      f.property_single_select = { is_multiple: false, is_quick_add: true, options };
      console.log(`  · ${f.title} → SINGLE_SELECT (${options.length} 个选项: ${options.map(o => o.text).join('/')})`);
    } else {
      Object.assign(f, inf);
    }
  }

  // 2. 列出现有子表
  console.log('\n=== 当前子表清单 ===');
  const sheetsResp = await wecom.getSheets(docid);
  if (sheetsResp.errcode) throw new Error(`getSheets 失败: ${sheetsResp.errmsg}`);
  const allSheets = sheetsResp.sheet_list || sheetsResp.properties || [];
  allSheets.forEach(s => console.log(`  · ${s.title} | ${s.sheet_id}`));

  // 3. 删除 4 张旧子表
  console.log('\n=== 删除旧子表 ===');
  for (const title of OLD_SHEETS_TO_DELETE) {
    const sh = allSheets.find(s => s.title === title);
    if (!sh) { console.log(`  · ${title} → 不存在，跳过`); continue; }
    const r = await wecom.deleteSheet(docid, sh.sheet_id);
    console.log(`  · ${title} (${sh.sheet_id}) → ${r.errcode === 0 ? '✅ 已删除' : '❌ ' + r.errmsg}`);
    if (r.errcode !== 0) throw new Error('删除失败：' + r.errmsg);
  }

  // 4. 创建新「陆运明细」子表
  console.log(`\n=== 创建子表「${TARGET_SHEET_TITLE}」===`);
  const addResp = await wecom.addSheet(docid, { title: TARGET_SHEET_TITLE });
  if (addResp.errcode) throw new Error('addSheet 失败: ' + addResp.errmsg);
  const newSheetId = addResp.properties.sheet_id;
  console.log(`  · sheet_id = ${newSheetId}`);

  // 5. 添加字段（addFields 会按反向插入，所以传入前先 reverse 一份）
  // 分批：每批 50 字段以内
  console.log(`\n=== 添加 ${finalCols.length} 个字段 ===`);
  const BATCH = 50;
  // 反向后，企微会再反向，最终顺序=原顺序
  const reversed = finalCols.slice().reverse();
  for (let i = 0; i < reversed.length; i += BATCH) {
    const slice = reversed.slice(i, i + BATCH);
    const r = await wecom.addFields(docid, newSheetId, slice.map(f => {
      const out = { field_title: f.title, field_type: f.field_type };
      if (f.property_number) out.property_number = f.property_number;
      if (f.property_date_time) out.property_date_time = f.property_date_time;
      if (f.property_single_select) out.property_single_select = f.property_single_select;
      return out;
    }));
    if (r.errcode) throw new Error(`addFields 失败 (batch ${i}): ${r.errmsg}`);
    console.log(`  · batch ${i}-${i + slice.length - 1} ✅ 已添加 ${(r.fields || []).length}`);
    // 把 field_id 写回 finalCols（按 title 反查）
    (r.fields || []).forEach(rf => {
      const match = finalCols.find(c => c.title === rf.field_title);
      if (match) match.field_id = rf.field_id;
    });
  }

  // 6. 删除默认「智能表列」
  console.log('\n=== 删除默认「智能表列」 ===');
  const fieldsResp = await wecom.getFields(docid, newSheetId);
  const allFields = fieldsResp.fields || [];
  const defaultCol = allFields.find(f => f.field_title === '智能表列');
  if (defaultCol) {
    const r = await wecom.deleteFields(docid, newSheetId, [defaultCol.field_id]);
    console.log(`  · ${r.errcode === 0 ? '✅ 已删除' : '❌ ' + r.errmsg}`);
  } else {
    console.log('  · 不存在，跳过');
  }

  // 7. 导入数据
  console.log(`\n=== 导入 ${rows.length} 行数据 ===`);
  const titleToCol = new Map(finalCols.map(c => [c.title, c]));
  const records = rows.map(row => {
    const values = {};
    for (const col of finalCols) {
      const raw = row[col.srcIndex];
      if (raw == null || raw === '') continue;
      if (col.field_type === 'FIELD_TYPE_NUMBER') {
        const n = Number(raw);
        if (!isNaN(n)) values[col.title] = n;
      } else if (col.field_type === 'FIELD_TYPE_DATE_TIME') {
        const ts = excelDateToTimestamp(raw);
        if (ts) values[col.title] = ts;
      } else if (col.field_type === 'FIELD_TYPE_SINGLE_SELECT') {
        values[col.title] = [{ text: String(raw).trim() }];
      } else {
        values[col.title] = [{ type: 'text', text: String(raw).trim() }];
      }
    }
    return { values };
  });

  // 分批写入：每批 100 条
  const REC_BATCH = 100;
  let written = 0;
  for (let i = 0; i < records.length; i += REC_BATCH) {
    const slice = records.slice(i, i + REC_BATCH);
    const r = await wecom.addRecords(docid, newSheetId, slice, 'CELL_VALUE_KEY_TYPE_FIELD_TITLE');
    if (r.errcode) throw new Error(`addRecords 失败 (batch ${i}): ${r.errmsg}`);
    written += (r.records || []).length;
    console.log(`  · batch ${i}-${i + slice.length - 1} ✅ ${(r.records || []).length} 条`);
  }
  console.log(`\n🎉 完成：陆运明细 ${written}/${rows.length} 条数据已写入`);
})().catch(err => {
  console.error('\n❌ 迁移失败:', err.message);
  console.error(err.stack);
  process.exit(1);
});
