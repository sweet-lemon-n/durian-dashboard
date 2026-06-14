# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

榴莲运输温度监控看板 — A temperature monitoring dashboard for durian fruit shipping. The backend reads data from a WeChat Work (企业微信) Smart Sheet API and serves it to a single-page frontend dashboard with real-time charts.

**Tech stack:** Node.js + Express (backend), vanilla HTML/CSS/JS + Chart.js (frontend), deployed on Tencent Cloud Ubuntu Lighthouse server.

## Server info

- **IP**: `124.221.92.98`
- **User**: `ubuntu`
- **Project path**: `/home/ubuntu/温度看板`
- **Log file**: `/tmp/durian-dashboard.log`

## Common commands

```bash
# Local development
npm install                    # install dependencies
node server.js                 # start server (http://localhost:3000)

# Deploy to server
./deploy.sh                    # sync all code to server + restart service

# Server management (SSH in first)
ssh ubuntu@124.221.92.98
pm2 status                     # check service status
pm2 restart durian-dashboard   # restart
pm2 logs durian-dashboard      # view logs
cat /tmp/durian-dashboard.log  # fallback log if pm2 not used
```

## Architecture

```
Browser (看板 / 管理后台)
    ↓ HTTP
Express server (server.js)
    ↓ POST to qyapi.weixin.qq.com
WeChat Work Smart Sheet API
```

### Backend (`server.js`)

Express server with static file serving from `public/`. Middleware sets CORS headers. All API routes return JSON `{ success, data/error }`.

- **`GET /admin`** — Admin management page
- **`GET /api/config/info`** — Returns document schema (sheets, fields, auto-detected temp/info sheet)
- **`GET /api/dashboard`** — Aggregated dashboard data (records + stats + alerts + container list). Query params: `container`, `hours`, `limit`
- **`GET /api/temperature/history`** — Historical temperature data for charts. Query params: `container`, `hours`
- **`POST /api/setup`** — One-click: creates a new smart sheet doc (owned by the app), adds temperature sheet with fields, updates `.env` DOCID
- **`GET /callback`** — WeChat Work callback URL verification (signature check + echostr decryption)
- **`POST /api/schema/refresh`** — Clears schema cache

### Key modules (`lib/`)

- **`wecom.js`** — Wraps all WeChat Work API calls. Handles access_token caching (7200s, auto-refresh at 5min before expiry) and transparent retry on token expiry (errcode 40014/42001). Read methods: `getSheets`, `getFields`, `getRecords`, `getAllRecords` (auto-pagination). Write methods: `createDoc`, `addSheet`, `addFields`. Utility: `getRecordValue` (handles text/url/select/number value extraction).

- **`crypto.js`** — WeChat Work callback crypto: SHA1 signature verification, AES-256-CBC encrypt/decrypt with PKCS7 padding. Used by `/callback` for URL verification and (reserved) message decryption.

### Frontend (`public/`)

- **`index.html`** + **`style.css`** — Dark-theme dashboard with stats cards, alert banner, Chart.js line chart (temperature trends by container), and records data table. Container filter dropdown, time range selector, settings panel (temperature thresholds, refresh interval). Auto-refresh polling.

- **`admin.html`** — Browser-based admin panel for non-technical operations: system status display, one-click smart sheet creation, cache clearing, API query testing.

- **`app.js`** — Dashboard logic: Chart.js time-scale line chart with temperature threshold lines, 30s auto-polling, localStorage-backed settings.

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

## Data flow and auto-detection

The server auto-detects which sheet contains temperature data by scanning field titles for keywords: 温度/temp/℃ (temperature sheet) vs 订单/客户/目的地 (info sheet). If the smart sheet doc was NOT created by this app, the API returns error 301085 ("invalid docid") — this is WeChat Work's data isolation: an app can only read documents it created via the API. Use `/api/setup` or the admin page to create an app-owned document.

The `/api/setup` flow: `createDoc(doc_type=10)` → `addSheet("温度记录")` → `addFields([柜号(TEXT), 温度(NUMBER), 位置信息(TEXT), 香味(TEXT), 更新时间(DATE_TIME)])` → update `.env` DOCID → clear schema cache.
