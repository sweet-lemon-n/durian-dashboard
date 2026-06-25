# Modular Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a stable modular dashboard foundation with named modules, compatible permissions, and a new side-by-side overview page without replacing current production pages.

**Architecture:** Add a module registry as the single source of truth for page/module names and permission keys. Keep existing production pages and APIs intact, then introduce new side-route pages and gradually extract large `server.js` route groups into focused route modules. Use regression scripts for module permissions, dashboard statistics, and page script syntax.

**Tech Stack:** Node.js, Express, CommonJS modules, SQLite via `better-sqlite3`, native HTML/CSS/JavaScript, existing shell-based verification scripts.

## Global Constraints

- Keep existing `/index.html`, `/index-flow.html`, and `/admin.html` available and unchanged as production baseline unless a task explicitly says otherwise.
- New pages must use side-by-side paths such as `/app-overview.html` and must not replace current default routes in Phase 1.
- Module codes are exactly: `overview`, `orders`, `flow`, `temperature`, `logistics`, `news`, `smartsheet`, `admin`.
- Permission changes must be backward compatible with existing SQLite user data.
- Existing API paths must remain available; new modular API paths can be added as aliases or compatibility wrappers.
- Phase 1 must not redefine order, logistics, temperature, or flow statistics logic.
- Every task must run its listed verification before commit.
- Manual edits must use `apply_patch`.

---

## File Structure

Create these focused files:

- `lib/modules/registry.js`: single source of truth for module codes, labels, page paths, legacy permission aliases, and dashboard section mapping.
- `scripts/test-module-registry.js`: regression checks for module registry and permission normalization behavior.
- `public/app-overview.html`: new side-by-side operations overview page.
- `scripts/test-page-syntax.js`: reusable script syntax checker for HTML pages.
- `lib/routes/auth-routes.js`: extracted login, logout, and current-user routes.
- `lib/routes/user-routes.js`: extracted user management routes.

Modify these existing files:

- `lib/db.js`: use module registry for permission constants and legacy aliases.
- `lib/auth.js`: optionally use registry-backed permission checks after `db.js` exposes normalized values.
- `server.js`: mount extracted route modules while preserving route behavior.
- `public/admin.html`: update permission display copy only if needed to show `admin` instead of legacy `accounts`.
- `MEMORY.md`: record long-term module naming and stability policy.
- `TASKS.md`: track modularization progress.
- `AGENTS.md`: optionally document module names if they become stable after implementation.

---

### Task 1: Module Registry and Permission Compatibility

**Files:**
- Create: `lib/modules/registry.js`
- Create: `scripts/test-module-registry.js`
- Modify: `lib/db.js`
- Modify: `MEMORY.md`
- Modify: `TASKS.md`

**Interfaces:**
- Produces: `MODULES`, `MODULE_CODES`, `DASHBOARD_SECTION_CODES`, `LEGACY_PERMISSION_ALIASES`, `normalizeModulePermissions(role, permissions)`, `normalizeDashboardSections(permissions)` from `lib/modules/registry.js`.
- Consumes: existing `normalizePermissions`, `stringifyPermissions`, `normalizeDashboardPermissions`, `stringifyDashboardPermissions` exports from `lib/db.js`; these names must remain exported for existing callers.

- [ ] **Step 1: Write failing registry test**

Create `scripts/test-module-registry.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-module-registry.js
```

Expected: FAIL with `Cannot find module '../lib/modules/registry'`.

- [ ] **Step 3: Add module registry**

Create `lib/modules/registry.js`:

```js
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
```

- [ ] **Step 4: Update `lib/db.js` permission constants**

Modify the top of `lib/db.js` to import registry values:

```js
const {
  MODULE_CODES,
  DASHBOARD_SECTION_CODES,
  normalizeModulePermissions,
  normalizeDashboardSections,
} = require('./modules/registry');
```

Replace:

