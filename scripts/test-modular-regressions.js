const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const admin = fs.readFileSync('public/admin.html', 'utf8');

assert.ok(
  fs.existsSync('scripts/test-page-syntax.js'),
  'reusable page syntax checker must exist'
);

assert.ok(
  /app\.post\('\/callback'[\s\S]*console\.log\('\[callback\] 收到 POST 推送'/.test(server)
    && /app\.post\('\/callback'[\s\S]*res\.send\('success'\)/.test(server),
  'POST /callback must acknowledge WeCom push with plain success'
);

assert.ok(
  !/app\.get\('\/api\/auth\/me'/.test(server),
  'server.js must not keep a stale inline /api/auth/me route after auth route extraction'
);

assert.ok(
  /admin:'系统管理'/.test(admin) && !/accounts:'账号管理'/.test(admin),
  'admin permission UI must use admin module key instead of legacy accounts key'
);

assert.ok(
  /overview:'运营总览'/.test(admin)
    && /orders:'订单看板'/.test(admin)
    && /flow:'货柜流向'/.test(admin)
    && /temperature:'温度监控'/.test(admin),
  'dashboard permission UI must expose new module keys'
);

const overview = fs.readFileSync('public/app-overview.html', 'utf8');

[
  'id="kpiStrip"',
  'id="flowPanel"',
  'id="riskPanel"',
  'id="orderChartPanel"',
  'id="logisticsChartPanel"',
  'id="temperaturePanel"',
  'id="newsPanel"',
  'id="moduleDock"',
  'function buildViewModel',
  'function renderKpis',
  'function renderFlow',
  'function renderOrderChart',
  'function renderLogisticsChart',
  'function renderTemperature',
  'function renderNews',
  'function renderRisks',
  'function renderModules',
].forEach(marker => {
  assert.ok(overview.includes(marker), `app-overview must contain ${marker}`);
});

[
  '/api/auth/me',
  '/api/aggregate',
  '/api/flow-dashboard',
  '/api/dashboard?hours=168&limit=500',
].forEach(path => {
  assert.ok(overview.includes(path), `app-overview must consume existing API ${path}`);
});

[
  'class="bar-chart"',
  'class="donut-chart"',
  'class="sparkline"',
  'class="mini-gantt"',
].forEach(marker => {
  assert.ok(overview.includes(marker), `app-overview must render multi-dimensional chart marker ${marker}`);
});

assert.ok(!overview.includes('/api/modules/'), 'overview redesign must not depend on new modular APIs');
assert.ok(!overview.includes('fonts.googleapis.com'), 'overview redesign must not depend on remote fonts');

console.log('modular regression checks passed');
