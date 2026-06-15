/**
 * 一键创建四个全流程追踪子表（陆运明细、海运明细、国内段明细、海运国内）
 *
 * 用法: node scripts/create-sheets.js
 *
 * 前置条件: .env 中已配置 CORPID, CORPSECRET, DOCID
 * 注意: 需要服务器 IP 在企微白名单中
 */

require('dotenv').config();
const wecom = require('../lib/wecom');

const DOCID = process.env.DOCID;
if (!DOCID) {
  console.error('❌ 缺少 DOCID 环境变量，请检查 .env 配置');
  process.exit(1);
}

// ---- 字段类型推断 ----

function inferFieldType(fieldTitle) {
  const t = fieldTitle.trim();

  // 日期时间
  if (/时间|日期/.test(t)) {
    return { field_type: 'FIELD_TYPE_DATE_TIME', property_date_time: { format: 'yyyy-mm-dd hh:mm', auto_fill: false } };
  }

  // 数字类型
  if (/金额|费用|成本|货款|货值|资金|税金|保险费|代理费|手续费|账单|回款|收款|付款|流水|运费|压款|堆场|吊装|洗箱|修箱|附加|装卸|仓储|短倒|打冷|陆运/.test(t)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 2 } };
  }
  if (/数量|净重|毛重|汇率/.test(t)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 1 } };
  }
  if (/箱数|件数/.test(t)) {
    return { field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 0 } };
  }

  // 默认文本
  return { field_type: 'FIELD_TYPE_TEXT' };
}

function buildFields(titles) {
  return titles.map(t => ({
    field_title: t,
    ...inferFieldType(t),
  }));
}

// ============================================================
// 字段定义（按客户数据明细.xlsx 从左到右顺序）
// ============================================================

// --- 陆运明细 (57 字段) ---
// 原 Excel 中 col 30 和 col 37 都是"备注"，col 57 也是"备注"
// 重命名为：备注、备注2(物流)、备注3(财务)
const landFields = buildFields([
  '下计划时间',        // 0
  '客户名称',          // 1
  '国外物流车牌',      // 2
  '当前状况',          // 3
  '合同号',            // 4
  '报关单号',          // 5
  '柜号',              // 6  ← 关联温度记录
  '提单号',            // 7
  '产品名称',          // 8
  '品牌',              // 8.5 ← 实际数据有此字段
  '目的地',            // 9
  '单证状态',          // 10
  '产地',              // 11
  '箱数',              // 12
  '毛重',              // 13
  '净重',              // 14
  '成交方式',          // 15
  '出厂时间',          // 16
  '到口岸时间',        // 17
  '进卡时间',          // 18
  '出口岸时间',        // 19
  '离口岸时间',        // 20
  '到市场时间',        // 21
  '离市场时间',        // 22
  '境外发货人',        // 23
  '境内收货人',        // 24
  '消费使用单位',      // 25
  '申报单价USD',       // 26  原名: 申报单价（USD）
  '申报总金额',        // 27
  '单位',              // 28
  '是否中查验',        // 29
  '备注',              // 30  第一个备注
  '市场',              // 31
  '物流公司',          // 32
  '国外物流费用',      // 33
  '单证公司',          // 34
  '国外单证费用',      // 35
  '国外收取客户费用',  // 36
  '物流备注',          // 37  第二个备注 → 物流备注
  '整柜净货值泰铢',    // 39  原名: 整柜净货值/泰铢
  '借用资金数量',      // 40
  '金融资金',          // 41
  '清关费',            // 42
  '保险费',            // 43
  '代理费',            // 44
  '税金RMB',           // 45  原名: 税金（RMB）
  '是否出账单',        // 46
  '账单总金额',        // 47
  '帐单日期',          // 48
  '账单金额回款',      // 49
  '流水金额',          // 50
  '回款时间',          // 51
  '开票类型',          // 52
  '是否付汇',          // 53
  '付汇金额USD',       // 54  原名: 付汇金额（USD）
  '付汇手续费',        // 55
  '付汇是否开票',      // 56
  '财务备注',          // 57  第三个备注 → 财务备注
]);