```js
const MODULE_PERMISSIONS = ['orders', 'logistics', 'news', 'smartsheet', 'accounts'];
const DASHBOARD_SECTIONS = ['summary', 'th', 'vn', 'logistics', 'news', 'gantt'];
```

With:

```js
const MODULE_PERMISSIONS = MODULE_CODES;
const DASHBOARD_SECTIONS = DASHBOARD_SECTION_CODES;
```

Replace `normalizePermissions` with:

```js
function normalizePermissions(role, permissions) {
  return normalizeModulePermissions(role, permissions);
}
```

Replace `normalizeDashboardPermissions` with:

```js
function normalizeDashboardPermissions(permissions) {
  return normalizeDashboardSections(permissions);
}
```

Keep exported function names unchanged.

- [ ] **Step 5: Run registry test**

Run:

```bash
node scripts/test-module-registry.js
```

Expected: PASS with `module registry checks passed`.

- [ ] **Step 6: Run existing dashboard regression**

Run:

```bash
node scripts/test-dashboard-logic.js
```

Expected: PASS with `dashboard logic checks passed`.

- [ ] **Step 7: Update docs**

Add this section to `MEMORY.md` under “已确认的设计方案”:

```md
### 模块命名与旁路重构

项目后续按业务英文模块代号组织页面、权限和接口：`overview`、`orders`、`flow`、`temperature`、`logistics`、`news`、`smartsheet`、`admin`。

现有生产页面先保留，新页面使用 `/app-*.html` 旁路上线。验证稳定后再替换入口，避免重构影响已投入使用的看板。
```

Add this item to `TASKS.md` 当前任务:

```md
- [ ] `P1` 第一阶段模块化重构：建立模块命名、旁路总览页面、权限兼容和路由拆分。
```

- [ ] **Step 8: Syntax and diff checks**

Run:

```bash
node --check lib/db.js
node --check lib/modules/registry.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 9: Commit**

```bash
git add lib/modules/registry.js lib/db.js scripts/test-module-registry.js MEMORY.md TASKS.md
git commit -m "Add dashboard module registry"
```

---

### Task 2: Dashboard Visibility Compatibility

**Files:**
- Modify: `lib/board-routes.js`
- Modify: `scripts/test-module-registry.js`

**Interfaces:**
- Consumes: `normalizeDashboardPermissions()` now returns module codes.
- Produces: `GET /api/aggregate` must still expose legacy response fields `global`, `th`, `vn`, `logistics`, `news`, and `visibility` for existing pages.

- [ ] **Step 1: Add failing visibility assertions**

Append to `scripts/test-module-registry.js`:

```js
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
```

- [ ] **Step 2: Run test to verify it fails**

Run:

```bash
node scripts/test-module-registry.js
```

Expected: FAIL because `dashboardVisibility` is not exported or does not include new module keys.

- [ ] **Step 3: Update visibility mapping**

In `lib/board-routes.js`, replace `dashboardVisibility` with:

```js
function dashboardVisibility(user) {
  const allowed = new Set(normalizeDashboardPermissions(user && user.dashboardPermissions));
  const orders = allowed.has('orders');
  const temperature = allowed.has('temperature');
  return {
    summary: allowed.has('overview'),
    th: orders,
    vn: orders,
    logistics: allowed.has('logistics'),
    news: allowed.has('news'),
    gantt: temperature,
    overview: allowed.has('overview'),
    orders,
    flow: allowed.has('flow'),
    temperature,
  };
}
```

At the bottom export block of `lib/board-routes.js`, ensure it exports both router and helper:

```js
module.exports = {
  router,
  dashboardVisibility,
};
```

If the file already has `module.exports = { router };`, replace it with the block above.

- [ ] **Step 4: Run tests**

Run:

```bash
node scripts/test-module-registry.js
node scripts/test-dashboard-logic.js
```

Expected: both pass.

- [ ] **Step 5: Syntax and diff checks**

Run:

```bash
node --check lib/board-routes.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add lib/board-routes.js scripts/test-module-registry.js
git commit -m "Keep dashboard visibility compatible with modules"
```

---

### Task 3: Reusable HTML Script Syntax Checker

**Files:**
- Create: `scripts/test-page-syntax.js`

**Interfaces:**
- Produces: CLI script `node scripts/test-page-syntax.js <html...>` that checks all inline `<script>` blocks with `new Function`.

- [ ] **Step 1: Create syntax checker**

Create `scripts/test-page-syntax.js`:

```js
const fs = require('fs');

