# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

榴莲运输温度监控看板 — A data management dashboard for durian fruit shipping. The backend reads/writes data via WeChat Work (企业微信) Smart Sheet API, serving two frontends: a TV-style delivery-overview dashboard and an admin panel.

**Tech stack:** Node.js + Express (backend), vanilla HTML/CSS/JS (frontend), SQLite (auth DB), JSON file (editable board content), `xlsx` for one-off Excel imports. Deployed on Tencent Cloud Ubuntu Lighthouse server.

**Auth system:** JWT-based login with httpOnly cookies. `lib/db.js` (SQLite via better-sqlite3) and `lib/auth.js` (JWT + middleware). Two roles: `admin` (full access) and `viewer` (read-only). All `/api/*` routes require authentication; write/manage routes additionally require `admin` role. Login page at `/login`.

**Two data sources — keep them straight:**
1. **企业微信 Smart Sheet** (`DOCID` in `.env`) — the *real* shipping/temperature data. Read via `lib/wecom.js`. Requires IP whitelist (see bottom).
2. **`data/board-content.json`** (`lib/content-store.js`) — editable *placeholder* content for the redesigned dashboard's order/news/country/logistics sections, which the real sheet does not yet model. Seeded on first run, edited from the admin panel. Wiring these sections to real sheet data is an explicit future phase.

Smart sheet sub-tables (titles, not IDs, are matched at runtime):
- **温度记录** (w7xSwm, 11 fields) — per-container temperature readings. **Core** — drives the gantt + dashboard temperature/alerts. Linked to logistics sheets via 柜号.
- **陆运明细** / **海运明细** — full land/sea shipment tracking (created by `scripts/create-sheets.js`, ~57 / ~89 fields). The dashboard's detention (滞留) calc reads these by sheet title.
- **国内段明细** / **海运国内** — domestic-leg detail sheets.
- **订单主表** (exh5Ik) / **分柜明细表** (APAxm1) — legacy sheets, kept but no longer the primary source.

## Common commands

```bash
# Local development
npm install                    # install dependencies
node server.js                 # start server (http://localhost:3000)

# First-time auth setup (after initial deploy):
node scripts/init-db.js        # create admin account interactively
# Then in .env, replace JWT_SECRET with:
# node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

# Deploy (git-based) — user expects every change pushed to GitHub automatically
./deploy.sh "commit message"   # git add/commit/push to GitHub (or run add/commit/push manually)

# After push, the USER pulls on the server themselves:
cd /home/ubuntu/温度看板 && git pull && pm2 restart durian-dashboard

# One-time smart-sheet setup scripts (need IP whitelisted, run locally or on server):
node scripts/create-sheets.js   # create 陆运明细/海运明细/国内段明细/海运国内 sheets + fields
node scripts/import-xls-data.js # import data/明细表.xls into 陆运/海运明细

# Server management (SSH)
ssh ubuntu@124.221.92.98
pm2 status                     # check service status
pm2 restart durian-dashboard   # restart
pm2 logs durian-dashboard      # view logs

# Quick API test (with auth — login first, then use cookie)
curl -s -X POST http://124.221.92.98:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin","password":"YOUR_PASSWORD"}' -c /tmp/cookies.txt
curl -s -b /tmp/cookies.txt http://124.221.92.98:3000/api/dashboard?hours=168 | python3 -m json.tool
```

### First-time server setup (auth)

After initial clone, run once on the server:
```bash
# better-sqlite3 needs build tools
sudo apt install build-essential python3
npm install
# Generate a random JWT secret and add it to .env
echo "JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")" >> .env
# Create the first admin user
node scripts/init-db.js
```

## Server info

- **IP**: `124.221.92.98`
- **User**: `ubuntu`
- **Project path**: `/home/ubuntu/温度看板`
- **GitHub**: `git@github.com:sweet-lemon-n/durian-dashboard.git`
- **Deploy flow**: local `git push` → server `git pull` + `pm2 restart`
- **SSH may fail** due to key changes; use `curl` to the public IP to test API responses directly

