const assert = require('assert');
const { buildExecutiveOverview } = require('../lib/overview-executive');

const now = Date.now();
const day = 86400000;
const isoDaysAgo = days => new Date(now - days * day).toISOString();

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
      { container: 'TCLU2', status: 'WARN', setTemp: 5, returnTemp: 7.4, note: '注意' },
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
  details: {
    shipped: [],
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

assert.equal(out.headline.totalOrders, 12);
assert.equal(out.headline.totalBoxes, 40);
assert.equal(out.headline.shipped, 34);
assert.equal(out.headline.signed, 15);
assert.equal(out.headline.totalRisks, 5);

assert.equal(out.efficiency.funnel.length, 4);
assert.equal(out.efficiency.funnel[1].label, '已发货');
assert.equal(out.efficiency.cycleTimes.avgOverseasDays, 3.5);
assert.equal(out.efficiency.cycleTimes.avgDomesticTransitDays, 4);

assert.equal(out.bottlenecks[0].key, 'overseasTransit');
assert.equal(out.bottlenecks[0].longestContainer, 'OV1');
assert.equal(out.bottlenecks[0].longestDays, 9);

assert.equal(out.temperature.alarmCount, 2);
assert.equal(out.temperature.alarmRate, 3.3);
assert.equal(out.temperature.maxDeviation, 5);
assert.equal(out.temperature.topAlerts[0].containerNo, 'TCLU1');

assert.equal(out.structure.brandTop[0].label, 'KK');
assert.equal(out.news.items.length, 3);
assert.ok(out.health.score < 100);

console.log('overview executive checks passed');