const files = process.argv.slice(2);
if (!files.length) {
  console.error('Usage: node scripts/test-page-syntax.js <html-file> [...html-file]');
  process.exit(1);
}

let checked = 0;
for (const file of files) {
  const html = fs.readFileSync(file, 'utf8');
  const scripts = [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)];
  scripts.forEach((match, index) => {
    try {
      new Function(match[1]);
      checked += 1;
    } catch (err) {
      err.message = `${file} inline script #${index + 1}: ${err.message}`;
      throw err;
    }
  });
}

console.log(`page syntax checks passed (${checked} scripts)`);
```

- [ ] **Step 2: Run checker on existing pages**

Run:

```bash
node scripts/test-page-syntax.js public/index.html public/index-flow.html public/admin.html public/login.html
```

Expected: PASS with `page syntax checks passed`.

- [ ] **Step 3: Syntax and diff checks**

Run:

```bash
node --check scripts/test-page-syntax.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Commit**

```bash
git add scripts/test-page-syntax.js
git commit -m "Add reusable page syntax check"
```

---

### Task 4: New Side-by-Side Overview Page

**Files:**
- Create: `public/app-overview.html`
- Modify: `TASKS.md`

**Interfaces:**
- Consumes: `GET /api/auth/me`, `GET /api/aggregate`.
- Produces: static page `/app-overview.html` that displays module cards for `overview`, `orders`, `flow`, `temperature`, `logistics`, `news`, `smartsheet`, `admin` and links to existing pages.

- [ ] **Step 1: Create page with API-driven module cards**

Create `public/app-overview.html`:

```html
<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>运营总览</title>
  <style>
    :root{--bg:#f6f7f9;--panel:#fff;--text:#17202a;--muted:#667085;--line:#d9dee7;--accent:#1f7a5f;--warn:#b42318}
    *{box-sizing:border-box}
    body{margin:0;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text)}
    header{height:64px;display:flex;align-items:center;justify-content:space-between;padding:0 28px;border-bottom:1px solid var(--line);background:var(--panel)}
    h1{font-size:20px;margin:0;font-weight:700;letter-spacing:0}
    main{max-width:1280px;margin:0 auto;padding:24px}
    .meta{display:flex;gap:12px;color:var(--muted);font-size:13px}
    .grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:14px}
    .card{display:block;min-height:154px;padding:18px;border:1px solid var(--line);border-radius:8px;background:var(--panel);text-decoration:none;color:inherit}
    .card:hover{border-color:var(--accent)}
    .code{font-size:12px;color:var(--muted);font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
    .name{margin-top:8px;font-size:18px;font-weight:700}
    .value{margin-top:16px;font-size:28px;font-weight:800}
    .hint{margin-top:6px;color:var(--muted);font-size:13px;line-height:1.5}
    .disabled{opacity:.48;pointer-events:none}
    .toolbar{display:flex;align-items:center;justify-content:space-between;margin-bottom:18px}
    .status{font-size:13px;color:var(--muted)}
    .error{color:var(--warn)}
    @media (max-width:1000px){.grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
    @media (max-width:620px){header{padding:0 16px}.grid{grid-template-columns:1fr}main{padding:16px}.meta{display:none}}
  </style>
</head>
<body>
  <header>
    <h1>运营总览</h1>
    <div class="meta"><span id="userName">-</span><span id="generatedAt">加载中</span></div>
  </header>
  <main>
    <div class="toolbar">
      <div class="status" id="statusText">正在加载看板数据</div>
      <div class="status">新总览旁路页面</div>
    </div>
    <section class="grid" id="moduleGrid"></section>
  </main>
  <script>
    const modules=[
      {code:'overview',name:'运营总览',href:'/app-overview.html',metric:'总柜数',value:d=>d.global&&d.global.totalBoxes,hint:'核心指标与模块入口'},
      {code:'orders',name:'订单看板',href:'/index.html',metric:'总订单',value:d=>d.global&&d.global.totalOrders,hint:'国家、工厂、品类、柜数概览'},
      {code:'flow',name:'货柜流向',href:'/index-flow.html',metric:'已发货',value:d=>d.global&&d.global.totalBoxes-d.global.totalPending,hint:'从总柜数到签收的流转'},
      {code:'temperature',name:'温度监控',href:'/index-tv.html',metric:'温度图',value:()=>'-',hint:'温度记录、异常和甘特图'},
      {code:'logistics',name:'物流监控',href:'/index.html#logistics',metric:'在途批次',value:d=>d.logistics&&d.logistics.kpis&&d.logistics.kpis.inTransit,hint:'在途、到岸、关口滞留和催办'},
      {code:'news',name:'行业新闻',href:'/index.html#news',metric:'新闻数',value:d=>d.news&&d.news.auto&&d.news.auto.length,hint:'榴莲行业新闻与来源诊断'},
      {code:'smartsheet',name:'智能表管理',href:'/admin.html#smartsheet',metric:'数据源',value:()=> '企微',hint:'字段、记录、AI 录入'},
      {code:'admin',name:'系统管理',href:'/admin.html#accounts',metric:'权限',value:()=> '配置',hint:'用户、权限和系统设置'}
    ];
    const $=id=>document.getElementById(id);
    const esc=s=>String(s==null?'-':s).replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
    async function api(path){const r=await fetch(path,{cache:'no-store'});if(r.status===401){location.href='/login?redirect=/app-overview.html';throw new Error('未登录')}const j=await r.json();if(!r.ok)throw new Error(j.error||'加载失败');return j.data||j}
    function allowed(me,mod){if(me.role==='admin')return true;const p=me.permissions||[],d=me.dashboardPermissions||[];return p.includes(mod.code)||d.includes(mod.code)}
    function render(me,data){$('userName').textContent=me.displayName||me.username||'-';$('generatedAt').textContent=data.generatedAt?new Date(data.generatedAt).toLocaleString('zh-CN'):'-';$('moduleGrid').innerHTML=modules.map(mod=>{const ok=allowed(me,mod);const raw=mod.value(data);return `<a class="card ${ok?'':'disabled'}" href="${esc(mod.href)}" aria-disabled="${ok?'false':'true'}"><div class="code">${esc(mod.code)}</div><div class="name">${esc(mod.name)}</div><div class="value">${esc(raw==null?'-':raw)}</div><div class="hint">${esc(mod.metric)} · ${esc(mod.hint)}</div></a>`}).join('');$('statusText').textContent='数据已加载'}
    async function init(){try{const [me,data]=await Promise.all([api('/api/auth/me'),api('/api/aggregate')]);render(me,data)}catch(e){$('statusText').textContent=e.message;$('statusText').classList.add('error')}}
    init();
  </script>
</body>
</html>
```

- [ ] **Step 2: Run page syntax check**

Run:

```bash
node scripts/test-page-syntax.js public/app-overview.html
```

Expected: PASS with `page syntax checks passed (1 scripts)`.

- [ ] **Step 3: Run broader checks**

Run:

```bash
node scripts/test-module-registry.js
node scripts/test-dashboard-logic.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 4: Update task tracker**

In `TASKS.md`, add to 已完成事项:

```md
- [x] `P1` 新增旁路运营总览页面 `/app-overview.html`，不替换现有生产入口。
```

- [ ] **Step 5: Commit**

```bash
git add public/app-overview.html TASKS.md
git commit -m "Add side-by-side overview page"
```

---

### Task 5: Extract Auth Routes from `server.js`

**Files:**
- Create: `lib/routes/auth-routes.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `generateToken`, `setAuthCookie`, `clearAuthCookie`, `requireAuth` from `lib/auth.js`; `getDb`, `normalizePermissions`, `normalizeDashboardPermissions` from `lib/db.js`.
- Produces: `createAuthRouter()` returning an Express router with `POST /auth/login`, `POST /auth/logout`, and `GET /auth/me`.

- [ ] **Step 1: Create auth route module**

Create `lib/routes/auth-routes.js`:

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const {
  generateToken,
  setAuthCookie,
  clearAuthCookie,
} = require('../auth');
const {
  getDb,
  normalizePermissions,
  normalizeDashboardPermissions,
} = require('../db');

function publicCurrentUser(user) {
  return {
    username: user.username,
    displayName: user.displayName,
    role: user.role,
    permissions: user.permissions || [],
    dashboardPermissions: user.dashboardPermissions || [],
  };
}

function createAuthRouter() {
  const router = express.Router();

  router.post('/login', async (req, res) => {
    try {
      const { username, password, rememberMe } = req.body || {};
      if (!username || !password) {
        return res.status(400).json({ success: false, error: '请输入用户名和密码' });
      }

      const db = getDb();
      const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
      if (!user || !user.is_active) {
        return res.status(401).json({ success: false, error: user ? '账号已被禁用，请联系管理员' : '用户名或密码错误' });
      }

      const valid = await bcrypt.compare(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ success: false, error: '用户名或密码错误' });
      }

      const token = generateToken(user, !!rememberMe);
      setAuthCookie(res, token, !!rememberMe);

      res.json({
        success: true,
        data: {
          username: user.username,
          displayName: user.display_name,
          role: user.role,
          permissions: normalizePermissions(user.role, user.permissions),
          dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
        },
      });
    } catch (err) {
      console.error('[auth/login] 错误:', err);
      res.status(500).json({ success: false, error: '登录服务异常' });
    }
  });

  router.post('/logout', (req, res) => {
    clearAuthCookie(res);
    res.json({ success: true, message: '已退出登录' });
  });

  router.get('/me', (req, res) => {
    res.json({ success: true, data: publicCurrentUser(req.user) });
  });

  return router;
}

module.exports = {
  createAuthRouter,
  publicCurrentUser,
};
```

- [ ] **Step 2: Modify `server.js` imports and mounting**

Add import near route imports:

```js
const { createAuthRouter } = require('./lib/routes/auth-routes');
```

Mount before the `/api` auth guard:

```js
app.use('/api/auth', createAuthRouter());
```

Remove the inline `app.post('/api/auth/login'...)`, `app.post('/api/auth/logout'...)`, and `app.get('/api/auth/me'...)` blocks from `server.js`.

Keep the existing `/api` guard:

```js
app.use('/api', (req, res, next) => {
  if (req.path === '/auth/login' || req.path === '/auth/logout') return next();
  requireAuth(req, res, next);
});
```

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check server.js
node --check lib/routes/auth-routes.js
```

Expected: both exit 0.

- [ ] **Step 4: Run regressions**

Run:

```bash
node scripts/test-module-registry.js
node scripts/test-dashboard-logic.js
node scripts/test-page-syntax.js public/app-overview.html public/login.html
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add server.js lib/routes/auth-routes.js
git commit -m "Extract auth routes"
```

---

### Task 6: Extract User Management Routes

**Files:**
- Create: `lib/routes/user-routes.js`
- Modify: `server.js`

**Interfaces:**
- Consumes: `requireRole('admin')` middleware from `lib/auth.js`.
- Produces: `createUserRouter()` returning routes for `/api/users`.

- [ ] **Step 1: Create user route module**

Create `lib/routes/user-routes.js`:

```js
const express = require('express');
const bcrypt = require('bcryptjs');
const {
  getDb,
  createUser,
  updateUser,
  listUsers,
  incrementTokenVersion,
  normalizePermissions,
  stringifyPermissions,
  normalizeDashboardPermissions,
  stringifyDashboardPermissions,
} = require('../db');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isActive: !!user.is_active,
    tokenVersion: user.token_version,
    permissions: normalizePermissions(user.role, user.permissions),
    dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function getUserByIdSafe(db, id) {
  return db.prepare(
    'SELECT id, username, display_name, role, is_active, token_version, permissions, dashboard_permissions, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);
}

function createUserRouter() {
  const router = express.Router();

  router.get('/', (req, res) => {
    const users = listUsers(getDb()).map(user => ({
      id: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      isActive: !!user.is_active,
      tokenVersion: user.token_version,
      permissions: user.permissions,
      dashboardPermissions: user.dashboardPermissions,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    }));
    res.json({ success: true, data: users });
  });

  router.post('/', async (req, res) => {
    try {
      const { username, password, displayName, role, permissions, dashboardPermissions } = req.body || {};
      const cleanUsername = String(username || '').trim();
      if (!cleanUsername || !password) {
        return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
      }

      const db = getDb();
      const created = await createUser(db, {
        username: cleanUsername,
        password,
        displayName: String(displayName || cleanUsername).trim(),
        role: role === 'admin' ? 'admin' : 'viewer',
        permissions,
        dashboardPermissions,
      });
      res.status(201).json({ success: true, data: publicUser(getUserByIdSafe(db, created.id)) });
    } catch (err) {
      const isDuplicate = /UNIQUE constraint failed/.test(err.message);
      res.status(isDuplicate ? 409 : 500).json({
        success: false,
        error: isDuplicate ? '用户名已存在' : err.message,
      });
    }
  });

  router.put('/:id', (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, error: '用户 ID 不正确' });
    }

    const db = getDb();
    const existing = getUserByIdSafe(db, userId);
    if (!existing) return res.status(404).json({ success: false, error: '账号不存在' });

    const role = req.body.role === 'admin' ? 'admin' : 'viewer';
    const isActive = req.body.isActive === undefined ? !!existing.is_active : !!req.body.isActive;
    if (userId === req.user.userId && role !== 'admin') {
      return res.status(400).json({ success: false, error: '不能取消当前登录账号的管理员身份' });
    }
    if (userId === req.user.userId && !isActive) {
      return res.status(400).json({ success: false, error: '不能禁用当前登录账号' });
    }

    const fields = {
      display_name: String(req.body.displayName || existing.display_name || existing.username).trim(),
      role,
      is_active: isActive ? 1 : 0,
      permissions: stringifyPermissions(role, req.body.permissions),
      dashboard_permissions: stringifyDashboardPermissions(req.body.dashboardPermissions),
    };
    updateUser(db, userId, fields);
    if (role !== existing.role || isActive !== !!existing.is_active || fields.permissions !== existing.permissions) {
      incrementTokenVersion(db, userId);
    }
    res.json({ success: true, data: publicUser(getUserByIdSafe(db, userId)) });
  });

  router.post('/:id/password', async (req, res) => {
    try {
      const userId = Number(req.params.id);
      const password = req.body && req.body.password;
      if (!Number.isInteger(userId) || !password) {
        return res.status(400).json({ success: false, error: '用户 ID 或新密码不能为空' });
      }

      const db = getDb();
      if (!getUserByIdSafe(db, userId)) return res.status(404).json({ success: false, error: '账号不存在' });
      const passwordHash = await bcrypt.hash(password, 12);
      updateUser(db, userId, { password_hash: passwordHash });
      incrementTokenVersion(db, userId);
      res.json({ success: true, message: '密码已重置' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  router.delete('/:id', (req, res) => {
    const userId = Number(req.params.id);
    if (!Number.isInteger(userId)) {
      return res.status(400).json({ success: false, error: '用户 ID 不正确' });
    }
    if (userId === req.user.userId) {
      return res.status(400).json({ success: false, error: '不能删除当前登录账号' });
    }

    const db = getDb();
    const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
    if (!result.changes) return res.status(404).json({ success: false, error: '账号不存在' });
    res.json({ success: true, message: '账号已删除' });
  });

  return router;
}

module.exports = {
  createUserRouter,
  publicUser,
};
```

