const assert = require('assert');
const registry = require('../lib/modules/registry');
const {
  normalizePermissions,
  stringifyPermissions,
  normalizeDashboardPermissions,
  stringifyDashboardPermissions,
} = require('../lib/db');

const expectedModules = ['overview', 'orders', 'flow', 'temperature', 'logistics', 'news', 'smartsheet', 'admin'];
assert.deepStrictEqual(registry.MODULE_CODES, expectedModules, 'module codes must stay stable');

const adminPerms = normalizePermissions('admin', []);
assert.deepStrictEqual(adminPerms, expectedModules, 'admin role must receive every module permission');

const viewerPerms = normalizePermissions('viewer', ['orders', 'accounts', 'bad-key', 'news']);
assert.deepStrictEqual(viewerPerms, ['orders', 'admin', 'news'], 'legacy accounts must normalize to admin and invalid keys must be removed');

const stringified = stringifyPermissions('viewer', ['accounts', 'flow']);
assert.strictEqual(stringified, JSON.stringify(['admin', 'flow']), 'stringifyPermissions must persist normalized module codes');

const defaultDash = normalizeDashboardPermissions(undefined);
assert.deepStrictEqual(defaultDash, ['overview', 'orders', 'flow', 'temperature', 'logistics', 'news'], 'default dashboard sections must use module codes');

const legacyDash = normalizeDashboardPermissions(['summary', 'th', 'vn', 'logistics', 'gantt']);
assert.deepStrictEqual(legacyDash, ['overview', 'orders', 'logistics', 'temperature'], 'legacy dashboard sections must map to new module codes');

const dashString = stringifyDashboardPermissions(['summary', 'flow']);
assert.strictEqual(dashString, JSON.stringify(['overview', 'flow']), 'dashboard permissions must persist normalized section codes');

console.log('module registry checks passed');

// ---------- Task 2 可见性兼容 ----------
const { dashboardVisibility } = require('../lib/board-routes');

const visibility = dashboardVisibility({
  dashboardPermissions: ['overview', 'orders', 'logistics', 'temperature'],
});
assert.deepStrictEqual(visibility, {
  summary: true,
  th: true,
  vn: true,
  logistics: true,
  news: false,
  gantt: true,
  overview: true,
  orders: true,
  flow: false,
  temperature: true,
}, 'visibility must expose both legacy section names and new module names');

console.log('module registry checks passed');
