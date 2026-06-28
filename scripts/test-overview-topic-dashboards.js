const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');

[
  "key:'fulfillment'",
  "key:'logistics'",
  "key:'temperature'",
  "key:'orders'",
  "key:'risks'",
  "key:'news'",
].forEach(marker => {
  assert.ok(html.includes(marker), `topic dashboard config must include ${marker}`);
});

[
  'function currentBoardKey',
  'function buildBoardUrl',
  'function renderTopicShell',
  'function renderTopicDashboard',
  'function renderFulfillmentDashboard',
  'function renderLogisticsDashboard',
  'function renderTemperatureDashboard',
  'function renderOrdersDashboard',
  'function renderRisksDashboard',
  'function renderNewsDashboard',
].forEach(marker => {
  assert.ok(html.includes(marker), `overview topic dashboards must contain ${marker}`);
});

[
  'class="topic-shell"',
  'class="topic-nav"',
  '返回总览',
  '进入看板',
  'data-board-link="fulfillment"',
  'data-board-link="logistics"',
  'data-board-link="temperature"',
  'data-board-link="orders"',
  'data-board-link="risks"',
  'data-board-link="news"',
].forEach(marker => {
  assert.ok(html.includes(marker), `topic dashboard UI must contain ${marker}`);
});

assert.ok(
  /new URLSearchParams\(location\.search\)/.test(html),
  'topic dashboard mode must be driven by URL search parameters'
);

console.log('overview topic dashboard checks passed');
