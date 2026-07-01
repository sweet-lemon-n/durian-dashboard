# React 迁移设计文档

**日期**: 2026-07-01
**状态**: 待评审

---

## 背景

榴莲运输温度监控看板当前使用 vanilla HTML/CSS/JS + Express 构建，约 16,500 行代码。前端存在显著代码重复：多个页面变体（3 个看板、2 个管理后台、4 个新页面）之间大量 copy-paste JS/CSS，`admin-smartsheet.js` 已膨胀至 61KB。引入 React 组件的动机：使用 React Bits 动画组件库提升动效、减少代码重复、为后续功能扩展提供更好的可维护性。

## 目标

- 将前端从 vanilla JS 迁移至 Vite + React + React Router SPA
- 后端 Express 保持不变，仅做静态托管适配
- 消除页面变体之间的代码重复
- 支持 React Bits 动画组件库
- 保留现有的 GSAP 动画能力（通过 `useRef` + GSAP 实例）
- 不中断现有部署，增量切换

## 非目标

- 不重写后端 API
- 不改变数据库结构
- 不改变企业微信 Smart Sheet 集成
- 不改变部署方式（腾讯云 + pm2 + git push/pull）

---

## 架构

### 技术栈

| 层 | 技术 | 说明 |
|---|------|------|
| 构建 | Vite + @vitejs/plugin-react | 开发服务器 proxy /api 到 Express |
| UI | React 18 + React Bits | 组件化 + 动画 |
| 路由 | React Router v6 | SPA 客户端路由，去除 .html 后缀 |
| 服务端状态 | TanStack Query (React Query) | API 缓存、轮询、自动刷新 |
| 客户端状态 | React Context | auth、theme |
| 持久化 | localStorage hooks | 主题偏好、管理后台设置 |
| 样式 | CSS 自定义属性 | 主题系统（沿用现有 5 主题体系） |
| 后端 | Express (不变) | API + 生产 dist/ 静态托管 |

### 数据流

```
React App (浏览器)
    │
    ├── TanStack Query ──fetch──→ Express /api/*
    │   (缓存/轮询/重取)              │
    │                                ├── JWT auth (cookie)
    │                                ├── 企业微信 Smart Sheet API
    │                                └── SQLite (auth.db)
    │
    ├── React Context
    │   ├── AuthContext (user, login, logout)
    │   └── ThemeContext (当前主题)
    │
    └── localStorage
        ├── tv-theme
        └── admin.ordersAgg.v1
```

### 开发/生产环境

| 环境 | 前端端口 | 后端端口 | 数据流 |
|------|---------|---------|--------|
| 开发 | Vite :5173 | Express :3000 | Vite proxy `/api` → `localhost:3000` |
| 生产 | Express :3000 (静态托管 dist/) | Express :3000 | 同端口，无跨域 |

---

## 组件树

```
App
├── AuthProvider
│   └── ThemeProvider
│       └── Router
│           ├── LoginPage
│           │   └── LoginForm
│           ├── ProtectedRoute (requireAuth)
│           │   ├── DashboardPage
│           │   │   ├── CountryPanel (TH/VN)
│           │   │   ├── LogisticsPanel
│           │   │   ├── NewsPanel
│           │   │   └── GanttChart
│           │   ├── DashboardSentryPage
│           │   │   └── (不同布局，复用同上子组件)
│           │   ├── DashboardTvPage
│           │   │   ├── ThemeSwitcher
│           │   │   └── (单视口布局，复用子组件)
│           │   ├── AdminPage / AdminSentryPage
│           │   │   ├── OrdersTab (CRUD + 拖拽排序 + 合计行)
│           │   │   ├── LogisticsTab
│           │   │   ├── NewsTab
│           │   │   └── SmartSheetTab
│           │   │       ├── SheetList
│           │   │       ├── FieldManager
│           │   │       ├── RecordTable
│           │   │       ├── ViewManager
│           │   │       └── GroupManager
│           │   ├── FlowPage
│           │   ├── OverviewPage
│           │   └── ThailandPage
│           └── AdminRoute (requireRole: admin)
```

---

## 路由设计