## Architecture

```
Browser (看板 / 管理后台 / 登录页)
    ↓ HTTP (JWT in httpOnly cookie)
Express server (server.js)
    ├── cookie-parser → 解析 token cookie
    ├── Auth guard (/api/* 除 /api/auth/login|logout 外均需 requireAuth)
    ├── requireRole('admin') on write/management routes
    ├── lib/db.js → SQLite (data/auth.db, users/audit_logs tables)
    └── lib/wecom.js → POST to qyapi.weixin.qq.com
                              ↓
                  WeChat Work Smart Sheet API
```

### Auth flow

1. User visits any page → frontend JS calls `GET /api/auth/me`
2. `401` → redirect to `/login?redirect=<original>`；`200` → show page
3. Login: `POST /api/auth/login` with `{ username, password, rememberMe }` → server validates against bcrypt hash in SQLite → issues JWT (HS256, 7d if rememberMe, else 24h) → sets httpOnly cookie
4. All subsequent API calls carry the cookie → `requireAuth` middleware verifies JWT + checks `token_version` (supports forced logout) → attaches `req.user`
5. Admin-only routes additionally pass through `requireRole('admin')` → checks `req.user.role`
6. Logout: `POST /api/auth/logout` → `clearCookie`

### Middleware order in server.js (critical)

```
1. express.json()              — body parsing
2. cookieParser()              — cookie parsing (must come before auth)
3. express.static('public')    — static files (index.html, admin.html, login.html, gantt.js, admin-smartsheet.js, style.css)
4. /login, /admin routes       — page serving
5. CORS                        — permissive headers
6. /callback raw body parsers  — XML for WeChat Work
7. /api/auth/login, /api/auth/logout  — PUBLIC (before auth guard)
8. app.use('/api', guard)      — skips /auth/login|logout, requireAuth for everything else
9. /api/auth/me                — AUTHENTICATED (after guard)
10. All other /api/* routes    — AUTHENTICATED + admin routes add requireRole('admin')
```

### Project structure

```
温度看板/
├── server.js              # Express backend (all API routes; mounts board-routes after the auth guard)
├── deploy.sh              # git add/commit/push helper
├── lib/
│   ├── wecom.js           # WeChat Work API wrapper (token, CRUD, views, groups)
│   ├── crypto.js          # Callback crypto (SHA1 verify, AES-256-CBC encrypt/decrypt)
│   ├── db.js              # SQLite database (users/audit_logs tables, user CRUD)
│   ├── auth.js            # JWT auth (generate/verify token, requireAuth/requireRole middleware)
│   ├── content-store.js   # JSON store for editable board content (data/board-content.json) + seed defaults
│   └── board-routes.js    # express.Router: /api/aggregate + orders/logistics/news CRUD; exports { router, aggregate }
├── public/                # Frontend static files
│   ├── index.html         # Dashboard: 泰越交付总览 board (template) + temperature gantt at bottom + auth wrapper
│   ├── gantt.js           # Temperature gantt heatmap (reads real /api/dashboard), independent fetch loop
│   ├── admin.html         # Admin panel: 4 tabs (订单/物流/新闻 → board-content; 🗄 智能表格管理 → wecom)
│   ├── admin-smartsheet.js# Smart-sheet management logic for the 4th admin tab (globals; loaded after inline script)
│   ├── login.html         # Login page (dark theme, remember-me, JWT cookie auth)
│   └── style.css          # Dark-theme styles for login page (dashboard/admin are self-contained inline)
├── data/                  # auth.db (SQLite) + board-content.json (gitignored, auto-seeded) + import sources
├── scripts/
│   ├── init-db.js         # Interactive first-time admin user creation
│   ├── create-sheets.js   # Create 陆运/海运/国内段/海运国内 sheets + fields via wecom API
│   └── import-xls-data.js # Import 明细表.xls historical data into 陆运/海运明细
└── docs/                  # Documentation
```

> Note: `public/app.js` was removed in the redesign — the gantt logic now lives in `gantt.js`. The dashboard and admin pages keep their CSS/JS **inline** (template style); only `login.html` uses `style.css`.

