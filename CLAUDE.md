# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

榴莲运输温度监控看板 — A data management dashboard for durian fruit shipping. The backend reads/writes data via WeChat Work (企业微信) Smart Sheet API, serving two frontends: a real-time monitoring dashboard and an admin panel.

**Tech stack:** Node.js + Express (backend), vanilla HTML/CSS/JS + Chart.js (frontend), deployed on Tencent Cloud Ubuntu Lighthouse server.

The smart sheet document contains two sheets:
- **订单主表** (21 fields, 18 records) — order master data
- **分柜明细表** (25 fields, 76 records) — per-container shipment details

The temperature monitoring sheet is not yet created (planned as a third sheet).

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
```

## Server info

- **IP**: `124.221.92.98`
- **User**: `ubuntu`
- **Project path**: `/home/ubuntu/温度看板`
- **GitHub**: `git@github.com:sweet-lemon-n/durian-dashboard.git`
- **Deploy flow**: local `git push` → server `git pull` + `pm2 restart`

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
├── deploy.sh              # git push + server hint
├── lib/
│   ├── wecom.js           # WeChat Work API wrapper (token, CRUD, views, groups)
│   └── crypto.js          # Callback crypto (SHA1 verify, AES-256-CBC encrypt/decrypt)
├── public/                # Frontend static files
│   ├── index.html         # Dashboard (temperature monitoring)
│   ├── admin.html         # Admin panel (system status, API testing)
│   ├── app.js             # Dashboard logic (Chart.js, auto-polling)
│   └── style.css          # Dark-theme styles
├── data/                  # Data files (backup, not runtime)
├── scripts/               # Utility scripts
└── docs/                  # Documentation
```

### Backend (`server.js`)

Express server with static file serving from `public/`. All API routes return JSON `{ success, data/error }`. Schema auto-detection with 5-minute cache.

**Core routes:**
- **`GET /api/config/info`** — Document schema (sheets, fields, auto-detected temp/info sheet)
- **`GET /api/dashboard`** — Aggregated data (records + stats + alerts + container list)
- **`GET /api/temperature/history`** — Historical temperature data for charts
- **`POST /api/setup`** — Create a new smart sheet doc with temperature sheet + fields
- **`GET /callback`** — WeChat Work callback URL verification
- **`POST /api/schema/refresh`** — Clear schema cache

**Document management:** `/api/doc/info`, `/api/doc/rename`, `/api/doc/delete`
**Sheet management:** `/api/smartsheet/sheet/delete`, `/api/smartsheet/sheet/update`
**Record CRUD:** `/api/smartsheet/records/add`, `/api/smartsheet/records/delete`, `/api/smartsheet/records/update`
**Field management:** `/api/smartsheet/fields/delete`, `/api/smartsheet/fields/update`
**Views:** `/api/smartsheet/views`, `/api/smartsheet/views/add`, `/api/smartsheet/views/delete`, `/api/smartsheet/views/update`
**Groups:** `/api/smartsheet/groups`, `/api/smartsheet/groups/add`, `/api/smartsheet/groups/delete`, `/api/smartsheet/groups/update`

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

Transparent retry on token expiry (errcode 40014/42001).

**`crypto.js`** — WeChat Work callback crypto: SHA1 signature verification, AES-256-CBC encrypt/decrypt with PKCS7 padding. Used by `/callback` for URL verification.

### Frontend (`public/`)

- **`index.html` + `style.css`** — Dark-theme dashboard with stats cards, alert banner, Chart.js line chart (temperature trends by container), and records data table. Container filter, time range selector, settings panel. Auto-refresh polling.
- **`admin.html`** — Browser-based admin panel: system status, one-click smart sheet creation, cache clearing, API query testing.
- **`app.js`** — Dashboard logic: Chart.js time-scale line chart with threshold lines, 30s auto-polling, localStorage-backed settings.

## Smart Sheet data design rules

These are hard-won lessons from the import process:

1. **DATE_TIME values must be STRINGS** containing millisecond timestamps (e.g., `"1743955200000"`), NOT numbers. Numbers are silently ignored (errcode=0 but no value stored).
2. **NUMBER `decimal_places` max is 4** — setting 6 causes errcode 2022017 and the entire `addFields` batch fails.
3. **`addFields` adds in reverse order** — pass `.reverse()` on your field array so the final display order matches left-to-right.
4. **Default "智能表列" column** — auto-created when adding a sheet. Delete it via `deleteFields()` after adding all custom fields.
5. **SINGLE_SELECT cell format**: `[{text: "option"}]`. Field definition: `property_single_select: {is_multiple: false, is_quick_add: true, options: [{text: "..."}]}`.
6. **TEXT cell format**: `[{type: 'text', text: 'value'}]`. NUMBER: raw number value.
7. **Data isolation**: an app can only read/write documents it created via the API. Use `/api/setup` to create an app-owned document.
8. **Prefer incremental updates** over delete-and-rebuild — use `updateRecords` by `record_id` to preserve manual edits. Never use `rebuild_all.js`-style destructive import on a live table.

## Environment variables (`.env`)

| Variable | Purpose |
|----------|---------|
| `CORPID` | WeChat Work enterprise ID |
| `CORPSECRET` | Self-built app secret |
| `DOCID` | Smart sheet document ID (auto-updated by `/api/setup`) |
| `PORT` | Server port (default 3000) |
| `TEMP_MIN` / `TEMP_MAX` | Temperature alert thresholds (°C) |
| `REFRESH_INTERVAL` | Frontend polling interval (seconds) |
| `WECOM_TOKEN` | Callback URL verification token |
| `WECOM_ENCODING_AES_KEY` | 43-char AES key for callback encryption |

## IP whitelist

The WeChat Work self-built app requires IP whitelisting for API access. Local IP was added to the app's trusted IP list in 企业微信管理后台 → 应用管理 → 自建应用 → 企业可信IP. Without this, all API calls return errcode 60020.