| 路径 | 页面 | 对应原 URL | 认证要求 |
|------|------|-----------|---------|
| `/login` | LoginPage | /login.html | 无 |
| `/` | DashboardPage | /index.html | 登录 |
| `/sentry` | DashboardSentryPage | /index-sentry.html | 登录 |
| `/tv` | DashboardTvPage | /index-tv.html | 登录 |
| `/admin` | AdminPage | /admin.html | admin |
| `/admin-sentry` | AdminSentryPage | /admin-sentry.html | admin |
| `/flow` | FlowPage | /index-flow.html | 登录 |
| `/overview` | OverviewPage | /app-overview.html | 登录 |
| `/thailand` | ThailandPage | /app-thailand.html | 登录 |

老 URL（.html 后缀）在 Express 层做 301 redirect 到新路径。

---

## 关键模块迁移

### GanttChart（gantt.js → 共享组件）

- 封装为独立 `<GanttChart>` 组件
- 通过 TanStack Query 的 `useQuery` 获取 `/api/dashboard?hours=168`
- 保留现有的温度色阶逻辑（蓝≤6°C→绿→红≥20°C）
- 三个看板页面直接引用，传不同的容器尺寸/样式 props

### SmartSheet 管理（admin-smartsheet.js → 6-8 个小组件）

原文件 61KB 包含：表格列表、字段 CRUD、记录 CRUD、视图管理、分组管理。
拆分为：`SheetList`, `FieldManager`, `RecordTable`, `ViewManager`, `GroupManager`
每个组件独立管理自己的 API 调用，通过共享的 `useSmartSheet` hook 获取 docId/sheetId 等上下文。

### 主题系统

沿用现有 5 主题 CSS 变量体系（forest/ocean/amber/slate/violet）。
`ThemeProvider` 读取 `localStorage` 初始值，`<html data-theme="...">` 动态切换。
`ThemeSwitcher` 组件渲染底部色点按钮。

### GSAP 动画

- 现有 GSAP 依赖保留在 `package.json`
- 特殊动画（如 overview 的复杂时序动画）通过 `useRef` + `useLayoutEffect` + GSAP 实例实现
- 一般交互动画优先用 React Bits 替代

### JWT Auth

- `AuthProvider` 在挂载时调用 `GET /api/auth/me` 检查登录状态
- 登录/登出通过 `fetch` API（cookie 自动携带，无需手动管理 token）
- `ProtectedRoute` 组件：未登录 → redirect `/login?redirect=xxx`
- `AdminRoute` 组件：非 admin → redirect `/`

---

## 部署

### 开发流程不变
```bash
git add/commit/push → 服务器 git pull → pm2 restart durian-dashboard
```

### 服务器适配
- `vite build` 输出到 `dist/`
- `server.js` 在生产环境将 `express.static` 指向 `dist/`（而非当前 `public/`）
- SPA fallback：Express 对非 `/api/*` 且非静态文件的路由返回 `dist/index.html`
- 老 `public/` 目录保留 `.html` 文件仅作为 301 redirect 目标

### 构建命令
```bash
npm run build    # vite build
npm run dev      # vite dev server (开发)
node server.js   # Express (API + 生产静态托管)
```

---

## 迁移阶段

| 阶段 | 内容 | 产出 |
|------|------|------|
| Phase 1 | 搭建 Vite + React 脚手架，配置 proxy/TanStack Query/Auth | 登录页可用 |
| Phase 2 | 迁移核心看板 (DashboardPage) + GanttChart | `/` 可访问 |
| Phase 3 | 迁移 Sentry/TV 变体 | 三个看板全部可用 |
| Phase 4 | 迁移管理后台 + SmartSheet 管理 | `/admin` 可访问 |
| Phase 5 | 迁移 Flow/Overview/Thailand + Sentry 管理后台 | 全部页面可用 |
| Phase 6 | Express 适配生产部署，老 URL redirect | 服务器部署就绪 |
| Phase 7 | 服务器部署验证 | 生产上线 |

---

## 风险

| 风险 | 缓解 |
|------|------|
| admin-smartsheet.js 61KB 逻辑复杂 | 逐模块迁移，每迁移一个 API 端点就验证一个 |
| SPA 路由与 Express 路由冲突 | Vite dev proxy + 生产 SPA fallback |
| GSAP 与 React 生命周期冲突 | useRef + useLayoutEffect + 清理函数 |
| 迁移期间双前端维护 | 新前端先部署 `/v2` 路径验证，确认后切主路径 |
| Cookie 跨端口问题（开发环境） | Vite proxy 转发，同源无跨域 |
