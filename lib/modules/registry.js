const MODULES = [
  { code: 'overview', label: '运营总览', page: '/app-overview.html', legacyPermissions: [], legacyDashboardSections: ['summary'] },
  { code: 'orders', label: '订单看板', page: '/index.html#orders', legacyPermissions: ['orders'], legacyDashboardSections: ['th', 'vn'] },
  { code: 'flow', label: '货柜流向', page: '/index-flow.html', legacyPermissions: [], legacyDashboardSections: ['flow'] },
  { code: 'temperature', label: '温度监控', page: '/index-tv.html', legacyPermissions: [], legacyDashboardSections: ['gantt'] },
  { code: 'logistics', label: '物流监控', page: '/index.html#logistics', legacyPermissions: ['logistics'], legacyDashboardSections: ['logistics'] },
  { code: 'news', label: '行业新闻', page: '/index.html#news', legacyPermissions: ['news'], legacyDashboardSections: ['news'] },
  { code: 'smartsheet', label: '智能表管理', page: '/admin.html#smartsheet', legacyPermissions: ['smartsheet'], legacyDashboardSections: [] },
  { code: 'admin', label: '系统管理', page: '/admin.html#accounts', legacyPermissions: ['accounts'], legacyDashboardSections: [] },
];

const MODULE_CODES = MODULES.map(m => m.code);
const DASHBOARD_SECTION_CODES = ['overview', 'orders', 'flow', 'temperature', 'logistics', 'news'];

const LEGACY_PERMISSION_ALIASES = MODULES.reduce((acc, mod) => {
  acc[mod.code] = mod.code;
  (mod.legacyPermissions || []).forEach(key => { acc[key] = mod.code; });
  return acc;
}, {});

const LEGACY_DASHBOARD_ALIASES = MODULES.reduce((acc, mod) => {
  if (DASHBOARD_SECTION_CODES.includes(mod.code)) acc[mod.code] = mod.code;
  (mod.legacyDashboardSections || []).forEach(key => { acc[key] = mod.code; });
  return acc;
}, {});

function normalizeList(input) {
  let list = input;
  if (typeof input === 'string') {
    try { list = JSON.parse(input); } catch (_) { list = []; }
  }
  return Array.isArray(list) ? list : [];
}

function normalizeModulePermissions(role, permissions) {
  if (role === 'admin') return MODULE_CODES.slice();
  const out = [];
  normalizeList(permissions).forEach(key => {
    const normalized = LEGACY_PERMISSION_ALIASES[key];
    if (normalized && !out.includes(normalized)) out.push(normalized);
  });
  return out;
}

function normalizeDashboardSections(permissions) {
  if (permissions === undefined || permissions === null) return DASHBOARD_SECTION_CODES.slice();
  const out = [];
  normalizeList(permissions).forEach(key => {
    const normalized = LEGACY_DASHBOARD_ALIASES[key];
    if (normalized && DASHBOARD_SECTION_CODES.includes(normalized) && !out.includes(normalized)) out.push(normalized);
  });
  return out.length ? out : DASHBOARD_SECTION_CODES.slice();
}

function moduleByCode(code) {
  return MODULES.find(m => m.code === code) || null;
}

module.exports = {
  MODULES,
  MODULE_CODES,
  DASHBOARD_SECTION_CODES,
  LEGACY_PERMISSION_ALIASES,
  normalizeModulePermissions,
  normalizeDashboardSections,
  moduleByCode,
};