// --- 海运明细 (~89 字段) ---
// 分四个区块，同名"物流公司"和"备注"加前缀区分
const seaFields = buildFields([
  // 业务信息表段
  '做柜时间',              // 0
  '客户名称',              // 1
  '报关单号',              // 2
  '当前状态',              // 3
  '提单号',                // 4
  '合同号',                // 5
  '柜号',                  // 6  ← 关联温度记录
  '目的港',                // 7
  '品名',                  // 8
  '单证状态',              // 9
  '起运时间',              // 10
  '预计到港时间',          // 11
  '实际到港时间',          // 12
  '报关行',                // 13
  '船名',                  // 14
  '航次',                  // 15
  '产地',                  // 16
  '成交方式',              // 17
  '卸货港',                // 18
  '品牌',                  // 19
  '船公司',                // 20
  '数量件数',              // 21  原名: 数量/件数
  '毛重',                  // 22
  '净重',                  // 23
  '境外发货人',            // 24
  '境内收货人',            // 25
  '消费使用单位',          // 26
  '申报单价USD',           // 27
  '申报总金额USD',         // 28
  '是否订舱',              // 29
  '业务物流公司',          // 30  原名: 物流公司（业务段）
  '订舱费用收',            // 31
  '订舱费用付',            // 32
  '业务备注',              // 33  备注（业务段）

  // 单证部段
  '查验状态',              // 35
  '查验时间',              // 36
  '放行时间',              // 37
  '提柜时间',              // 38
  '重柜尾期',              // 39
  '吉柜尾期',              // 40
  '空柜日期',              // 41
  '还柜日期',              // 42
  '到市场日期',            // 43
  '数字大于0做补收账单',   // 44  原名: 数字>0做补收账单
  '应出账单日期',          // 45
  '原柜倒柜',              // 46  原名: 原柜/倒柜
  '单证物流公司',          // 47  原名: 物流公司（单证段）
  '物流信息',              // 48
  '市场接货人',            // 49
  '司机及联系方式',        // 50
  '物流成本',              // 51
  '收取客户物流费',        // 52
  '单证备注',              // 53  备注（单证段）

  // 财务部段
  '整柜净货值',            // 55
  '汇率',                  // 56
  '借用资金数量',          // 57
  '借用资金数量RMB',       // 58
  '金融资金',              // 59
  '税金',                  // 60
  '清关费',                // 61
  '查验费',                // 62
  '短倒费',                // 63
  '短倒打冷费',            // 64
  '装卸费',                // 65
  '仓储费',                // 66
  '陆运费',                // 67
  '陆运打冷费',            // 68
  '堆场费',                // 69
  '倒柜综合服务费',        // 70
  '压柜费',                // 71
  '吊装费',                // 72
  '洗箱费',                // 73
  '修箱费',                // 74
  '低硫燃油附加费',        // 75
  '保险费',                // 76
  '海运费RMB',             // 77
  '付汇手续费',            // 78
  '账单总金额',            // 79
  '压款金额',              // 80
  '实际需收款金额',        // 81
  '补收账单日期',          // 82
  '需要补收金额',          // 83
  '账单日期',              // 84
  '补收款日期',            // 85
  '补收款金额',            // 86
  '收款期限',              // 87
  '回款日期',              // 88
  '回款金额',              // 89
  '是否开票',              // 90
  '开票类型',              // 91
  '付汇金额USD',           // 92
  '付汇是否开票',          // 93
  '财务备注',              // 94  备注（财务段）
]);

// --- 国内段明细 (13 字段) ---
const domesticFields = buildFields([
  '客户信息',
  '产品名称',
  '国外柜号',
  '离开口岸时间',
  '到达市场时间',
  '离开市场时间',
  '国内市场',
  '车辆信息',
  '司机及电话',
  '运费',
  '实付运费',
  '余额',
  '物流公司',
]);

