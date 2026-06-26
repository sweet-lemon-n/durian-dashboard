const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-thailand.html', 'utf8');

assert.ok(
  /<title>泰国运输大屏/.test(html),
  'Thailand dashboard should have a dedicated title'
);
assert.ok(
  /country=%E6%B3%B0%E5%9B%BD/.test(html) || /country=泰国/.test(html),
  'Thailand dashboard should request overview data with fixed Thailand country filter'
);
['orderPanel', 'logisticsPanel', 'temperaturePanel', 'ganttGrid'].forEach(marker => {
  assert.ok(html.includes(marker), `Thailand dashboard should contain ${marker}`);
});
['newsPanel', 'riskPanel', 'orderChartPanel', 'moduleDock'].forEach(marker => {
  assert.ok(!html.includes(marker), `Thailand dashboard should not include ${marker}`);
});
assert.ok(
  /function renderTemperature/.test(html) && /gantt-cell/.test(html),
  'Thailand dashboard should render a temperature gantt chart'
);
assert.ok(
  /setInterval\(load,\s*60000\)/.test(html),
  'Thailand dashboard should auto-refresh'
);

console.log('thailand dashboard page checks passed');
