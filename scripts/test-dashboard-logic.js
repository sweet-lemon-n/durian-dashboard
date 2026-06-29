const assert = require('assert');
const { aggregateFromWecom } = require('../lib/wecom-aggregate');
const { aggregateFlowDashboard } = require('../lib/flow-dashboard');

const source = require('../data/import_data.json');

function wrapRecords(rows) {
  return rows.map((values, index) => ({
    record_id: `r${index + 1}`,
    values,
  }));
}

function makeFields(values) {
  return Object.keys(values || {}).map((title, index) => ({
    field_id: `f${index + 1}`,
    field_title: title,
    field_type: 'TEXT',
  }));
}

function makeSheet(title, rows) {
  const records = wrapRecords(rows);
  return {
    title,
    sheet_id: `${title}-id`,
    fields: makeFields(rows[0] || {}),
    records,
  };
}

function daysAgo(days) {
  return String(Date.now() - days * 86400000);
}

async function main() {
  const orders = source.orders || [];
  const containers = source.containers || [];
  const overseasCount = containers.filter(r => !r['到岸时间']).length;
  const onShoreDelayCount = containers.filter(r => r['到岸时间'] && !r['国内发货时间'] && !r['签收日期']).length;
  const thUniqueOrders = orders.filter(r => r['国家'] === '泰国').length;
  const vnUniqueOrders = orders.filter(r => r['国家'] === '越南').length;
  const totalUniqueOrders = orders.filter(r => ['泰国', '越南'].includes(r['国家'])).length;

  const onShore = containers.find(r => r['到岸时间'] && !r['国内发货时间'] && !r['签收日期']);
  const signed = containers.find(r => r['签收日期']);
  assert(onShore, '需要至少一条在岸柜样本');
  assert(signed, '需要至少一条已签收柜样本');
  const detailRows = containers.map(r => ({
    ...r,
    口岸: r['柜号'] === onShore['柜号'] ? '磨憨口岸' : '',
  }));

  const snapshot = {
    fetchedAt: new Date().toISOString(),
    sheets: [
      makeSheet('订单主表', orders),
      makeSheet('分柜明细表', detailRows),
      makeSheet('温度记录', [
        { 柜号: containers[0]['柜号'], 更新时间: daysAgo(0), 设定温度: 13, 回风温度: 14.2, 品牌: '测试品牌A', 当前位置: '越南LANG SON' },
        { 柜号: containers[1]['柜号'], 更新时间: daysAgo(0), 设定温度: 13, 回风温度: 12.9, 品牌: '测试品牌B', 当前位置: '泰国在途' },
        { 柜号: containers[2]['柜号'], 更新时间: daysAgo(0), 设定温度: 13, 回风温度: 15.5, 品牌: '测试品牌C', 当前位置: '越南LANG SON' },
        { 柜号: containers[3]['柜号'], 更新时间: daysAgo(0), 设定温度: 13, 回风温度: 13.1, 品牌: '测试品牌D', 当前位置: '泰国在途' },
      ]),
      makeSheet('陆运明细', [
        { 柜号: onShore['柜号'], 进卡时间: daysAgo(3), 出卡时间: '', 目的地: '口岸A', 是否中查验: '查验' },
        { 柜号: signed['柜号'], 进卡时间: daysAgo(4), 出卡时间: '', 目的地: '口岸B', 是否中查验: '查验' },
      ]),
    ],
  };

  const board = await aggregateFromWecom('fake-doc', snapshot);
  assert.strictEqual(board.th.orders, thUniqueOrders, '泰国订单数应按主表唯一订单统计');
  assert.strictEqual(board.vn.orders, vnUniqueOrders, '越南订单数应按主表唯一订单统计');
  assert.strictEqual(board.global.totalOrders, totalUniqueOrders, '总订单数应按主表唯一订单统计');
  assert.strictEqual(board.logistics.kpis.inTransit, overseasCount, '在途批次应按分柜当前状态统计');
  assert.strictEqual(board.logistics.kpis.portDelayed, onShoreDelayCount, '关口滞留应结合当前状态过滤已签收柜');

  const flow = await aggregateFlowDashboard(snapshot);
  assert.ok(Array.isArray(flow.orders), '流向看板应暴露订单事实，供前端筛选重新计算总数');
  assert.strictEqual(flow.orders.length, orders.length * 2, '每个订单应拆成两个品类事实');
  assert.strictEqual(
    flow.details.onShore.find(r => r.containerNo === onShore['柜号']).port,
    '磨憨口岸',
    '口岸等待位置应从分柜明细口岸字段传递'
  );

  console.log('dashboard logic checks passed');
}

main().catch(err => {
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