### Backend (`server.js`)

Express server with static file serving from `public/`. All API routes return JSON `{ success, data/error }`. Schema auto-detection with 5-minute cache.

**Permission levels:** All `/api/*` routes require login (JWT cookie). Write/management routes additionally require `admin` role. Exceptions: `/callback` and auth login/logout are public.

**Core routes:**
| Route | Method | Auth | Purpose |
|-------|--------|------|---------|
| `/api/auth/login` | POST | 无 | Login. Body: `{ username, password, rememberMe? }` → sets httpOnly JWT cookie |
| `/api/auth/logout` | POST | 无 | Clears auth cookie |
| `/api/auth/me` | GET | 登录 | Returns current user `{ username, displayName, role }` |
| `/api/config/info` | GET | 登录 | Document schema (sheets, fields, auto-detected temp/info sheet) |
| `/api/aggregate` | GET | 登录 | **Dashboard board data** from `board-content.json`: `{ meta, global, th, vn, logistics, news, generatedAt }`. Raw object (NOT `{success,data}`). `no-store` |
| `/api/dashboard` | GET | 登录 | Real temperature data from 温度记录 + **detention** from 陆运/海运明细: `{ records, stats, alerts, containers, detention }`. Query: `hours`(default 24), `limit`(200), `container` |
| `/api/temperature/history` | GET | 登录 | Historical temperature data for charts |
| `/api/orders`, `/api/news` | GET·POST·PUT·DELETE | 登录读 / admin写 | Board-content order & news CRUD (`board-routes.js`). Raw object/array responses |
| `/api/logistics`, `.../kpis`, `.../portDelays[/:id]`, `.../inTransitContainers[/:id]` | GET·PUT·POST·DELETE | 登录读 / admin写 | Board-content logistics CRUD |
| `/api/setup` | POST | admin | Create new smart sheet doc with 温度记录 sheet + 11 default fields |
| `/api/schema/refresh` | POST | 登录 | Clear schema cache |
| `/api/smartsheet/records` | GET | 登录 | **Generic** record query for ANY sheet. Query: `?sheetId=xxx&limit=500` |
| `/callback` | GET/POST | 无 | WeChat Work callback URL verification + event receive |

**Sheet management:** `POST /api/smartsheet/sheet/add`, `/delete`, `/update` — all require `admin`
**Record CRUD:** `POST /api/smartsheet/records/add`, `/delete`, `/update` — all require `admin`
**Field management:** `POST /api/smartsheet/fields/add` (auto-reverses array + deletes default "智能表列"), `/delete`, `/update` — all require `admin`
**Views:** `GET /api/smartsheet/views` (login), `POST .../views/add`, `/delete`, `/update` (admin)
**Groups:** `GET /api/smartsheet/groups` (login), `POST .../groups/add`, `/delete`, `/update` (admin)
**Document:** `GET /api/doc/info`, `POST /api/doc/rename`, `POST /api/doc/delete` — all require `admin`

**Schema detection strategy:** Title-based matching first (标题含「温度」→ tempSheet, 含「订单」→ infoSheet), then field-keyword fallback.

**Alert logic:** Primarily compares 回风温度 vs 设定温度 — if `|returnTemp - setTemp| > TEMP_DIFF_WARNING` (default 3°C), record is marked abnormal. Falls back to TEMP_MIN/TEMP_MAX thresholds if no setTemp available.

**Detention logic** (in `/api/dashboard`, joined onto temperature records by 柜号): reads the 陆运明细 / 海运明细 sheets by title. 陆运 detention = (出口岸时间 ?? now) − 进卡时间; 海运 detention = (放行时间 ?? now) − 实际到港时间, in days. `parseLogisticsTime()` accepts ms-timestamp strings or ISO. Logistics-read failures are caught and never block the temperature response.

### Key modules (`lib/`)

**`wecom.js`** — Full WeChat Work Smart Sheet API wrapper. Methods:

| Category | Methods |
|----------|---------|
| Token | `getAccessToken` (7200s cache, auto-refresh), `clearTokenCache` |
| Read | `getSheets`, `getFields`, `getRecords`, `getAllRecords` (auto-pagination), `getRecordValue` (handles text/link/select/number extraction) |
| Write | `createDoc`, `addSheet`, `addFields`, `addRecords`, `updateRecords`, `deleteRecords`, `deleteFields`, `updateFields` |
| Manage | `renameDoc`, `deleteDoc`, `getDocInfo`, `deleteSheet`, `updateSheet` |
| Views | `getViews`, `addView`, `deleteView`, `updateView` |
| Groups | `getGroups`, `addGroup`, `deleteGroup`, `updateGroup` |

Transparent retry on token expiry (errcode 40014/42001). All API calls require the server's public IP to be whitelisted in 企业微信管理后台 → 应用管理 → 自建应用 → 企业可信IP.

**`crypto.js`** — WeChat Work callback crypto: SHA1 signature verification, AES-256-CBC encrypt/decrypt with PKCS7 padding.

**`db.js`** — SQLite database layer (better-sqlite3, synchronous API). Creates/opens `data/auth.db`, maintains `users` and `audit_logs` tables. Exports: `initDatabase`, `getDb`, `getUserByUsername`, `getUserById`, `createUser` (async — bcrypt hashing), `updateUser`, `listUsers`, `incrementTokenVersion`, `countUsers`. Role CHECK constraint: `admin` or `viewer`.

**`auth.js`** — JWT authentication and Express middleware. Uses `jsonwebtoken` (HS256) and httpOnly cookies (`cookie-parser`, cookie name `token`). Exports: `generateToken` (7d remember-me / 24h default), `verifyToken`, `setAuthCookie`/`clearAuthCookie`, `requireAuth` (validates JWT + checks `token_version` for forced logout), `requireRole(...roles)` (factory middleware). JWT payload: `{ userId, username, role, tokenVersion }`.

**`content-store.js`** — JSON store for editable board content. `read()` (auto-seeds `data/board-content.json` from inline `seedData()` on first call; throws on parse error), `writeSync(data)` (tmp-file + atomic `renameSync`), `genId(prefix)` (`crypto.randomUUID()`). The file is gitignored — it regenerates from seed on a fresh server.

**`board-routes.js`** — `express.Router` for the redesigned dashboard. Exports `{ router, aggregate }`. `aggregate(db)` groups orders by country (`done = TH?delivered:signed`, `rate = done/boxes`) into the `/api/aggregate` shape. CRUD writes go through `requireRole('admin')`; reads only need the guard. **Responses are raw objects/arrays** (not the `{success,data}` envelope) so the ported template frontend works unchanged. Mounted in `server.js` via `app.use('/api', boardRouter)` *after* the auth guard.

### Frontend (`public/`)

Dashboard and admin are **self-contained** (inline CSS + JS) — a polished dark gold/red template (Oswald/Noto Sans fonts). Only `login.html` uses the external `style.css`.

- **`login.html`** — Dark-theme login page, checks `/api/auth/me` on load (auto-redirect if logged in), submits to `POST /api/auth/login`, supports `?redirect=` param. "记住登录状态（7天）" maps to JWT 7d expiry.

- **`index.html`** — 泰越交付总览 board. `boot()`: `loadUser()` (`/api/auth/me`, 401→login, shows name + logout + an 后台 link for admins) → `loadData()` (`/api/aggregate`) → `paint()` (TH/VN country panels with FRESH/FROZEN rows, global aggregate, logistics monitoring tables, news columns, live clock), 30s poll. **All placeholder data except the bottom gantt.**
- **`gantt.js`** — Loaded after the inline board script. Independent fetch loop against the real `/api/dashboard?hours=168` (temperature), renders the柜号×7-day color-coded heatmap (blue≤6°C→green→red≥20°C). Scoped under `#ganttContainer`. Locally without IP whitelist it just shows 「暂无温度数据」 (errors are swallowed); real data appears once deployed.
- **`admin.html`** — 4-tab admin. Inline script (`api()` helper, 401→login / 403→toast) manages 订单/物流/新闻 against the board-content CRUD endpoints with autosave + 10s sync. The 4th tab **🗄 智能表格管理** holds the wecom smart-sheet management UI; its logic is in `admin-smartsheet.js` (globals, lazy-`initSmartsheet()` on first tab open). Auth via `checkAuth()` (non-admin → bounced to `/`).
  - **JS collision rule:** both the inline admin script and `admin-smartsheet.js` share global scope. The inline script renamed its modal closer to `closeModalById` and its escape helpers to `esc`/`md`; `admin-smartsheet.js` uses `ssCloseModal`, `escHtml`/`escAttr`. Don't reintroduce a name defined in the other file.
