# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

榴莲运输温度监控看板 — A data management dashboard for durian fruit shipping. The backend reads/writes data via WeChat Work (企业微信) Smart Sheet API, serving two frontends: a real-time monitoring dashboard and an admin panel.

**Tech stack:** Node.js + Express (backend), vanilla HTML/CSS/JS (frontend), deployed on Tencent Cloud Ubuntu Lighthouse server.

The smart sheet document (`DOCID` in `.env`) contains three sheets:
- **订单主表** (exh5Ik) — order master data
- **分柜明细表** (APAxm1) — per-container shipment details
- **温度记录** (w7xSwm, 11 fields) — per-container temperature readings, linked to 分柜明细表 via 柜号

## Common commands

```bash
# Local development
npm install                    # install dependencies
node server.js                 # start server (http://localhost:3000)

# Deploy (git-based)
./deploy.sh "commit message"   # git add/commit/push to GitHub

# After deploy.sh, on the server:
cd /home/ubuntu/温度看板 && git pull && pm2 restart durian-dashboard

# Server management (SSH)
ssh ubuntu@124.221.92.98
pm2 status                     # check service status
pm2 restart durian-dashboard   # restart
pm2 logs durian-dashboard      # view logs

# Quick API test (from any machine)
curl -s http://124.221.92.98:3000/api/dashboard?hours=168 | python3 -m json.tool
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
Browser (看板 / 管理后台)
    ↓ HTTP
Express server (server.js)
    ↓ POST to qyapi.weixin.qq.com
WeChat Work Smart Sheet API
```

### Project structure

```
温度看板/
├── server.js              # Express backend (all API routes)
├── deploy.sh              # git add/commit/push helper
├── lib/
│   ├── wecom.js           # WeChat Work API wrapper (token, CRUD, views, groups)
│   └── crypto.js          # Callback crypto (SHA1 verify, AES-256-CBC encrypt/decrypt)
├── public/                # Frontend static files
│   ├── index.html         # Dashboard (gantt heatmap, stats, alerts, data table)
│   ├── admin.html         # Admin panel (record CRUD, field mgmt, JSON/table toggle)
│   ├── app.js             # Dashboard logic (gantt heatmap, auto-polling, settings)
│   └── style.css          # Dark-theme styles
├── data/                  # Data files (backup, not runtime)
├── scripts/               # Utility scripts
└── docs/                  # Documentation
```

### Backend (`server.js`)

Express server with static file serving from `public/`. All API routes return JSON `{ success, data/error }`. Schema auto-detection with 5-minute cache.

**Core routes:**
| Route | Method | Purpose |
|-------|--------|---------|
| `/api/config/info` | GET | Document schema (sheets, fields, auto-detected temp/info sheet) |
| `/api/dashboard` | GET | Aggregated data (records + stats + alerts + container list). Query params: `hours` (default 24), `limit` (default 200), `container` |
| `/api/temperature/history` | GET | Historical temperature data for charts |
| `/api/setup` | POST | Create new smart sheet doc with 温度记录 sheet + 11 default fields |
| `/api/schema/refresh` | POST | Clear schema cache |
| `/api/smartsheet/records` | GET | **Generic** record query for ANY sheet — returns parsed/flattened values. Query: `?sheetId=xxx&limit=500` |
| `/callback` | GET/POST | WeChat Work callback URL verification + event receive |

**Sheet management:** `POST /api/smartsheet/sheet/add`, `POST /api/smartsheet/sheet/delete`, `POST /api/smartsheet/sheet/update`
**Record CRUD:** `POST /api/smartsheet/records/add`, `POST /api/smartsheet/records/delete`, `POST /api/smartsheet/records/update`
**Field management:** `POST /api/smartsheet/fields/add` (auto-reverses array + deletes default "智能表列"), `POST /api/smartsheet/fields/delete`, `POST /api/smartsheet/fields/update`
**Views:** `GET /api/smartsheet/views`, `POST .../views/add`, `POST .../views/delete`, `POST .../views/update`
**Groups:** `GET /api/smartsheet/groups`, `POST .../groups/add`, `POST .../groups/delete`, `POST .../groups/update`
**Document:** `GET /api/doc/info`, `POST /api/doc/rename`, `POST /api/doc/delete`

**Schema detection strategy:** Title-based matching first (标题含「温度」→ tempSheet, 含「订单」→ infoSheet), then field-keyword fallback.

**Alert logic:** Primarily compares 回风温度 vs 设定温度 — if `|returnTemp - setTemp| > TEMP_DIFF_WARNING` (default 3°C), record is marked abnormal. Falls back to TEMP_MIN/TEMP_MAX thresholds if no setTemp available.

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

### Frontend (`public/`)

- **`index.html` + `style.css`** — Dark-theme dashboard with stats cards, alert banner, gantt heatmap (container × date grid, color-coded from blue/cold to red/hot), and records data table (12 columns). Settings panel, auto-refresh polling. Cache-busted with `?v=` query param.
- **`admin.html`** — Full admin panel: system status, one-click smart sheet creation, table structure viewer, dashboard data viewer (both with JSON/table toggle), record CRUD (modal with all 11 fields, table view for any sheet), field/view/group management, document rename/delete.
- **`app.js`** — Dashboard logic: gantt heatmap rendering (`updateGantt()`), temperature type filter (returnTemp/setTemp/supplyTemp), 6-point color interpolation (≤6°C blue → 12°C green → ≥20°C red), 7-day date range with last-record-per-day dedup, localStorage-backed settings, 30s auto-polling.

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
| `WECOM_TOKEN` | Callback URL verification token |
| `WECOM_ENCODING_AES_KEY` | 43-char AES key for callback encryption |

## IP whitelist

The WeChat Work self-built app requires IP whitelisting for API access. Add IPs in 企业微信管理后台 → 应用管理 → 自建应用 → 企业可信IP. Without this, all API calls return errcode 60020. Both the server's public IP and any local development IP must be whitelisted.
