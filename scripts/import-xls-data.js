/**
 * 从明细表.xls 导入数据到新建的子表（陆运明细 / 海运明细）
 *
 * 用法: node scripts/import-xls-data.js
 *
 * 前置条件:
 *   1. 已运行 scripts/create-sheets.js 创建四个子表
 *   2. data/明细表.xls 存在
 */

require('dotenv').config();
const XLSX = require('xlsx');
const wecom = require('../lib/wecom');

const DOCID = process.env.DOCID;
if (!DOCID) {
  console.error('❌ 缺少 DOCID 环境变量');
  process.exit(1);
}

const XLS_PATH = require('path').join(__dirname, '..', 'data', '明细表.xls');

// ============================================================
// 工具函数
// ============================================================

/**
 * Excel 日期序列号 → 毫秒时间戳字符串
 * 如果是纯数字且在合理范围内，视为 Excel 序列号
 * 如果是字符串透传
 */
function excelDateToTimestamp(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = parseFloat(val);
  if (!isNaN(num) && num > 25569 && num < 100000) {
    // Excel 序列号: 1900-01-01 = 1, 1970-01-01 ≈ 25569
    const ms = Math.round((num - 25569) * 86400 * 1000);
    return String(ms);
  }
  // 字符串日期如 "2026/4/16 晚上" — 尝试解析
  if (typeof val === 'string' && val.trim()) {
    // 尝试匹配常见日期格式
    const match = val.match(/(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
    if (match) {
      const d = new Date(parseInt(match[1]), parseInt(match[2]) - 1, parseInt(match[3]), 12, 0, 0);
      if (!isNaN(d.getTime())) return String(d.getTime());
    }
  }
  return null;
}

/**
 * 将值格式化为企微 TEXT 单元格
 */
function textVal(val) {
  if (val === null || val === undefined || val === '') return null;
  return [{ type: 'text', text: String(val).trim() }];
}

/**
 * 将值格式化为企微 NUMBER 单元格
 */
function numVal(val) {
  if (val === null || val === undefined || val === '') return null;
  const n = parseFloat(val);
  if (isNaN(n)) return null;
  return n;
}

// ============================================================
// 明细表列索引 → 目标字段映射
// ============================================================

// 明细表.xls「泰国鲜」sheet 的 27 列
const XLS_COLS = {
  BATCH: 0,         // 批次信息（如 "付汇KK\nKK-GM-LL002\n10柜"）
  DISPATCH_DATE: 1, // 派车日期
  THAI_PLATE: 2,    // 泰国车牌
  CONTRACT: 3,      // 合同号
  STATUS: 4,        // 状态
  CUSTOMS_DEC: 5,   // 报关单
  CONTAINER: 6,     // 柜号
  PRODUCT: 7,       // 货名
  BRAND: 8,         // 品牌
  PORT: 9,          // 目的港
  DOC_STATUS: 10,   // 单证状态
  ORIGIN: 11,       // 产地
  PACKAGES: 12,     // 件数
  NET_WEIGHT: 13,   // 净重
  DEPART_TIME: 14,  // 出厂时间/开船时间
  ETA_PORT: 15,     // 预计到口岸时间/靠港时间
  ENTRY_TIME: 16,   // 进卡时间/卸船时间
  INSPECTION: 17,   // 查验类型
  EXIT_TIME: 18,    // 出卡时间
  ARRIVE_MARKET: 19,// 到市场时间
  DESTINATION: 20,  // 目的地（最终市场城市）
  DRIVER: 21,       // 司机信息
  LOGISTICS: 22,    // 物流公司
  SHIPPER: 23,      // 境外发货人
  CONSIGNEE: 24,    // 境内收货人
  CONSUMER: 25,     // 消费使用单位
  UNIT_PRICE: 26,   // 申报单价
};

/**
 * 按合同号前缀判断运输类型
 */
function isLandTransport(contract) {
  const c = String(contract || '').trim();
  return c.startsWith('LYL');
}

function isSeaTransport(contract) {
  const c = String(contract || '').trim();
  return c.startsWith('YL');
}

/**
 * 明细表一行 → 陆运明细 values
 */
function mapToLand(row) {
  const v = {};
  const s = (val) => textVal(row[val]);
  const n = (val) => numVal(row[val]);
  const d = (val) => {
    const ts = excelDateToTimestamp(row[val]);
    return ts ? ts : null;
  };

  // 直接映射
  if (s(XLS_COLS.DISPATCH_DATE)) v['下计划时间'] = d(XLS_COLS.DISPATCH_DATE) || textVal(row[XLS_COLS.DISPATCH_DATE]);
  if (s(XLS_COLS.THAI_PLATE)) v['国外物流车牌'] = s(XLS_COLS.THAI_PLATE);
  if (s(XLS_COLS.CONTRACT)) v['合同号'] = s(XLS_COLS.CONTRACT);
  if (s(XLS_COLS.STATUS)) v['当前状况'] = s(XLS_COLS.STATUS);
  if (s(XLS_COLS.CUSTOMS_DEC)) v['报关单号'] = s(XLS_COLS.CUSTOMS_DEC);
  if (s(XLS_COLS.CONTAINER)) v['柜号'] = s(XLS_COLS.CONTAINER);
  if (s(XLS_COLS.PRODUCT)) v['产品名称'] = s(XLS_COLS.PRODUCT);
  if (s(XLS_COLS.BRAND)) v['品牌'] = s(XLS_COLS.BRAND);
  if (s(XLS_COLS.PORT)) v['目的地'] = s(XLS_COLS.PORT);
  if (s(XLS_COLS.DOC_STATUS)) v['单证状态'] = s(XLS_COLS.DOC_STATUS);
  if (s(XLS_COLS.ORIGIN)) v['产地'] = s(XLS_COLS.ORIGIN);
  if (n(XLS_COLS.PACKAGES)) v['箱数'] = n(XLS_COLS.PACKAGES);
  if (n(XLS_COLS.NET_WEIGHT)) v['净重'] = n(XLS_COLS.NET_WEIGHT);
  if (d(XLS_COLS.DEPART_TIME)) v['出厂时间'] = d(XLS_COLS.DEPART_TIME);
  if (d(XLS_COLS.ETA_PORT)) v['到口岸时间'] = d(XLS_COLS.ETA_PORT);
  if (d(XLS_COLS.ENTRY_TIME)) v['进卡时间'] = d(XLS_COLS.ENTRY_TIME);
  if (s(XLS_COLS.INSPECTION)) v['是否中查验'] = s(XLS_COLS.INSPECTION);
  if (d(XLS_COLS.EXIT_TIME)) v['出口岸时间'] = d(XLS_COLS.EXIT_TIME);
  if (d(XLS_COLS.ARRIVE_MARKET)) v['到市场时间'] = d(XLS_COLS.ARRIVE_MARKET);
  if (s(XLS_COLS.DESTINATION)) v['市场'] = s(XLS_COLS.DESTINATION);
  if (s(XLS_COLS.LOGISTICS)) v['物流公司'] = s(XLS_COLS.LOGISTICS);
  if (s(XLS_COLS.SHIPPER)) v['境外发货人'] = s(XLS_COLS.SHIPPER);
  if (s(XLS_COLS.CONSIGNEE)) v['境内收货人'] = s(XLS_COLS.CONSIGNEE);
  if (s(XLS_COLS.CONSUMER)) v['消费使用单位'] = s(XLS_COLS.CONSUMER);
  if (n(XLS_COLS.UNIT_PRICE)) v['申报单价USD'] = n(XLS_COLS.UNIT_PRICE);

  // 司机信息放入物流备注
  if (s(XLS_COLS.DRIVER)) v['物流备注'] = s(XLS_COLS.DRIVER);

  // 原备注列留空（如有批次信息可放入）
  if (s(XLS_COLS.BATCH)) v['备注'] = s(XLS_COLS.BATCH);

  return v;
}

/**
 * 明细表一行 → 海运明细 values
 */
function mapToSea(row) {
  const v = {};
  const s = (val) => textVal(row[val]);
  const n = (val) => numVal(row[val]);
  const d = (val) => {
    const ts = excelDateToTimestamp(row[val]);
    return ts ? ts : null;
  };

  if (s(XLS_COLS.CONTRACT)) v['合同号'] = s(XLS_COLS.CONTRACT);
  if (s(XLS_COLS.STATUS)) v['当前状态'] = s(XLS_COLS.STATUS);
  if (s(XLS_COLS.CUSTOMS_DEC)) v['报关单号'] = s(XLS_COLS.CUSTOMS_DEC);
  if (s(XLS_COLS.CONTAINER)) v['柜号'] = s(XLS_COLS.CONTAINER);
  if (s(XLS_COLS.PORT)) v['目的港'] = s(XLS_COLS.PORT);
  if (s(XLS_COLS.PRODUCT)) v['品名'] = s(XLS_COLS.PRODUCT);
  if (s(XLS_COLS.DOC_STATUS)) v['单证状态'] = s(XLS_COLS.DOC_STATUS);
  if (d(XLS_COLS.DEPART_TIME)) v['起运时间'] = d(XLS_COLS.DEPART_TIME);
  if (d(XLS_COLS.ETA_PORT)) v['预计到港时间'] = d(XLS_COLS.ETA_PORT);
  if (d(XLS_COLS.ENTRY_TIME)) v['实际到港时间'] = d(XLS_COLS.ENTRY_TIME);
  if (s(XLS_COLS.THAI_PLATE)) v['船名'] = s(XLS_COLS.THAI_PLATE); // 泰国车牌→船名（海运时此列是船名）
  if (s(XLS_COLS.ORIGIN)) v['产地'] = s(XLS_COLS.ORIGIN);
  if (s(XLS_COLS.BRAND)) v['品牌'] = s(XLS_COLS.BRAND);
  if (n(XLS_COLS.PACKAGES)) v['数量件数'] = n(XLS_COLS.PACKAGES);
  if (n(XLS_COLS.NET_WEIGHT)) v['净重'] = n(XLS_COLS.NET_WEIGHT);
  if (s(XLS_COLS.SHIPPER)) v['境外发货人'] = s(XLS_COLS.SHIPPER);
  if (s(XLS_COLS.CONSIGNEE)) v['境内收货人'] = s(XLS_COLS.CONSIGNEE);
  if (s(XLS_COLS.CONSUMER)) v['消费使用单位'] = s(XLS_COLS.CONSUMER);
  if (n(XLS_COLS.UNIT_PRICE)) v['申报单价USD'] = n(XLS_COLS.UNIT_PRICE);

  // 单证部段
  if (s(XLS_COLS.INSPECTION)) v['查验状态'] = s(XLS_COLS.INSPECTION);
  if (d(XLS_COLS.EXIT_TIME)) v['放行时间'] = d(XLS_COLS.EXIT_TIME);
  if (d(XLS_COLS.ARRIVE_MARKET)) v['到市场日期'] = d(XLS_COLS.ARRIVE_MARKET);
  if (s(XLS_COLS.LOGISTICS)) v['单证物流公司'] = s(XLS_COLS.LOGISTICS);
  if (s(XLS_COLS.DESTINATION)) v['市场接货人'] = s(XLS_COLS.DESTINATION);
  if (s(XLS_COLS.DRIVER)) v['司机及联系方式'] = s(XLS_COLS.DRIVER);

  // 备注
  if (s(XLS_COLS.BATCH)) v['业务备注'] = s(XLS_COLS.BATCH);

  return v;
}

// ============================================================
// 主流程
// ============================================================

async function getSheetIdByTitle(docid, title) {
  const resp = await wecom.getSheets(docid);
  if (resp.errcode !== 0) {
    throw new Error(`获取子表列表失败: [${resp.errcode}] ${resp.errmsg}`);
  }
  const sheet = (resp.sheet_list || []).find(s => s.title === title);
  if (!sheet) {
    throw new Error(`未找到子表「${title}」，请先运行 scripts/create-sheets.js`);
  }
  return sheet.sheet_id;
}

async function main() {
  console.log('📥 开始导入明细表数据...\n');

  // 1. 读取 Excel
  console.log(`   读取: ${XLS_PATH}`);
  const wb = XLSX.readFile(XLS_PATH);
  const ws = wb.Sheets['泰国鲜'];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

  // 跳过表头（第 0 行），从第 1 行开始
  const dataRows = rows.slice(1).filter(r => {
    // 过滤完全空行和有柜号的行（有效数据）
    const contract = String(r[3] || '').trim();
    return contract.length > 0;
  });

  console.log(`   有效数据行: ${dataRows.length}`);

  // 2. 按合同号前缀分流
  const landRows = dataRows.filter(r => isLandTransport(r[3]));
  const seaRows = dataRows.filter(r => isSeaTransport(r[3]));

  console.log(`   陆运 (LYL): ${landRows.length} 条`);
  console.log(`   海运 (YL):  ${seaRows.length} 条`);

  // 3. 获取目标子表 ID
  console.log('\n🔍 查找目标子表...');
  const landSheetId = await getSheetIdByTitle(DOCID, '陆运明细');
  console.log(`   陆运明细: ${landSheetId}`);
  const seaSheetId = await getSheetIdByTitle(DOCID, '海运明细');
  console.log(`   海运明细: ${seaSheetId}`);

  // 4. 导入陆运数据
  let landImported = 0;
  if (landRows.length > 0) {
    console.log(`\n📦 导入陆运明细 (${landRows.length} 条)...`);
    const landRecords = landRows.map(r => ({ values: mapToLand(r) }));

    // 分批写入（企微 API 单次最多 500 条）
    const BATCH = 200;
    for (let i = 0; i < landRecords.length; i += BATCH) {
      const batch = landRecords.slice(i, i + BATCH);
      const resp = await wecom.addRecords(DOCID, landSheetId, batch);
      if (resp.errcode !== 0) {
        console.error(`   ❌ 第 ${i + 1}-${Math.min(i + BATCH, landRecords.length)} 条写入失败: [${resp.errcode}] ${resp.errmsg}`);
      } else {
        landImported += batch.length;
        console.log(`   ✅ 已写入 ${landImported}/${landRecords.length}`);
      }
    }
  }

  // 5. 导入海运数据
  let seaImported = 0;
  if (seaRows.length > 0) {
    console.log(`\n📦 导入海运明细 (${seaRows.length} 条)...`);
    const seaRecords = seaRows.map(r => ({ values: mapToSea(r) }));

    const BATCH = 200;
    for (let i = 0; i < seaRecords.length; i += BATCH) {
      const batch = seaRecords.slice(i, i + BATCH);
      const resp = await wecom.addRecords(DOCID, seaSheetId, batch);
      if (resp.errcode !== 0) {
        console.error(`   ❌ 第 ${i + 1}-${Math.min(i + BATCH, seaRecords.length)} 条写入失败: [${resp.errcode}] ${resp.errmsg}`);
      } else {
        seaImported += batch.length;
        console.log(`   ✅ 已写入 ${seaImported}/${seaRecords.length}`);
      }
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 导入结果:');
  console.log(`   陆运明细: ${landImported}/${landRows.length} 条`);
  console.log(`   海运明细: ${seaImported}/${seaRows.length} 条`);
  console.log(`   总计: ${landImported + seaImported} 条`);
  console.log('\n🎉 导入完成！');
}

main().catch(err => {
  console.error('\n💥 脚本异常:', err);
  process.exit(1);
});
