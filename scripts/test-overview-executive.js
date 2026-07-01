const assert = require('assert');
const { buildExecutiveOverview } = require('../lib/overview-executive');

const now = Date.now();
const day = 86400000;
const isoDaysAgo = days => new Date(now - days * day).toISOString();
const dateKey = value => {
  const d = new Date(value);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

const aggregate = {
  global: {
    totalOrders: 12,
    totalBoxes: 40,
    totalArrived: 22,
    totalDone: 15,
    totalPending: 6,
  },
  logistics: {
    kpis: {
      tempRecords: 60,
      tempAlarms: 2,
      avgReturnTemp: 6.2,
      portDelayed: 1,
    },
    inTransitContainers: [
      { container: 'TCLU1', status: 'ALARM', setTemp: 5, returnTemp: 10, note: '▲异常' },
      { container: 'TCLU2', status: 'OK', setTemp: 5, returnTemp: 6.6, note: '注意' },
      { container: 'TCLU3', status: 'OK', setTemp: 5, returnTemp: 5.4, recordedAt: isoDaysAgo(2), note: '正常' },
      { container: 'OV1', status: 'OK', setTemp: 13, returnTemp: 13.4, releaseDate: isoDaysAgo(9), recordedAt: isoDaysAgo(0), location: '泰国南部在途', note: '正常' },
      { container: 'OV2', status: 'OK', setTemp: 13, returnTemp: 13.5, releaseDate: isoDaysAgo(10), location: '越南旧趟在途', note: '同柜号不同放柜日期' },
      { container: 'TEMPONLY1', status: 'OK', setTemp: 13, returnTemp: 13.2, releaseDate: isoDaysAgo(1), recordedAt: isoDaysAgo(1), location: '泰国海外在途', note: '温度表海外在途' },
      { container: 'SH1', status: 'OK', setTemp: 13, returnTemp: 13.1, location: '口岸旧温度', note: '已到岸旧记录' },
      { container: 'DO1', status: 'OK', setTemp: 13, returnTemp: 13.2, location: '国内旧温度', note: '国内旧记录' },
    ],
  },
  news: {
    auto: [{ title: 'news 1' }, { title: 'news 2' }, { title: 'news 3' }, { title: 'news 4' }],
    fetchedAt: isoDaysAgo(0),
  },
};

const flow = {
  kpis: {
    total: 40,
    shipped: 34,
    arrived: 22,
    signed: 15,
    shippedRate: 85,
    signedRate: 37.5,
  },
  orders: [
    { orderNo: 'KK-001', category: 'FRESH', boxes: 20, country: '泰国' },
    { orderNo: 'KK-001', category: 'FROZEN', boxes: 5, country: '泰国' },
    { orderNo: 'YL-002', category: 'FRESH', boxes: 15, country: '越南' },
  ],
  details: {
    shipped: [
      { containerNo: 'OV1', orderNo: 'KK-001', status: 'overseasTransit', dwellDays: 9, shipDate: isoDaysAgo(9), country: '泰国', brand: 'KK', category: 'FRESH' },
      { containerNo: 'OV2', orderNo: 'YL-002', status: 'overseasTransit', dwellDays: 3, shipDate: isoDaysAgo(3), country: '越南', brand: 'YL', category: 'FRESH' },
      { containerNo: 'SH1', orderNo: 'KK-001', status: 'onShore', dwellDays: 5, shipDate: isoDaysAgo(12), arrivalDate: isoDaysAgo(5), country: '泰国', brand: 'KK', category: 'FROZEN', customsPort: '磨憨口岸' },
      { containerNo: 'DO1', orderNo: 'YL-002', status: 'domesticTransit', dwellDays: 4, shipDate: isoDaysAgo(11), arrivalDate: isoDaysAgo(6), domesticShipDate: isoDaysAgo(4), country: '越南', brand: 'YL', category: 'FRESH' },
      { containerNo: 'SG1', orderNo: 'KK-001', status: 'signed', shipDate: isoDaysAgo(12), arrivalDate: isoDaysAgo(8), domesticShipDate: isoDaysAgo(6), signedDate: isoDaysAgo(2), country: '泰国', brand: 'KK', category: 'FRESH' },
      { containerNo: 'SG2', orderNo: 'YL-002', status: 'signed', shipDate: isoDaysAgo(10), arrivalDate: isoDaysAgo(7), domesticShipDate: isoDaysAgo(5), signedDate: isoDaysAgo(1), country: '越南', brand: 'YL', category: 'FRESH' },
      { containerNo: 'OLD1', orderNo: 'KK-001', status: 'signed', shipDate: isoDaysAgo(18), arrivalDate: isoDaysAgo(16), domesticShipDate: isoDaysAgo(15), signedDate: isoDaysAgo(9), country: '泰国', brand: 'KK', category: 'FRESH' },
    ],
    overseasTransit: [
      { containerNo: 'OV1', status: 'overseasTransit', dwellDays: 9, shipDate: isoDaysAgo(9), country: '泰国' },
      { containerNo: 'OV2', status: 'overseasTransit', dwellDays: 3, shipDate: isoDaysAgo(3), country: '越南' },
    ],
    onShore: [
      { containerNo: 'SH1', status: 'onShore', dwellDays: 5, arrivalDate: isoDaysAgo(5) },
    ],
    domesticTransit: [
      { containerNo: 'DO1', status: 'domesticTransit', dwellDays: 4, domesticShipDate: isoDaysAgo(4) },
    ],
    signed: [
      { containerNo: 'SG1', status: 'signed', shipDate: isoDaysAgo(12), arrivalDate: isoDaysAgo(8), domesticShipDate: isoDaysAgo(6), signedDate: isoDaysAgo(2) },
      { containerNo: 'SG2', status: 'signed', shipDate: isoDaysAgo(10), arrivalDate: isoDaysAgo(7), domesticShipDate: isoDaysAgo(5), signedDate: isoDaysAgo(1) },
    ],
  },
  alerts: [
    { alertType: '国外在途偏久', containerNo: 'OV1', dwellDays: 9 },
    { alertType: '在岸待叫车', containerNo: 'SH1', dwellDays: 5 },
  ],
  breakdowns: {
    country: [{ key: '泰国', label: '泰国', shipped: 20 }, { key: '越南', label: '越南', shipped: 14 }],
    category: [{ key: 'FRESH', label: '鲜果', shipped: 28 }, { key: 'FROZEN', label: '冻果', shipped: 6 }],
    brand: [{ key: 'KK', label: 'KK', shipped: 16 }, { key: 'YL', label: 'YL', shipped: 9 }],
  },
};

const out = buildExecutiveOverview({ aggregate, flow });

assert.equal(out.headline.totalOrders, 2);
assert.equal(out.headline.totalBoxes, 40);
assert.equal(out.headline.shipped, 7);
assert.equal(out.headline.signed, 3);
assert.equal(out.headline.totalRisks, 6);
assert.equal(out.headline.healthRule.baseScore, 100);
assert.equal(out.headline.healthRule.highRiskDeduction, 12);
assert.equal(out.headline.healthRule.mediumRiskDeduction, 5);

assert.equal(out.efficiency.funnel.length, 4);
assert.equal(out.efficiency.funnel[1].label, '已发货');
assert.equal(out.efficiency.cycleTimes.avgOverseasDays, 3);
assert.equal(out.efficiency.cycleTimes.avgDomesticTransitDays, 4.7);

assert.equal(out.bottlenecks[0].key, 'overseasTransit');
assert.equal(out.bottlenecks[0].longestContainer, 'OV1');
assert.equal(out.bottlenecks[0].longestDays, 9);
assert.equal(out.bottlenecks[0].progressBasis, '占已发货柜比例');
assert.equal(out.bottlenecks[0].progressRate, Math.round((2 / 7) * 1000) / 10);

assert.equal(out.temperature.alarmCount, 2);
assert.equal(out.temperature.alarmRate, 3.3);
assert.equal(out.temperature.maxDeviation, 5);
assert.equal(out.temperature.topAlerts[0].containerNo, 'TCLU1');
assert.ok(out.temperature.details.length >= 3);
assert.ok(out.temperature.details.every(row => row.statusText));

assert.equal(out.structure.brandTop[0].label, 'KK');
assert.equal(out.news.items.length, 4);
assert.ok(out.health.score < 100);

assert.deepEqual(out.filters.countries.sort(), ['泰国', '越南']);
assert.ok(out.filters.factories.includes('KK'));
assert.ok(out.filters.containers.includes('OV1'));

assert.equal(out.comparisons.shipped7d.current, 1);
assert.equal(out.comparisons.shipped7d.previous, 5);
assert.equal(out.comparisons.shipped7d.direction, 'down');
assert.equal(out.comparisons.signed7d.current, 2);
assert.equal(out.comparisons.signed7d.previous, 1);
assert.equal(out.comparisons.signed7d.direction, 'up');

assert.equal(out.drilldowns.orders.rows.length, 2);
assert.equal(out.drilldowns.shipped.rows.length, 7);
assert.ok(out.drilldowns.shipped.rows.every(row => row.statusText));
assert.equal(out.drilldowns.bottlenecks.overseasTransit.rows[0].containerNo, 'OV1');
assert.ok(out.drilldowns.bottlenecks.overseasTransit.rows.every(row => row.statusText === '国外在途'));
assert.equal(out.drilldowns.bottlenecks.overseasTransit.rows[0].location, '泰国南部在途');
assert.equal(out.drilldowns.bottlenecks.overseasTransit.rows.find(row => row.containerNo === 'OV2').temperatureStatusText, '温度缺失');
assert.equal(out.drilldowns.bottlenecks.onShore.rows[0].location, '磨憨口岸');
assert.equal(out.drilldowns.bottlenecks.onShore.rows[0].temperatureStatusText, '');
assert.ok(out.drilldowns.risks.rows.some(row => row.type === '温度缺失' && row.containerNo === 'OV2'));
assert.ok(!out.drilldowns.risks.rows.some(row => row.type === '温度缺失' && row.containerNo === 'SH1'));
assert.ok(!out.drilldowns.risks.rows.some(row => row.type === '温度缺失' && row.containerNo === 'DO1'));
assert.equal(out.drilldowns.risks.rows.length, out.risks.length);
assert.equal(out.drilldowns.riskItems[0].rows.length, 1);
assert.equal(out.drilldowns.riskItems[1].rows.length, 1);
assert.ok(out.drilldowns.riskItems[0].columns.includes('statusText'));
assert.ok(out.drilldowns.temperatureDetails.rows.some(row => row.containerNo === 'TCLU1'));
assert.ok(out.drilldowns.temperatureByContainer.TCLU1.rows.every(row => row.containerNo === 'TCLU1'));
assert.equal(out.temperature.details.find(row => row.containerNo === 'TCLU2').status, 'WARN');
assert.equal(out.temperature.details.find(row => row.containerNo === 'TCLU2').statusText, '温度预警');
assert.deepEqual(out.temperature.gantt.rows.map(row => row.containerNo), ['OV1', 'TEMPONLY1', 'OV2']);
assert.equal(out.temperature.gantt.rows.find(row => row.containerNo === 'OV1').cells.at(-1).level, 'ok');
assert.equal(out.temperature.gantt.rows.find(row => row.containerNo === 'TEMPONLY1').cells.find(cell => cell.date === dateKey(isoDaysAgo(1))).level, 'ok');
assert.equal(out.temperature.gantt.rows.find(row => row.containerNo === 'TEMPONLY1').cells.at(-1).level, 'none');
assert.equal(out.temperature.gantt.rows.find(row => row.containerNo === 'OV2').cells.at(-1).level, 'missing');
assert.ok(!out.temperature.gantt.rows.some(row => ['SH1', 'DO1', 'TCLU1'].includes(row.containerNo)));
assert.equal(out.temperature.gantt.days.length, 7);

const filtered = buildExecutiveOverview({ aggregate, flow, filters: { country: '越南', factory: 'YL' } });
assert.equal(filtered.headline.totalOrders, 1);
assert.equal(filtered.headline.totalBoxes, 15);
assert.ok(filtered.drilldowns.shipped.rows.every(row => row.country === '越南'));

console.log('overview executive checks passed');