// --- 海运国内 (16 字段) ---
const seaDomesticFields = buildFields([
  '产品名称',
  '国外柜号',
  '口岸',
  '提柜时间',
  '到达市场时间',
  '出账单时间',
  '离开市场时间',
  '还柜时间',
  '市场负责人',
  '国内市场',
  '车辆信息',
  '司机及电话',
  '运费',
  '实付运费',
  '余额',
  '物流公司',
]);

// ============================================================
// 创建逻辑
// ============================================================

async function createSheetWithFields(docid, sheetTitle, fields) {
  console.log(`\n📋 创建子表「${sheetTitle}」...`);

  // 1. 添加子表
  const sheetResp = await wecom.addSheet(docid, { title: sheetTitle });
  if (sheetResp.errcode !== 0) {
    throw new Error(`创建子表失败: [${sheetResp.errcode}] ${sheetResp.errmsg}`);
  }
  const sheetId = sheetResp.properties.sheet_id;
  console.log(`   ✅ 子表已创建: ${sheetId}`);

  // 2. 添加字段（企微反序添加，需 reverse）
  // 分批添加，每批最多 50 个字段
  const BATCH_SIZE = 50;
  const reversed = [...fields].reverse();

  for (let i = 0; i < reversed.length; i += BATCH_SIZE) {
    const batch = reversed.slice(i, i + BATCH_SIZE);
    console.log(`   📝 添加字段第 ${i + 1}-${Math.min(i + BATCH_SIZE, reversed.length)} 个...`);
    const fieldsResp = await wecom.addFields(docid, sheetId, batch);
    if (fieldsResp.errcode !== 0) {
      throw new Error(`添加字段失败: [${fieldsResp.errcode}] ${fieldsResp.errmsg}`);
    }
  }

  // 3. 删除默认的「智能表列」
  try {
    const currentFields = await wecom.getFields(docid, sheetId);
    if (currentFields.errcode === 0) {
      const defaultCol = (currentFields.fields || []).find(f => f.field_title === '智能表列');
      if (defaultCol) {
        const delResult = await wecom.deleteFields(docid, sheetId, [defaultCol.field_id]);
        if (delResult.errcode === 0) {
          console.log('   🗑  已删除默认「智能表列」');
        }
      }
    }
  } catch (e) {
    console.warn('   ⚠️  删除默认列失败（可忽略）:', e.message);
  }

  console.log(`   ✅「${sheetTitle}」完成！${fields.length} 个字段`);
  return sheetId;
}

async function main() {
  console.log('🚀 开始创建全流程追踪子表...\n');
  console.log(`   DOCID: ${DOCID}`);

  const sheets = [
    { title: '陆运明细', fields: landFields },
    { title: '海运明细', fields: seaFields },
    { title: '国内段明细', fields: domesticFields },
    { title: '海运国内', fields: seaDomesticFields },
  ];

  const results = [];
  for (const sheet of sheets) {
    try {
      const sheetId = await createSheetWithFields(DOCID, sheet.title, sheet.fields);
      results.push({ title: sheet.title, sheetId, fields: sheet.fields.length, success: true });
    } catch (err) {
      console.error(`   ❌「${sheet.title}」失败:`, err.message);
      results.push({ title: sheet.title, success: false, error: err.message });
    }
  }

  console.log('\n' + '='.repeat(60));
  console.log('📊 创建结果:');
  for (const r of results) {
    if (r.success) {
      console.log(`   ✅ ${r.title} — ${r.sheetId} (${r.fields} 字段)`);
    } else {
      console.log(`   ❌ ${r.title} — ${r.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n🎉 完成: ${successCount}/${results.length} 个子表创建成功`);
}

main().catch(err => {
  console.error('\n💥 脚本异常:', err);
  process.exit(1);
});