- [ ] **Step 2: Modify `server.js`**

Add import:

```js
const { createUserRouter } = require('./lib/routes/user-routes');
```

After the `/api` auth guard and before other API route declarations, mount:

```js
app.use('/api/users', requireRole('admin'), createUserRouter());
```

Remove inline user management helper functions and routes from `server.js`:

- `const canManageAccounts = requireRole('admin');`
- `publicUser`
- `getUserByIdSafe`
- `app.get('/api/users'...)`
- `app.post('/api/users'...)`
- `app.put('/api/users/:id'...)`
- `app.post('/api/users/:id/password'...)`
- `app.delete('/api/users/:id'...)`

- [ ] **Step 3: Run syntax checks**

Run:

```bash
node --check server.js
node --check lib/routes/user-routes.js
```

Expected: both exit 0.

- [ ] **Step 4: Run regressions**

Run:

```bash
node scripts/test-module-registry.js
node scripts/test-dashboard-logic.js
node scripts/test-page-syntax.js public/app-overview.html public/admin.html public/login.html
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 5: Commit**

```bash
git add server.js lib/routes/user-routes.js
git commit -m "Extract user management routes"
```

---

### Task 7: Final Verification and Documentation

**Files:**
- Modify: `TASKS.md`
- Modify: `docs/superpowers/specs/2026-06-25-modular-dashboard-design.md` if implementation discoveries require clarification.

**Interfaces:**
- Consumes: all previous tasks.
- Produces: verified Phase 1 modular foundation ready for production pull.

- [ ] **Step 1: Run full available verification**

Run:

```bash
node scripts/test-module-registry.js
node scripts/test-dashboard-logic.js
node scripts/test-page-syntax.js public/index.html public/index-flow.html public/admin.html public/login.html public/app-overview.html
node --check server.js
node --check lib/db.js
node --check lib/auth.js
node --check lib/board-routes.js
node --check lib/modules/registry.js
node --check lib/routes/auth-routes.js
node --check lib/routes/user-routes.js
git diff --check
```

Expected: all commands exit 0.

- [ ] **Step 2: Update task tracker**

In `TASKS.md`, mark the Phase 1 modularization current task complete and add these follow-up items under 待办事项:

```md
- [ ] `P1` 第二阶段模块化重构：拆分 `flow`、`logistics`、`temperature` 的详细路由和页面别名。
- [ ] `P2` 生产验证 `/app-overview.html`，确认新总览入口在不同账号权限下展示正确。
```

- [ ] **Step 3: Final diff review**

Run:

```bash
git status --short
git diff --stat HEAD
```

Expected: only documentation/task tracker changes should be unstaged after prior task commits.

- [ ] **Step 4: Commit**

```bash
git add TASKS.md docs/superpowers/specs/2026-06-25-modular-dashboard-design.md
git commit -m "Document modular dashboard rollout"
```

- [ ] **Step 5: Push when user requests deployment**

Only after user confirms push:

```bash
git push origin main
```

Expected: remote `main` updates successfully.

---

## Self-Review Notes

- Spec coverage: the plan covers module naming, stable old pages, side-by-side overview, permission compatibility, route extraction, testing, and docs.
- Scope control: the plan does not rewrite all detailed dashboards and does not replace `/index.html`.
- Compatibility: old route names and exported db helper names remain available.
- Risk: route extraction tasks must remove only the exact inline route blocks listed; unrelated `server.js` smart sheet and AI import routes stay in place for Phase 1.
