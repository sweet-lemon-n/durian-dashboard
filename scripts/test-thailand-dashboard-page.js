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
['logisticsPanel', 'temperaturePanel', 'ganttGrid', 'stage-grid', 'status-section'].forEach(marker => {
  assert.ok(html.includes(marker), `Thailand dashboard should contain ${marker}`);
});
['orderPanel', 'newsPanel', 'riskPanel', 'orderChartPanel', 'moduleDock'].forEach(marker => {
  assert.ok(!html.includes(marker), `Thailand dashboard should not include ${marker}`);
});
['国外在途', '口岸等待', '国内在途', '柜号', '位置', '停留'].forEach(copy => {
  assert.ok(html.includes(copy), `Thailand dashboard should show ${copy}`);
});
assert.ok(
  /function activeTransitRows/.test(html) && /function locationText/.test(html),
  'Thailand dashboard should derive active transit rows with location text'
);
assert.ok(
  /function renderTemperature/.test(html) && /gantt-cell/.test(html),
  'Thailand dashboard should render a temperature gantt chart'
);
assert.ok(
  /setInterval\(load,\s*60000\)/.test(html),
  'Thailand dashboard should auto-refresh'
);

console.log('thailand dashboard page checks passed');