- **`style.css`** — Dark-theme styles for `login.html` only.

## 温度记录 sub-table schema (w7xSwm, 11 fields)

| 字段标题 | 字段ID | 类型 |
|---------|--------|------|
| 柜号 | f1gQ8W | TEXT |
| 品牌 | fGfaKc | TEXT |
| 放柜时间 | f7rXw9 | DATE_TIME (`yyyy-mm-dd hh:mm`) |
| 设定温度 | fvVy4l | NUMBER (decimal_places: 1) |
| 送风温度 | fDVBfv | NUMBER (decimal_places: 1) |
| 回风温度 | fNBh8c | NUMBER (decimal_places: 1) |
| 风口设定 | fvu42i | TEXT |
| 当前位置 | f5WSCW | TEXT |
| 味道 | fBbSWo | TEXT |
| 关口 | fKttri | TEXT |
| 更新时间 | fWPk1N | DATE_TIME (`yyyy-mm-dd hh:mm`) |

## Smart Sheet data design rules

1. **DATE_TIME values must be STRINGS** containing millisecond timestamps (e.g., `"1743955200000"`), NOT numbers. Numbers are silently ignored (errcode=0 but no value stored).
2. **NUMBER `decimal_places` max is 4** — setting 6 causes errcode 2022017 and the entire `addFields` batch fails.
3. **`addFields` adds in reverse order** — pass `.reverse()` on your field array so the final display order matches left-to-right.
4. **Default "智能表列" column** — auto-created when adding a sheet. Delete it via `deleteFields()` after adding all custom fields.
5. **SINGLE_SELECT cell format**: `[{text: "option"}]`. Field definition: `property_single_select: {is_multiple: false, is_quick_add: true, options: [{text: "..."}]}`.
6. **TEXT cell format**: `[{type: 'text', text: 'value'}]`. NUMBER: raw number value.
7. **Data isolation**: an app can only read/write documents it created via the API. Use `/api/setup` to create an app-owned document.
8. **Prefer incremental updates** over delete-and-rebuild — use `updateRecords` by `record_id` to preserve manual edits.

## Environment variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `CORPID` | WeChat Work enterprise ID |
| `CORPSECRET` | Self-built app secret |
| `DOCID` | Smart sheet document ID (auto-updated by `/api/setup`) |
| `PORT` | Server port (default 3000) |
| `TEMP_MIN` / `TEMP_MAX` | Temperature alert fallback thresholds (°C, used when no setTemp available) |
| `TEMP_DIFF_WARNING` | Max allowed deviation between 回风 and 设定 temp before alert (default 3°C) |
| `REFRESH_INTERVAL` | Frontend polling interval in seconds (default 30) |
| `JWT_SECRET` | HMAC-SHA256 signing key for JWT tokens (generate via `crypto.randomBytes(64).toString('hex')`) |
| `WECOM_TOKEN` | Callback URL verification token |
| `WECOM_ENCODING_AES_KEY` | 43-char AES key for callback encryption |

## IP whitelist

The WeChat Work self-built app requires IP whitelisting for API access. Add IPs in 企业微信管理后台 → 应用管理 → 自建应用 → 企业可信IP. Without this, all API calls return errcode 60020. Both the server's public IP and any local development IP must be whitelisted.
