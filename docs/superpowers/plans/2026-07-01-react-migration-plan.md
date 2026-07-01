# React 迁移实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将榴莲运输温度监控看板前端从 vanilla HTML/CSS/JS 迁移到 Vite + React + React Router SPA，后端 Express 保持不变。

**Architecture:** Vite 构建 React SPA，React Router v6 客户端路由，TanStack Query v5 管理服务端状态（缓存/轮询），React Context 管理 auth/theme 客户端状态。开发时 Vite proxy 转发 /api 到 Express :3000；生产时 Express 托管 Vite 构建产物 dist/。

**Tech Stack:** Vite 6 + React 19 + TypeScript 5.7 + React Router v7 + TanStack Query v5 + React Bits + GSAP (保留)

## Global Constraints

- 后端 Express 代码零改动（仅新增 SPA fallback 中间件）
- 所有现有 API 端点路径不变
- JWT cookie 认证机制不变（httpOnly cookie，自动携带）
- 5 主题 CSS 变量体系保留（forest/ocean/amber/slate/violet）
- 部署方式不变：git push → 服务器 git pull → pm2 restart
- 老 URL（.html 后缀）保留 301 redirect 到新路径
- package.json 中现有后端依赖不变，仅新增前端构建依赖

---

### Task 1: 初始化 Vite + React 项目骨架

**Files:**
- Create: `vite.config.ts`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`
- Create: `index.html` (Vite entry, at project root)
- Create: `src/main.tsx`
- Create: `src/App.tsx`
- Create: `src/vite-env.d.ts`
- Modify: `package.json` (add devDependencies + scripts)
- Modify: `.gitignore` (add dist/)

**Interfaces:**
- Produces: Vite dev server on :5173 with proxy /api → :3000; `npm run dev` / `npm run build` / `npm start` scripts

- [ ] **Step 1: 安装 Vite + React + TypeScript 依赖**

```bash
cd /Users/sweetlemon/Documents/ClaudeCode/温度看板
npm install --save-dev vite@^6 @vitejs/plugin-react@^4 typescript@^5.7 @types/react@^19 @types/react-dom@^19
npm install react@^19 react-dom@^19 react-router@^7 @tanstack/react-query@^5 react-bits gsap@^3
```

- [ ] **Step 2: 创建 Vite 配置**

`vite.config.ts`:
```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
});
```

- [ ] **Step 3: 创建 TypeScript 配置**

`tsconfig.json`:
```json
{
  "files": [],
  "references": [
    { "path": "./tsconfig.app.json" },
    { "path": "./tsconfig.node.json" }
  ]
}
```

`tsconfig.app.json`:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"]
}
```

`tsconfig.node.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "strict": true,
    "noEmit": true
  },
  "include": ["vite.config.ts"]
}
```

- [ ] **Step 4: 创建 Vite 入口 HTML**

`index.html` (project root, Vite 要求):
```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>榴莲运输温度监控看板</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600;700&family=Noto+Sans+SC:wght@400;500;700;900&family=Oswald:wght@500;600;700&family=Rubik:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="/src/main.tsx"></script>
</body>
</html>
```

- [ ] **Step 5: 创建 React 入口 + App 骨架**

`src/vite-env.d.ts`:
```ts
/// <reference types="vite/client" />
```

`src/main.tsx`:
```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import App from './App';
import './styles/global.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 25_000,
      refetchInterval: 30_000,
      retry: 1,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
```

`src/App.tsx`:
```tsx
import { Routes, Route, Navigate } from 'react-router';
import { AuthProvider } from './stores/AuthContext';
import { ThemeProvider } from './stores/ThemeContext';
import { ProtectedRoute } from './components/auth/ProtectedRoute';
import { AdminRoute } from './components/auth/AdminRoute';
import LoginPage from './pages/LoginPage';

export default function App() {
  return (
    <AuthProvider>
      <ThemeProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            {/* Dashboard pages — added in Task 10 */}
            {/* Admin pages — added in Task 13 */}
            {/* Other pages — added in Task 17 */}
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </ThemeProvider>
    </AuthProvider>
  );
}
```

- [ ] **Step 6: 创建全局样式入口**

`src/styles/global.css`:
```css
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
html, body, #root { min-height: 100%; width: 100%; }
body { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; }
```

- [ ] **Step 7: 更新 package.json scripts**

在 `package.json` 中追加:
```json
{
  "scripts": {
    "start": "node server.js",
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview"
  },
  "type": "module"
}
```

注意：由于项目原本使用 CommonJS (`require`)，后端代码保持 `.js` + CommonJS。需确认 `"type": "module"` 不影响 `server.js` 的 `require()` 调用。如果冲突，移除 `"type": "module"`，前端用 `.tsx`/`.ts` 后缀由 Vite 自行处理 ESM。

- [ ] **Step 8: 更新 .gitignore 追加 dist/**

- [ ] **Step 9: 验证脚手架能跑**

```bash
npm run dev
# 打开 http://localhost:5173，应看到空白页无报错
# Vite proxy 将 /api/* 转发到 localhost:3000
```

- [ ] **Step 10: Commit**

```bash
git add -A && git commit -m "feat: init Vite + React + TypeScript scaffold"
```

---

### Task 2: API 客户端 + Auth Context

**Files:**
- Create: `src/lib/api.ts`
- Create: `src/stores/AuthContext.tsx`
- Create: `src/components/auth/ProtectedRoute.tsx`
- Create: `src/components/auth/AdminRoute.tsx`

**Interfaces:**
- Produces:
  - `api` — fetch wrapper (自动 401→login, JSON parse)
  - `useAuth()` hook — `{ user, loading, login, logout }`
  - `<ProtectedRoute>` — 未登录 redirect /login
  - `<AdminRoute>` — 非 admin redirect /

- [ ] **Step 1: 创建 API 客户端**

`src/lib/api.ts`:
```ts
const BASE = '';

class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

export async function api<T = unknown>(
  url: string,
  options: RequestInit = {},
): Promise<T> {
  const resp = await fetch(`${BASE}${url}`, {
    credentials: 'same-origin',
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });

  if (resp.status === 401) {
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect') || window.location.pathname;
    if (window.location.pathname !== '/login') {
      window.location.href = `/login?redirect=${encodeURIComponent(redirect)}`;
    }
    throw new ApiError('Unauthorized', 401);
  }

  if (resp.status === 403) {
    throw new ApiError('Forbidden', 403);
  }

  const json = await resp.json();
  if (!resp.ok) {
    throw new ApiError(json.error || `HTTP ${resp.status}`, resp.status);
  }
  return json as T;
}

export { ApiError };
```

- [ ] **Step 2: 创建 AuthContext**

`src/stores/AuthContext.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { api } from '@/lib/api';

interface User {
  username: string;
  displayName: string;
  role: 'admin' | 'viewer';
  permissions?: string[];
  dashboardPermissions?: string[];
}

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (username: string, password: string, rememberMe: boolean) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api<{ success: boolean; data: User }>('/api/auth/me', { cache: 'no-store' })
      .then((res) => {
        if (res.success) setUser(res.data);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (username: string, password: string, rememberMe: boolean) => {
    const res = await api<{ success: boolean; error?: string; data?: User }>(
      '/api/auth/login',
      {
        method: 'POST',
        body: JSON.stringify({ username, password, rememberMe }),
      },
    );
    if (!res.success) throw new Error(res.error || '登录失败');
    setUser(res.data ?? null);
  }, []);

  const logout = useCallback(async () => {
    await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
```

- [ ] **Step 3: 创建路由守卫组件**

`src/components/auth/ProtectedRoute.tsx`:
```tsx
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '@/stores/AuthContext';

export function ProtectedRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#9fb0cc', fontSize: '1.5rem', background: '#070b16',
      }}>
        加载中...
      </div>
    );
  }

  if (!user) {
    const redirect = window.location.pathname;
    return <Navigate to={`/login?redirect=${encodeURIComponent(redirect)}`} replace />;
  }

  return <Outlet />;
}
```

`src/components/auth/AdminRoute.tsx`:
```tsx
import { Navigate, Outlet } from 'react-router';
import { useAuth } from '@/stores/AuthContext';

export function AdminRoute() {
  const { user, loading } = useAuth();

  if (loading) return null;

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (user.role !== 'admin') {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 4: 验证 — 启动 dev server + Express**

```bash
# Terminal 1: node server.js  (Express on :3000)
# Terminal 2: npm run dev     (Vite on :5173)
# 打开 http://localhost:5173/login — 不应报错
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: add API client, AuthContext, route guards"
```

---

### Task 3: 登录页

**Files:**
- Create: `src/pages/LoginPage.tsx`
- Create: `src/pages/LoginPage.css`

**Interfaces:**
- Consumes: `useAuth()` from Task 2
- Produces: `/login` 路由可访问，登录成功跳转

- [ ] **Step 1: 创建 LoginPage 组件**

`src/pages/LoginPage.tsx`:
```tsx
import { useState, useEffect, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { useAuth } from '@/stores/AuthContext';
import './LoginPage.css';

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // 已登录 → 跳转
  useEffect(() => {
    if (user) {
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    }
  }, [user, navigate, searchParams]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');

    if (!username.trim() || !password) {
      setError('请输入用户名和密码');
      return;
    }

    setSubmitting(true);
    try {
      await login(username.trim(), password, rememberMe);
      const redirect = searchParams.get('redirect') || '/';
      navigate(redirect, { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <h1>🍈 榴莲运输温度监控看板</h1>
        <p className="login-subtitle">请登录以访问数据</p>

        <form className="login-form" onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="username">用户名</label>
            <input
              id="username"
              type="text"
              className="form-input"
              placeholder="请输入用户名"
              autoComplete="username"
              autoFocus
              value={username}
              onChange={(e) => setUsername(e.target.value)}
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">密码</label>
            <input
              id="password"
              type="password"
              className="form-input"
              placeholder="请输入密码"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <label className="remember-row">
            <input
              type="checkbox"
              checked={rememberMe}
              onChange={(e) => setRememberMe(e.target.checked)}
            />
            <span>记住登录状态（7天）</span>
          </label>

          <button type="submit" className="login-btn" disabled={submitting}>
            {submitting ? '登录中...' : '登 录'}
          </button>
        </form>

        {error && <div className="login-error">{error}</div>}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 LoginPage 样式**

`src/pages/LoginPage.css` — 从现有 `public/style.css` 复制并适配:

```css
.login-page {
  height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #070b16;
  font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif;
}

.login-card {
  background: rgba(20, 28, 48, 0.85);
  border: 1px solid rgba(99, 124, 168, 0.2);
  border-radius: 16px;
  padding: 40px 36px;
  width: 380px;
  max-width: 90vw;
  text-align: center;
  backdrop-filter: blur(12px);
}

.login-card h1 {
  font-size: 1.4rem;
  font-weight: 900;
  color: #eef3ff;
  letter-spacing: 0.04em;
  margin-bottom: 6px;
}

.login-subtitle {
  color: #6c7e9c;
  font-size: 0.85rem;
  margin-bottom: 28px;
}

.login-form {
  display: flex;
  flex-direction: column;
  gap: 16px;
  text-align: left;
}

.form-group label {
  display: block;
  font-size: 0.8rem;
  color: #9fb0cc;
  margin-bottom: 6px;
  font-weight: 600;
}

.form-input {
  width: 100%;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(99, 124, 168, 0.25);
  border-radius: 8px;
  color: #eef3ff;
  font-size: 0.95rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.15s;
}

.form-input:focus {
  border-color: #f5c451;
}

.form-input::placeholder {
  color: #6c7e9c;
}

.remember-row {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 0.85rem;
  color: #9fb0cc;
  cursor: pointer;
}

.remember-row input[type="checkbox"] {
  accent-color: #f5c451;
}

.login-btn {
  padding: 11px;
  background: linear-gradient(135deg, #f5c451, #eab308);
  color: #000;
  border: none;
  border-radius: 8px;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  letter-spacing: 0.08em;
  transition: opacity 0.15s;
  font-family: inherit;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.login-error {
  margin-top: 16px;
  padding: 10px 14px;
  background: rgba(248, 113, 113, 0.12);
  border: 1px solid rgba(248, 113, 113, 0.3);
  border-radius: 8px;
  color: #fca5a5;
  font-size: 0.85rem;
}
```

- [ ] **Step 3: 更新 App.tsx 注册登录路由**

在 `src/App.tsx` 中确保 login 路由已注册（已在 Task 1 中预留）。

- [ ] **Step 4: 验证登录流程**

```bash
# 确保 Express 在 :3000 运行
# npm run dev
# 打开 http://localhost:5173/login
# 输入用户名密码 → 登录 → 应跳转到 /
# 没有用户时先 node scripts/init-db.js 创建
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: login page with JWT cookie auth"
```

---

### Task 4: 主题系统 + 共享布局组件

**Files:**
- Create: `src/stores/ThemeContext.tsx`
- Create: `src/styles/themes.css`
- Create: `src/components/layout/DashboardShell.tsx`
- Create: `src/components/layout/AdminShell.tsx`
- Create: `src/components/layout/ThemeDots.tsx`

**Interfaces:**
- Produces:
  - `useTheme()` — `{ theme, setTheme, themes }` where `themes = ['forest','ocean','amber','slate','violet']`
  - `<html data-theme="...">` 自动切换
  - `DashboardShell` — 看板通用外壳（top bar + grid）
  - `AdminShell` — 管理后台通用外壳（header + tabs）

- [ ] **Step 1: 导入现有 5 主题 CSS 变量**

`src/styles/themes.css` — 从 `public/index-tv.html` 提取 5 个 `[data-theme="..."]` 块，完整复制:

```css
/* Copy-paste all 5 [data-theme] blocks from index-tv.html lines 17-80+ */

[data-theme="forest"] {
  --bg: #0a1a0f; --bg2: #0f2415; --panel: rgba(15,36,21,0.78); --panel2: rgba(10,26,15,0.92);
  --line: rgba(52,211,153,0.15); --line2: rgba(52,211,153,0.1);
  --txt: #eef7f0; --txt2: #8ab89a; --txt3: #5c8a6a;
  --accent: #4ade80; --accent2: #f59e0b;
  --th: #4ade80; --vn: #fb923c;
  --signed: #22c55e; --delivered: #2dd4bf; --transit: #f59e0b; --port: #fbbf24; --pending: #557a62;
  --danger: #f87171; --warn: #fbbf24; --ok: #34d399;
  --top-glow: rgba(74,222,128,0.12);
}

[data-theme="ocean"] {
  --bg: #06121f; --bg2: #0b1c30; --panel: rgba(11,28,48,0.78); --panel2: rgba(6,18,31,0.92);
  --line: rgba(56,189,248,0.15); --line2: rgba(56,189,248,0.1);
  --txt: #edf4fb; --txt2: #8ab4d8; --txt3: #5a84a8;
  --accent: #38bdf8; --accent2: #f472b6;
  --th: #38bdf8; --vn: #f472b6;
  --signed: #22d3ee; --delivered: #2dd4bf; --transit: #fbbf24; --port: #f59e0b; --pending: #4a6a88;
  --danger: #f87171; --warn: #fbbf24; --ok: #34d399;
  --top-glow: rgba(56,189,248,0.12);
}

[data-theme="amber"] {
  --bg: #1a1008; --bg2: #241a0f; --panel: rgba(36,26,15,0.78); --panel2: rgba(26,16,8,0.92);
  --line: rgba(245,196,81,0.18); --line2: rgba(245,196,81,0.1);
  --txt: #fef7ed; --txt2: #c4a87a; --txt3: #8a7048;
  --accent: #f5c451; --accent2: #f87171;
  --th: #f5c451; --vn: #f87171;
  --signed: #a3e635; --delivered: #2dd4bf; --transit: #fbbf24; --port: #fb923c; --pending: #6a5840;
  --danger: #f87171; --warn: #fbbf24; --ok: #34d399;
  --top-glow: rgba(245,196,81,0.14);
}

[data-theme="slate"] {
  --bg: #0d1117; --bg2: #161b22; --panel: rgba(22,27,34,0.78); --panel2: rgba(13,17,23,0.92);
  --line: rgba(148,163,184,0.15); --line2: rgba(148,163,184,0.1);
  --txt: #e6edf3; --txt2: #8b949e; --txt3: #6e7681;
  --accent: #e6edf3; --accent2: #58a6ff;
  --th: #e6edf3; --vn: #f778ba;
  --signed: #3fb950; --delivered: #39d2c0; --transit: #d29922; --port: #e3b341; --pending: #484f58;
  --danger: #f85149; --warn: #d29922; --ok: #3fb950;
  --top-glow: rgba(230,237,243,0.06);
}

[data-theme="violet"] {
  --bg: #1f1633; --bg2: #150f23; --panel: rgba(21,15,35,0.78); --panel2: rgba(21,15,35,0.92);
  --line: rgba(54,45,89,0.5); --line2: rgba(54,45,89,0.3);
  --txt: #ffffff; --txt2: rgba(255,255,255,0.72); --txt3: rgba(255,255,255,0.38);
  --accent: #c2ef4e; --accent2: #e879f9;
  --th: #c2ef4e; --vn: #e879f9;
  --signed: #4ade80; --delivered: #22d3ee; --transit: #fbbf24; --port: #fb923c; --pending: #5b5a8a;
  --danger: #f87171; --warn: #fbbf24; --ok: #34d399;
  --top-glow: rgba(194,239,78,0.08);
}
```

- [ ] **Step 2: 创建 ThemeContext**

`src/stores/ThemeContext.tsx`:
```tsx
import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export const THEMES = ['forest', 'ocean', 'amber', 'slate', 'violet'] as const;
export type Theme = (typeof THEMES)[number];

interface ThemeState {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

const ThemeContext = createContext<ThemeState>({
  theme: 'amber',
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    const stored = localStorage.getItem('tv-theme');
    return THEMES.includes(stored as Theme) ? (stored as Theme) : 'amber';
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const setTheme = useCallback((t: Theme) => {
    setThemeState(t);
    localStorage.setItem('tv-theme', t);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
```

- [ ] **Step 3: 创建 ThemeDots 组件**

`src/components/layout/ThemeDots.tsx`:
```tsx
import { useTheme, THEMES, type Theme } from '@/stores/ThemeContext';

const DOT_COLORS: Record<Theme, string> = {
  forest: '#4ade80',
  ocean: '#38bdf8',
  amber: '#f5c451',
  slate: '#e6edf3',
  violet: '#c2ef4e',
};

export function ThemeDots() {
  const { theme, setTheme } = useTheme();

  return (
    <div style={{
      position: 'fixed', bottom: '2vh', right: '2vw', display: 'flex', gap: '1.2vh',
      zIndex: 1000, padding: '1vh 1.5vw', borderRadius: '2vh',
      background: 'rgba(0,0,0,0.4)',
    }}>
      {THEMES.map((t) => (
        <button
          key={t}
          onClick={() => setTheme(t)}
          title={t}
          style={{
            width: '2vh', height: '2vh', borderRadius: '50%',
            background: DOT_COLORS[t],
            border: theme === t ? '2px solid #fff' : '2px solid transparent',
            cursor: 'pointer', padding: 0,
            transform: theme === t ? 'scale(1.3)' : 'scale(1)',
            transition: 'transform 0.2s, border 0.2s',
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 创建 DashboardShell 组件**

`src/components/layout/DashboardShell.tsx`:
```tsx
import { type ReactNode } from 'react';
import { useAuth } from '@/stores/AuthContext';
import { useTheme } from '@/stores/ThemeContext';
import { Clock } from '@/components/ui/Clock';

interface Props {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** 是否允许切主题（TV 页面 true，普通看板 false） */
  showThemeDots?: boolean;
  /** 如果是 TV 页面，使用单视口无滚动布局 */
  tv?: boolean;
}

export function DashboardShell({ title, subtitle, children, showThemeDots, tv }: Props) {
  const { user, logout } = useAuth();
  const { theme } = useTheme();

  return (
    <div
      className={tv ? 'board-tv' : 'board'}
      style={{
        background: tv ? 'var(--bg)' : undefined,
        height: '100vh', width: '100vw', overflow: tv ? 'hidden' : 'auto',
        display: 'grid',
        gridTemplateRows: tv ? 'auto 1fr' : '6vh 41.5vh 1fr',
        gap: '1.1vh', padding: '1.1vh 1.1vw',
      }}
    >
      {/* Top bar */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '1.3vw', padding: '0 1.3vw',
        borderRadius: '1.1vh',
        background: `linear-gradient(90deg, rgba(234,179,8,.14), rgba(239,68,68,.14))`,
        border: '1px solid var(--line)',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '.8vw', flexShrink: 0 }}>
          <span style={{ fontSize: '3vh' }}>🍈</span>
          <div>
            <div style={{ fontWeight: 900, fontSize: '2.2vh', letterSpacing: '.08em', color: 'var(--txt)' }}>
              {title || '榴莲交付总览'}
            </div>
            <div style={{ fontSize: '1.2vh', color: 'var(--txt2)', letterSpacing: '.06em' }}>
              {subtitle || 'DURIAN DELIVERY OVERVIEW'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <Clock />

        <div style={{ display: 'flex', alignItems: 'center', gap: '.5vw', fontSize: '1.2vh', color: 'var(--txt2)' }}>
          <span>👤</span>
          <span style={{ color: 'var(--accent)', fontWeight: 700, maxWidth: '8vw', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {user?.displayName || user?.username}
          </span>
          {user?.role === 'admin' && (
            <a href="/admin" style={{
              color: 'var(--accent)', textDecoration: 'none',
              border: '1px solid rgba(245,196,81,.4)', padding: '.2vh .55vw', borderRadius: '.5vh',
              fontSize: '1.15vh',
            }}>后台</a>
          )}
          <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{
            color: 'var(--txt2)', textDecoration: 'none',
            border: '1px solid var(--line)', padding: '.2vh .55vw', borderRadius: '.5vh',
            fontSize: '1.15vh',
          }}>退出</a>
        </div>
      </header>

      {children}

      {showThemeDots && <ThemeDots />}
    </div>
  );
}
```

- [ ] **Step 5: 创建 Clock 组件**

`src/components/ui/Clock.tsx`:
```tsx
import { useState, useEffect } from 'react';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '.1vh', lineHeight: 1.1 }}>
      <div style={{ fontSize: '1.25vh', color: 'var(--txt2)', fontWeight: 500 }}>{dateStr}</div>
      <div style={{ fontSize: '1.9vh', color: 'var(--txt)', letterSpacing: '.05em', fontFamily: 'Oswald, sans-serif', fontWeight: 700 }}>
        {timeStr}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 更新 global.css 导入 themes.css**

在 `src/styles/global.css` 顶部追加:
```css
@import './themes.css';
```

- [ ] **Step 7: 验证主题切换**

手动在浏览器 console 执行 `document.documentElement.setAttribute('data-theme', 'ocean')`，确认 CSS 变量生效。

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: theme system, DashboardShell, Clock, ThemeDots"
```

---

### Task 5: 数据查询 Hooks（TanStack Query）

**Files:**
- Create: `src/hooks/useAggregate.ts`
- Create: `src/hooks/useDashboard.ts`
- Create: `src/hooks/useConfigInfo.ts`
- Create: `src/hooks/useNews.ts`
- Create: `src/hooks/useOrders.ts`
- Create: `src/hooks/useLogistics.ts`
- Create: `src/hooks/useSmartsheet.ts`

**Interfaces:**
- Produces: 所有页面可用的数据 hooks，自动缓存 + 30s 轮询

- [ ] **Step 1: 创建 useAggregate hook**

`src/hooks/useAggregate.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AggregateData {
  meta?: { title?: string; subtitle?: string };
  visibility?: Record<string, boolean>;
  global?: {
    totalOrders: number;
    totalBoxes: number;
    totalArrived: number;
    totalDone: number;
    totalMoving: number;
    totalPending: number;
  };
  th?: CountryData;
  vn?: CountryData;
  logistics?: unknown;
  news?: unknown;
  _source?: string;
  generatedAt?: string;
}

export interface CountryData {
  country: string;
  flag: string;
  brands: BrandData[];
  kpis: KpiData;
  overall: OverallData;
}

export interface BrandData {
  brand: string;
  category: string;
  orders: number;
  boxes: number;
  signed: number;
  delivered: number;
  rate: number;
}

export interface KpiData {
  totalOrders: number;
  totalBoxes: number;
  doneBoxes: number;
  doneRate: number;
  transitBoxes: number;
  portBoxes: number;
  pendingBoxes: number;
}

export interface OverallData {
  signed: number;
  delivered: number;
  transit: number;
  port: number;
  pending: number;
}

export function useAggregate() {
  return useQuery<AggregateData>({
    queryKey: ['aggregate'],
    queryFn: () => api<AggregateData>('/api/aggregate', { cache: 'no-store' }),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
```

- [ ] **Step 2: 创建 useDashboard hook**

`src/hooks/useDashboard.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TempRecord {
  containerNo: string;
  brand?: string;
  setTemp?: number;
  supplyTemp?: number;
  returnTemp?: number;
  updateTime: string;
  position?: string;
  flavor?: string;
  checkpoint?: string;
}

export interface DashboardResponse {
  success: boolean;
  data: {
    records: TempRecord[];
    stats?: unknown;
    alerts?: unknown;
    containers?: string[];
    detention?: unknown;
  };
}

export function useDashboard(hours = 168, limit = 500) {
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard', hours, limit],
    queryFn: () =>
      api<DashboardResponse>(
        `/api/dashboard?hours=${hours}&limit=${limit}`,
        { cache: 'no-store' },
      ),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
```

- [ ] **Step 3: 创建 useConfigInfo hook**

`src/hooks/useConfigInfo.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useConfigInfo() {
  return useQuery({
    queryKey: ['configInfo'],
    queryFn: () => api<{ success: boolean; data: unknown }>('/api/config/info'),
    staleTime: 4 * 60_000, // 5min schema cache on server side
  });
}
```

- [ ] **Step 4: 创建 useNews hook**

`src/hooks/useNews.ts`:
```ts
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAutoNews() {
  return useQuery({
    queryKey: ['autoNews'],
    queryFn: () => api<{ success: boolean; data: { items: unknown[]; fetchedAt: string } }>('/api/news/auto'),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });
}
```

- [ ] **Step 5: 创建 useOrders hook**

`src/hooks/useOrders.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

interface Order {
  id: string;
  sort: number;
  [key: string]: unknown;
}

export function useOrders() {
  return useQuery<Order[]>({
    queryKey: ['orders'],
    queryFn: () => api<Order[]>('/api/orders'),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: Record<string, unknown>) =>
      api<Order>('/api/orders', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useUpdateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api(`/api/orders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useDeleteOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api(`/api/orders/${id}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}

export function useReorderOrders() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      api('/api/orders/reorder', { method: 'PUT', body: JSON.stringify({ ids }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['orders'] }),
  });
}
```

- [ ] **Step 6: 创建 useLogistics hook**

`src/hooks/useLogistics.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useLogistics() {
  return useQuery({ queryKey: ['logistics'], queryFn: () => api('/api/logistics') });
}

export function useUpdateLogistics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api(`/api/logistics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logistics'] }),
  });
}
```

- [ ] **Step 7: 创建 useSmartsheet hooks（基本记录查询）**

`src/hooks/useSmartsheet.ts`:
```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRecords(sheetId: string, limit = 500) {
  return useQuery({
    queryKey: ['smartsheet', 'records', sheetId],
    queryFn: () => api<{ success: boolean; data: unknown[] }>(`/api/smartsheet/records?sheetId=${sheetId}&limit=${limit}`),
    enabled: !!sheetId,
  });
}

export function useAddRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; values: Record<string, unknown> }) =>
      api('/api/smartsheet/records/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; recordId: string; values: Record<string, unknown> }) =>
      api('/api/smartsheet/records/update', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; recordIds: string[] }) =>
      api('/api/smartsheet/records/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_, vars) => qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useSheets() {
  return useQuery({
    queryKey: ['smartsheet', 'sheets'],
    queryFn: () => api('/api/config/info'),
  });
}

export function useAddSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string }) =>
      api('/api/smartsheet/sheet/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}

export function useDeleteSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string }) =>
      api('/api/smartsheet/sheet/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}

export function useAddField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fields: unknown[] }) =>
      api('/api/smartsheet/fields/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: TanStack Query hooks for all API endpoints"
```

---

### Task 6: 甘特图组件

**Files:**
- Create: `src/components/gantt/GanttChart.tsx`
- Create: `src/components/gantt/GanttChart.css`

**Interfaces:**
- Consumes: `useDashboard()` from Task 5
- Produces: `<GanttChart>` 组件，接收可选 `tempType` 和 `height` props

- [ ] **Step 1: 创建甘特图颜色工具函数**

`src/components/gantt/colorUtils.ts`:
```ts
export function tempColor(val: number): string {
  const stops = [
    { t: 6, r: 21, g: 101, b: 192 },
    { t: 10, r: 66, g: 165, b: 245 },
    { t: 12, r: 102, g: 187, b: 106 },
    { t: 14, r: 255, g: 235, b: 59 },
    { t: 16, r: 255, g: 152, b: 0 },
    { t: 20, r: 244, g: 67, b: 54 },
  ];

  if (val <= stops[0].t) return `rgb(${stops[0].r},${stops[0].g},${stops[0].b})`;
  const last = stops[stops.length - 1];
  if (val >= last.t) return `rgb(${last.r},${last.g},${last.b})`;

  for (let i = 0; i < stops.length - 1; i++) {
    if (val >= stops[i].t && val <= stops[i + 1].t) {
      const ratio = (val - stops[i].t) / (stops[i + 1].t - stops[i].t);
      const r = Math.round(stops[i].r + (stops[i + 1].r - stops[i].r) * ratio);
      const g = Math.round(stops[i].g + (stops[i + 1].g - stops[i].g) * ratio);
      const b = Math.round(stops[i].b + (stops[i + 1].b - stops[i].b) * ratio);
      return `rgb(${r},${g},${b})`;
    }
  }
  return '#888';
}

export function textColor(rgb: string): string {
  const m = rgb.match(/(\d+)/g);
  if (!m) return '#fff';
  const brightness = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
  return brightness > 150 ? '#111' : '#fff';
}

export function getLast7Days(now: Date) {
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
    });
  }
  return days;
}
```

- [ ] **Step 2: 创建 GanttChart 组件**

`src/components/gantt/GanttChart.tsx`:
```tsx
import { useMemo, useState } from 'react';
import { useDashboard, type TempRecord } from '@/hooks/useDashboard';
import { tempColor, textColor, getLast7Days } from './colorUtils';
import './GanttChart.css';

interface Props {
  tempType?: 'returnTemp' | 'supplyTemp' | 'setTemp';
  onContainerClick?: (containerNo: string) => void;
}

export function GanttChart({ tempType = 'returnTemp', onContainerClick }: Props) {
  const { data, isLoading, isError } = useDashboard(168, 500);
  const [now] = useState(() => new Date());
  const days = useMemo(() => getLast7Days(now), [now]);

  const ganttData = useMemo(() => {
    const map: Record<string, Record<string, { value: number }>> = {};
    const records = data?.data?.records ?? [];

    records.forEach((r: TempRecord) => {
      const cNo = r.containerNo || '未知';
      const t = r.updateTime ? new Date(r.updateTime) : null;
      if (!t || isNaN(t.getTime())) return;

      const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const val = r[tempType] as number | undefined;
      if (val === null || val === undefined || isNaN(val)) return;

      if (!map[cNo]) map[cNo] = {};
      const existing = map[cNo][dateKey];
      if (!existing || t.getTime() > (existing as unknown as { _ts: number })._ts) {
        map[cNo][dateKey] = { value: Math.round(val * 10) / 10 };
        (map[cNo][dateKey] as unknown as { _ts: number })._ts = t.getTime();
      }
    });

    return map;
  }, [data, tempType]);

  const containers = useMemo(() => {
    const set = new Set<string>();
    (data?.data?.records ?? []).forEach((r: TempRecord) => {
      if (r.containerNo) set.add(r.containerNo);
    });
    return Array.from(set).sort();
  }, [data]);

  if (isLoading) return <div className="gantt-empty">加载温度数据...</div>;
  if (isError || !data?.success) return <div className="gantt-empty">温度数据加载失败</div>;
  if (containers.length === 0) return <div className="gantt-empty">暂无温度数据</div>;

  return (
    <div className="gantt-wrap">
      <table className="gantt-table">
        <thead>
          <tr>
            <th className="gantt-row-label">柜号</th>
            {days.map((d) => (
              <th key={d.key}>{d.label}<br /><small>周{d.dayOfWeek}</small></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {containers.map((cNo) => (
            <tr key={cNo}>
              <td className="gantt-row-label">
                {onContainerClick ? (
                  <button className="drill-link" onClick={() => onContainerClick(cNo)}>
                    {cNo}
                  </button>
                ) : (
                  cNo
                )}
              </td>
              {days.map((d) => {
                const cell = ganttData[cNo]?.[d.key];
                if (cell) {
                  const bg = tempColor(cell.value);
                  return (
                    <td key={d.key} style={{ background: bg, color: textColor(bg) }}>
                      {cell.value}°
                    </td>
                  );
                }
                return <td key={d.key} className="gantt-empty-cell">-</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: 创建甘特图样式**

`src/components/gantt/GanttChart.css`:
```css
.gantt-wrap {
  overflow-x: auto;
  overflow-y: auto;
  max-height: inherit;
}

.gantt-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 1.15vh;
  font-family: "Oswald", "Barlow Condensed", sans-serif;
}

.gantt-table th, .gantt-table td {
  padding: 0.6vh 0.4vw;
  text-align: center;
  border: 1px solid var(--line);
  white-space: nowrap;
}

.gantt-table th {
  color: var(--txt3);
  font-weight: 600;
  font-size: 1.05vh;
}

.gantt-table th small {
  font-weight: 400;
  color: var(--txt3);
  opacity: 0.7;
}

.gantt-row-label {
  position: sticky;
  left: 0;
  background: var(--panel2) !important;
  color: var(--txt);
  font-weight: 700;
  text-align: left !important;
  padding-left: 0.6vw !important;
  z-index: 1;
}

.gantt-empty-cell {
  color: var(--txt3);
}

.gantt-empty {
  padding: 40px;
  text-align: center;
  color: var(--txt3);
  font-size: 1.5vh;
}

.drill-link {
  background: none;
  border: none;
  color: var(--accent);
  cursor: pointer;
  font-weight: 700;
  font-size: inherit;
  font-family: inherit;
  text-decoration: underline;
  text-underline-offset: 2px;
}

.drill-link:hover {
  color: #fff;
}
```

- [ ] **Step 4: 验证甘特图可渲染**

在 App.tsx 临时添加 GanttChart 测试路由，确认数据加载和颜色渲染正确。

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: GanttChart component with temperature heatmap"
```

---

### Task 7: 看板核心页面 — DashboardPage（原 index.html）

**Files:**
- Create: `src/pages/DashboardPage.tsx`
- Create: `src/pages/DashboardPage.css`
- Create: `src/components/dashboard/CountryPanel.tsx`
- Create: `src/components/dashboard/KpiCards.tsx`
- Create: `src/components/dashboard/ProgressBar.tsx`
- Create: `src/components/dashboard/GlobalAgg.tsx`
- Create: `src/components/dashboard/NewsPanel.tsx`
- Create: `src/components/dashboard/LogisticsPanel.tsx`
- Modify: `src/App.tsx` (register route `/`)

**Interfaces:**
- Consumes: `useAggregate()` from Task 5, `DashboardShell` from Task 4, `GanttChart` from Task 6
- Produces: 首页 `/` 完全可用，与原 index.html 功能对等

- [ ] **Step 1: 创建 GlobalAgg 组件（顶部统计条）**

`src/components/dashboard/GlobalAgg.tsx`:
```tsx
import type { AggregateData } from '@/hooks/useAggregate';

export function GlobalAgg({ data }: { data: AggregateData['global'] }) {
  if (!data) return null;

  const items = [
    { v: data.totalOrders, u: '合计订单 / 单' },
    { v: data.totalBoxes, u: '合计箱量 / 柜' },
    { v: data.totalArrived || 0, u: '已到岸 / 柜' },
    { v: data.totalDone, u: '已签收 / 柜', cls: 'green' },
    { v: data.totalMoving, u: '国外在途 / 柜' },
    { v: data.totalPending, u: '待发 / 柜' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: '1.1vw' }}>
      {items.map((item, i) => (
        <div key={i} style={{ display: 'flex', flexDirection: 'column', lineHeight: 1.05, flexShrink: 0 }}>
          <span className="num" style={{
            fontSize: '2.7vh',
            color: item.cls === 'green' ? 'var(--signed)' : 'var(--accent)',
            fontFamily: 'Oswald, sans-serif', fontWeight: 700,
          }}>{item.v}</span>
          <span style={{ fontSize: '1.05vh', color: 'var(--txt3)', letterSpacing: '.04em', marginTop: '.2vh' }}>
            {item.u}
          </span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: 创建 CountryPanel 组件**

`src/components/dashboard/CountryPanel.tsx`:
```tsx
import type { CountryData, BrandData } from '@/hooks/useAggregate';
import { ProgressBar } from './ProgressBar';

export function CountryPanel({ data, side }: { data: CountryData; side: 'TH' | 'VN' }) {
  if (!data) return null;

  const isTH = side === 'TH';
  const flag = isTH ? '🇹🇭' : '🇻🇳';
  const name = isTH ? '泰国产线' : '越南产线';

  return (
    <div className="country-panel" style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '1.3vh',
      padding: '1.2vh 1.3vw 1.3vh',
      borderTop: `.42vh solid var(--${side === 'TH' ? 'th' : 'vn'})`,
      display: 'flex', flexDirection: 'column', gap: '.95vh', minHeight: 0, overflow: 'hidden',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6vw' }}>
        <span style={{ fontSize: '2.7vh' }}>{flag}</span>
        <span style={{ fontSize: '2.3vh', fontWeight: 900, letterSpacing: '.07em', color: 'var(--txt)' }}>
          {name}
        </span>
      </div>

      {/* KPI cards */}
      <div style={{ display: 'flex', gap: '.55vw' }}>
        <KpiBox label="总订单" value={data.kpis?.totalOrders ?? 0} color="var(--txt)" />
        <KpiBox label="总箱量" value={data.kpis?.totalBoxes ?? 0} color="var(--txt)" />
        <KpiBox label="已签收" value={data.kpis?.doneBoxes ?? 0} color="var(--signed)" />
        <KpiBox label="签收率" value={`${data.kpis?.doneRate ?? 0}%`} color="var(--delivered)" />
        <KpiBox label="在途" value={data.kpis?.transitBoxes ?? 0} color="var(--transit)" />
        <KpiBox label="待发" value={data.kpis?.pendingBoxes ?? 0} color="var(--pending)" />
      </div>

      {/* Overall progress bar */}
      {data.overall && <ProgressBar data={data.overall} />}

      {/* Brand rows */}
      {(data.brands ?? []).map((brand) => (
        <BrandRow key={`${brand.brand}-${brand.category}`} brand={brand} />
      ))}
    </div>
  );
}

function KpiBox({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <div style={{
      flex: '1 1 0', minWidth: 0, textAlign: 'center',
      background: 'var(--panel2)', border: '1px solid var(--line2)',
      borderRadius: '.9vh', padding: '.7vh .4vw',
    }}>
      <div className="num" style={{ fontSize: '2.7vh', lineHeight: 1, color, fontFamily: 'Oswald, sans-serif', fontWeight: 700 }}>
        {value}
      </div>
      <div style={{ fontSize: '1.05vh', color: 'var(--txt3)', marginTop: '.4vh' }}>{label}</div>
    </div>
  );
}

function BrandRow({ brand }: { brand: BrandData }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: '.6vw', padding: '.6vh .5vw',
      background: 'var(--panel2)', borderRadius: '.7vh', border: '1px solid var(--line2)',
    }}>
      <span style={{
        display: 'inline-block', padding: '2px 8px', borderRadius: '4px',
        fontSize: '1.1vh', fontWeight: 700,
        background: brand.category === 'FRESH' ? 'rgba(239,68,68,.18)' : 'rgba(56,189,248,.18)',
        color: brand.category === 'FRESH' ? '#fca5a5' : '#7dd3fc',
      }}>
        {brand.category === 'FRESH' ? '鲜果' : '冻果'}
      </span>
      <span style={{ fontWeight: 700, color: 'var(--txt)', fontSize: '1.3vh' }}>{brand.brand}</span>
      <span style={{ color: 'var(--txt2)', fontSize: '1.1vh' }}>订单 {brand.orders} · 箱量 {brand.boxes}</span>
      <div style={{ flex: 1 }} />
      <span className="num" style={{
        fontSize: '1.6vh', fontWeight: 700,
        color: brand.rate >= 80 ? 'var(--signed)' : brand.rate >= 50 ? 'var(--warn)' : 'var(--danger)',
        fontFamily: 'Oswald, sans-serif',
      }}>
        签收率 {brand.rate}%
      </span>
    </div>
  );
}
```

- [ ] **Step 3: 创建 ProgressBar 组件**

`src/components/dashboard/ProgressBar.tsx`:
```tsx
import type { OverallData } from '@/hooks/useAggregate';

export function ProgressBar({ data }: { data: OverallData }) {
  const total = data.signed + data.delivered + data.transit + data.port + data.pending;
  if (total === 0) return null;

  const segments = [
    { v: data.signed, bg: 'var(--signed)', label: '已签' },
    { v: data.delivered, bg: 'var(--delivered)', label: '已交' },
    { v: data.transit, bg: 'var(--transit)', label: '在途' },
    { v: data.port, bg: 'var(--port)', label: '到港' },
    { v: data.pending, bg: 'var(--pending)', label: '待发' },
  ];

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '.8vw' }}>
      <span style={{ fontSize: '1.25vh', color: 'var(--txt2)', fontWeight: 700, whiteSpace: 'nowrap' }}>
        总体进度
      </span>
      <div style={{
        flex: 1, height: '2.3vh', background: 'rgba(255,255,255,.05)',
        borderRadius: '.55vh', display: 'flex', overflow: 'hidden',
        border: '1px solid var(--line2)',
      }}>
        {segments.filter(s => s.v > 0).map((s, i) => (
          <div key={i} style={{
            flex: s.v,
            background: s.bg,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '1vh', fontWeight: 700, color: '#000',
            minWidth: s.v / total > 0.05 ? 0 : '2ch',
          }}>
            {s.v / total > 0.08 ? `${s.label} ${s.v}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 NewsPanel 和 LogisticsPanel 占位组件**

`src/components/dashboard/NewsPanel.tsx`:
```tsx
export function NewsPanel({ data }: { data: unknown }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '1.3vh',
      padding: '1.2vh 1.3vw', minHeight: 0, overflow: 'auto',
    }}>
      <h3 style={{ fontSize: '1.6vh', fontWeight: 900, color: 'var(--txt)', marginBottom: '1vh' }}>
        📰 行业资讯
      </h3>
      <p style={{ color: 'var(--txt3)', fontSize: '1.2vh' }}>
        {data ? '新闻已加载' : '暂无资讯'}
      </p>
    </div>
  );
}
```

`src/components/dashboard/LogisticsPanel.tsx`:
```tsx
export function LogisticsPanel({ data }: { data: unknown }) {
  return (
    <div style={{
      background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '1.3vh',
      padding: '1.2vh 1.3vw', minHeight: 0, overflow: 'auto',
    }}>
      <h3 style={{ fontSize: '1.6vh', fontWeight: 900, color: 'var(--txt)', marginBottom: '1vh' }}>
        🚢 物流监控
      </h3>
      <p style={{ color: 'var(--txt3)', fontSize: '1.2vh' }}>
        {data ? '物流已加载' : '暂无数据'}
      </p>
    </div>
  );
}
```

- [ ] **Step 5: 创建 DashboardPage**

`src/pages/DashboardPage.tsx`:
```tsx
import { DashboardShell } from '@/components/layout/DashboardShell';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { LogisticsPanel } from '@/components/dashboard/LogisticsPanel';
import { NewsPanel } from '@/components/dashboard/NewsPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { useAggregate } from '@/hooks/useAggregate';
import { useAuth } from '@/stores/AuthContext';
import './DashboardPage.css';

export default function DashboardPage() {
  const { data, isLoading } = useAggregate();
  const { user } = useAuth();

  if (isLoading) {
    return <DashboardShell><LoadingScreen /></DashboardShell>;
  }

  const hasTH = data?.visibility?.th !== false;
  const hasVN = data?.visibility?.vn !== false;
  const hasLogistics = data?.visibility?.logistics !== false;
  const hasNews = data?.visibility?.news !== false;
  const hasGantt = data?.visibility?.gantt !== false;

  return (
    <DashboardShell title={data?.meta?.title} subtitle={data?.meta?.subtitle}>
      {/* Top bar stats — rendered inside the DashboardShell top bar slot */}
      <div style={{ display: 'none' }}>{/* GlobalAgg integrated into DashboardShell header */}</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1vw', paddingLeft: '1.3vw' }}>
        {data?.global && <GlobalAgg data={data.global} />}
      </div>

      {/* Country panels */}
      <div className="dashboard-main" style={{
        display: 'grid',
        gridTemplateColumns: hasTH && hasVN ? '1fr 1fr' : '1fr',
        gap: '1.1vw', minHeight: 0,
      }}>
        {hasTH && data?.th && <CountryPanel data={data.th} side="TH" />}
        {hasVN && data?.vn && <CountryPanel data={data.vn} side="VN" />}
      </div>

      {/* Bottom row: logistics + news */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: hasLogistics && hasNews ? '2.2fr 1fr' : '1fr',
        gap: '1.1vw', minHeight: hasLogistics || hasNews ? '20vh' : 0,
      }}>
        {hasLogistics && <LogisticsPanel data={data?.logistics} />}
        {hasNews && <NewsPanel data={data?.news} />}
      </div>

      {/* Gantt */}
      {hasGantt && (
        <div style={{ maxHeight: '22vh', overflow: 'hidden', marginTop: '1.1vh' }}>
          <GanttChart />
        </div>
      )}

      {/* Data source + timestamp */}
      <div style={{ fontSize: '1.1vh', color: 'var(--txt3)', textAlign: 'right', paddingRight: '1vw' }}>
        最后更新 {data?.generatedAt ? new Date(data.generatedAt).toLocaleTimeString('zh-CN') : '--'}
        {data?._source === 'wecom' ? ' · 📡企微' : ' · ✏️手动'}
      </div>
    </DashboardShell>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--txt2)', fontSize: '2vh',
    }}>
      加载数据...
    </div>
  );
}
```

- [ ] **Step 6: 创建 DashboardPage 样式**

`src/pages/DashboardPage.css`:
```css
.dashboard-main {
  min-height: 0;
}

.num {
  font-family: "Oswald", "Barlow Condensed", sans-serif;
  font-weight: 700;
  font-feature-settings: "tnum";
}

/* Background gradient for dashboard */
[data-theme="amber"] .board-bg {
  background:
    radial-gradient(1200px 600px at 12% -10%, rgba(234,179,8,.10), transparent 60%),
    radial-gradient(1200px 600px at 88% -10%, rgba(239,68,68,.10), transparent 60%),
    var(--bg);
}
```

- [ ] **Step 7: 更新 App.tsx 注册路由**

在 `src/App.tsx` 的 `<Route element={<ProtectedRoute />}>` 内添加:
```tsx
<Route index element={<DashboardPage />} />
```

- [ ] **Step 8: 验证首页功能**

```bash
npm run dev
# 打开 http://localhost:5173
# 应看到：顶栏（用户信息、时钟）、统计条、泰国/越南面板、进度条、品牌行
# 底部：物流、资讯、甘特图
```

- [ ] **Step 9: Commit**

```bash
git add -A && git commit -m "feat: DashboardPage with country panels, progress bar, gantt"
```

---

### Task 8: 看板变体页面 — Sentry + TV

**Files:**
- Create: `src/pages/DashboardSentryPage.tsx`
- Create: `src/pages/DashboardTvPage.tsx`
- Modify: `src/App.tsx` (register routes)

**Interfaces:**
- Consumes: 所有 Task 5 hooks + Task 6 GanttChart + Task 7 子组件
- Produces: `/sentry` 和 `/tv` 两个路由可用

- [ ] **Step 1: 创建 DashboardSentryPage**

`src/pages/DashboardSentryPage.tsx` — 复用 DashboardPage 的所有子组件，深紫 + 亮绿主题。核心差异在样式（hero section、eyebrow labels、feature cards、96px section spacing）。初始版本使用与 DashboardPage 相同的数据获取逻辑，但应用 Sentry 样式。

```tsx
import { DashboardShell } from '@/components/layout/DashboardShell';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { useAggregate } from '@/hooks/useAggregate';
import { useTheme } from '@/stores/ThemeContext';
import { useEffect } from 'react';

export default function DashboardSentryPage() {
  const { data, isLoading } = useAggregate();
  const { setTheme } = useTheme();

  useEffect(() => {
    setTheme('violet');
  }, [setTheme]);

  if (isLoading) return <DashboardShell><LoadingScreen /></DashboardShell>;

  return (
    <DashboardShell title={data?.meta?.title || '榴莲交付总览'} subtitle="DURIAN DELIVERY · SENTRY VIEW">
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.1vw', paddingLeft: '1.3vw' }}>
        {data?.global && <GlobalAgg data={data.global} />}
      </div>

      <div className="dashboard-main" style={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.1vw', minHeight: 0,
      }}>
        {data?.th && <CountryPanel data={data.th} side="TH" />}
        {data?.vn && <CountryPanel data={data.vn} side="VN" />}
      </div>

      <div style={{ maxHeight: '22vh', overflow: 'hidden', marginTop: '1.1vh' }}>
        <GanttChart />
      </div>
    </DashboardShell>
  );
}

function LoadingScreen() {
  return (
    <div style={{
      height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'rgba(255,255,255,0.5)', fontSize: '2vh',
    }}>
      加载数据...
    </div>
  );
}
```

- [ ] **Step 2: 创建 DashboardTvPage**

`src/pages/DashboardTvPage.tsx` — 单视口零滚动，5 主题切换。ThemeDots 在主内容区外。

```tsx
import { useAggregate } from '@/hooks/useAggregate';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { ThemeDots } from '@/components/layout/ThemeDots';
import { Clock } from '@/components/ui/Clock';
import { useAuth } from '@/stores/AuthContext';

export default function DashboardTvPage() {
  const { data, isLoading } = useAggregate();
  const { user, logout } = useAuth();

  if (isLoading) {
    return (
      <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'var(--bg)', color: 'var(--txt2)', fontSize: '2vh' }}>
        加载数据...
      </div>
    );
  }

  return (
    <div style={{
      height: '100vh', width: '100vw', overflow: 'hidden',
      background: 'var(--bg)', color: 'var(--txt)',
      display: 'grid', gridTemplateRows: 'auto 1fr',
      gap: '1.1vh', padding: '1.1vh 1.1vw',
    }}>
      {/* Compact top bar for TV */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '1vw', padding: '0.6vh 1vw',
        background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: '1vh',
      }}>
        <span style={{ fontSize: '2.5vh' }}>🍈</span>
        <span style={{ fontWeight: 900, fontSize: '1.8vh', color: 'var(--txt)' }}>
          {data?.meta?.title || '榴莲交付总览'}
        </span>
        <div style={{ flex: 1 }} />
        {data?.global && <GlobalAgg data={data.global} />}
        <div style={{ flex: 1 }} />
        <Clock />
      </header>

      {/* Main grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: data?.th && data?.vn ? '1fr 1fr' : '1fr',
        gridTemplateRows: '1fr auto',
        gap: '1.1vw', minHeight: 0,
      }}>
        {data?.th && <CountryPanel data={data.th} side="TH" />}
        {data?.vn && <CountryPanel data={data.vn} side="VN" />}
      </div>

      {/* Gantt at bottom */}
      <div style={{ maxHeight: '18vh', overflow: 'hidden' }}>
        <GanttChart />
      </div>

      <ThemeDots />
    </div>
  );
}
```

- [ ] **Step 3: 更新 App.tsx 注册路由**

```tsx
<Route path="/sentry" element={<DashboardSentryPage />} />
<Route path="/tv" element={<DashboardTvPage />} />
```

- [ ] **Step 4: 验证**

```bash
npm run dev
# 打开 http://localhost:5173/sentry → Sentry 主题看板
# 打开 http://localhost:5173/tv → TV 5主题切换看板
```

- [ ] **Step 5: Commit**

```bash
git add -A && git commit -m "feat: DashboardSentryPage, DashboardTvPage with theme support"
```

---

### Task 9: AdminShell + 管理后台页面

**Files:**
- Create: `src/components/layout/AdminShell.tsx`
- Create: `src/pages/AdminPage.tsx`
- Create: `src/pages/AdminPage.css`
- Create: `src/components/admin/OrdersTab.tsx`
- Create: `src/components/admin/LogisticsTab.tsx`
- Create: `src/components/admin/NewsTab.tsx`
- Create: `src/components/admin/SmartSheetTab.tsx`
- Modify: `src/App.tsx` (register `/admin` route with `<AdminRoute>`)

**Interfaces:**
- Consumes: `useAuth()` from Task 2, all hooks from Task 5
- Produces: `/admin` 管理后台完全可用（订单/物流/新闻/智能表格 4 个 tab）

- [ ] **Step 1: 创建 AdminShell 组件**

`src/components/layout/AdminShell.tsx`:
```tsx
import { type ReactNode, useState } from 'react';
import { useAuth } from '@/stores/AuthContext';

interface Tab {
  key: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: 'orders', label: '订单管理', icon: '📦' },
  { key: 'logistics', label: '物流监控', icon: '🚢' },
  { key: 'news', label: '资讯管理', icon: '📰' },
  { key: 'smartsheet', label: '智能表格', icon: '🗄' },
];

export function AdminShell({ children }: { children: (activeTab: string) => ReactNode }) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div style={{ background: '#0f1421', color: '#e8edf7', minHeight: '100vh', fontFamily: '"Noto Sans SC", sans-serif' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px',
        background: '#161d2e', borderBottom: '1px solid #2c3654', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: 900 }}>
          管理后台 <small style={{ color: '#6b7896', fontWeight: 500, marginLeft: '8px', fontSize: '12px' }}>
            榴莲运输温度监控看板
          </small>
        </h1>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', color: '#9aa8c4' }}>
          👤 <b style={{ color: '#f5c451' }}>{user?.displayName || user?.username}</b>
        </span>
        <a href="/" style={{ color: '#f5c451', textDecoration: 'none', fontSize: '13px', padding: '6px 14px', border: '1px solid #f5c451', borderRadius: '6px' }}>
          看板
        </a>
        <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{
          color: '#f87171', textDecoration: 'none', fontSize: '13px', padding: '6px 14px',
          border: '1px solid rgba(248,113,113,.4)', borderRadius: '6px',
        }}>
          退出
        </a>
      </header>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 18px', border: '1px solid #2c3654', borderRadius: '8px 8px 0 0',
                cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: '.15s',
                background: activeTab === tab.key ? '#f5c451' : '#1b2236',
                color: activeTab === tab.key ? '#000' : '#9aa8c4',
                borderColor: activeTab === tab.key ? '#f5c451' : '#2c3654',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        {children(activeTab)}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 OrdersTab 组件**

`src/components/admin/OrdersTab.tsx` — 基于原 `admin.html` 订单管理逻辑重构。包含：表格展示、CRUD、拖拽排序、合计行、国家/品类/品牌筛选。

由于这个文件较大，先创建功能完整的初始版本（表格 + CRUD + 筛选），拖拽排序和合计行在后续迭代中完善。

```tsx
import { useState } from 'react';
import { useOrders, useCreateOrder, useUpdateOrder, useDeleteOrder } from '@/hooks/useOrders';

export function OrdersTab() {
  const { data: orders, isLoading } = useOrders();
  const createOrder = useCreateOrder();
  const updateOrder = useUpdateOrder();
  const deleteOrder = useDeleteOrder();

  const [filter, setFilter] = useState({ country: '', category: '', brand: '' });

  if (isLoading) return <div className="empty">加载订单数据...</div>;

  const filtered = (orders ?? []).filter((o: Record<string, unknown>) => {
    if (filter.country && o.country !== filter.country) return false;
    if (filter.category && o.category !== filter.category) return false;
    if (filter.brand && o.brand !== filter.brand) return false;
    return true;
  });

  return (
    <div className="panel active">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', marginRight: 'auto' }}>📦 订单管理</h2>
        <FilterSelect label="国家" value={filter.country} onChange={(v) => setFilter({ ...filter, country: v })}
          options={['', 'TH', 'VN']} labels={{ '': '全部', TH: '泰国', VN: '越南' }} />
        <FilterSelect label="品类" value={filter.category} onChange={(v) => setFilter({ ...filter, category: v })}
          options={['', 'FRESH', 'FROZEN']} labels={{ '': '全部', FRESH: '鲜果', FROZEN: '冻果' }} />
        <button className="btn primary" onClick={() => {
          const brand = prompt('品牌名称：');
          if (!brand) return;
          createOrder.mutate({ brand, country: 'TH', category: 'FRESH', boxes: 0, sort: (orders?.length ?? 0) + 1 });
        }} style={{ padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          + 新增订单
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['品牌', '国家', '品类', '箱量', '签收', '交付', '操作'].map((h) => (
              <th key={h} style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896', fontSize: '12px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((order: Record<string, unknown>) => (
            <tr key={order.id as string} style={{ borderBottom: '1px solid #2c3654' }}>
              <td style={{ padding: '9px 10px', color: '#f5c451', fontWeight: 700 }}>{order.brand as string}</td>
              <td style={{ padding: '9px 10px' }}>
                <span className={`pill ${order.country === 'TH' ? 'th' : 'vn'}`} style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                  background: order.country === 'TH' ? 'rgba(234,179,8,.18)' : 'rgba(239,68,68,.18)',
                  color: order.country === 'TH' ? '#fde68a' : '#fca5a5',
                }}>
                  {order.country === 'TH' ? '泰国' : '越南'}
                </span>
              </td>
              <td style={{ padding: '9px 10px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                  background: order.category === 'FRESH' ? 'rgba(239,68,68,.18)' : 'rgba(56,189,248,.18)',
                  color: order.category === 'FRESH' ? '#fca5a5' : '#7dd3fc',
                }}>
                  {order.category === 'FRESH' ? '鲜果' : '冻果'}
                </span>
              </td>
              <td style={{ padding: '9px 10px' }}>{order.boxes as number}</td>
              <td style={{ padding: '9px 10px' }}>{order.signed as number ?? 0}</td>
              <td style={{ padding: '9px 10px' }}>{order.delivered as number ?? 0}</td>
              <td style={{ padding: '9px 10px' }}>
                <button className="btn danger sm" onClick={() => {
                  if (confirm(`确定删除「${order.brand}」？`)) deleteOrder.mutate(order.id as string);
                }} style={{
                  padding: '4px 10px', fontSize: '12px', background: 'transparent', color: '#f87171',
                  border: '1px solid rgba(248,113,113,.4)', borderRadius: '6px', cursor: 'pointer',
                }}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>暂无订单数据</div>}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options, labels }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#9aa8c4' }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
        padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
      }}>
        {options.map((opt) => (
          <option key={opt} value={opt}>{labels[opt]}</option>
        ))}
      </select>
    </div>
  );
}
```

- [ ] **Step 3: 创建 LogisticsTab 和 NewsTab 占位组件**

`src/components/admin/LogisticsTab.tsx`:
```tsx
export function LogisticsTab() {
  return (
    <div className="panel active">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px' }}>🚢 物流监控</h2>
      </div>
      <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>
        物流管理功能 — 从 admin.html 迁移中...
      </div>
    </div>
  );
}
```

`src/components/admin/NewsTab.tsx`:
```tsx
export function NewsTab() {
  return (
    <div className="panel active">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px' }}>📰 资讯管理</h2>
      </div>
      <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>
        资讯管理功能 — 从 admin.html 迁移中...
      </div>
    </div>
  );
}
```

- [ ] **Step 4: 创建 SmartSheetTab 组件（初始版本）**

`src/components/admin/SmartSheetTab.tsx`:
```tsx
import { useSheets } from '@/hooks/useSmartsheet';

export function SmartSheetTab() {
  const { data, isLoading, isError } = useSheets();

  return (
    <div className="panel active">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px' }}>🗄 智能表格管理</h2>
      </div>

      {isLoading && <div className="empty">加载表格信息...</div>}
      {isError && <div className="empty" style={{ color: '#f87171' }}>连接失败，请检查企业微信配置</div>}
      {data && (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div className="summary-item" style={{ background: '#232c44', padding: '12px 18px', borderRadius: '8px', border: '1px solid #2c3654' }}>
            <div className="v" style={{ fontSize: '22px', color: '#f5c451' }}>
              {((data as { data?: { sheets?: unknown[] } }).data?.sheets ?? []).length}
            </div>
            <div className="l" style={{ fontSize: '12px', color: '#6b7896', marginTop: '2px' }}>子表数</div>
          </div>
        </div>
      )}
      <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>
        智能表格详细管理功能 — 从 admin-smartsheet.js 迁移中...
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 创建 AdminPage**

`src/pages/AdminPage.tsx`:
```tsx
import { AdminShell } from '@/components/layout/AdminShell';
import { OrdersTab } from '@/components/admin/OrdersTab';
import { LogisticsTab } from '@/components/admin/LogisticsTab';
import { NewsTab } from '@/components/admin/NewsTab';
import { SmartSheetTab } from '@/components/admin/SmartSheetTab';

export default function AdminPage() {
  return (
    <AdminShell>
      {(activeTab) => {
        switch (activeTab) {
          case 'orders': return <OrdersTab />;
          case 'logistics': return <LogisticsTab />;
          case 'news': return <NewsTab />;
          case 'smartsheet': return <SmartSheetTab />;
          default: return <OrdersTab />;
        }
      }}
    </AdminShell>
  );
}
```

- [ ] **Step 6: 更新 App.tsx 注册管理后台路由**

```tsx
<Route element={<AdminRoute />}>
  <Route path="/admin" element={<AdminPage />} />
  <Route path="/admin-sentry" element={<AdminPage />} />  {/* TODO: 后续替换 */}
</Route>
```

- [ ] **Step 7: 验证管理后台**

```bash
npm run dev
# 打开 http://localhost:5173/admin
# 应看到：4 个 tab（订单管理/物流监控/资讯管理/智能表格）
# 订单 tab 应有数据表格 + 筛选 + CRUD 按钮
```

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "feat: AdminPage with 4-tab layout, OrdersTab CRUD, SmartSheetTab status"
```

---

### Task 10: 剩余页面迁移 + 生产部署适配

**Files:**
- Create: `src/pages/FlowPage.tsx` (占位)
- Create: `src/pages/OverviewPage.tsx` (占位)
- Create: `src/pages/ThailandPage.tsx` (占位)
- Modify: `src/App.tsx` (register all remaining routes)
- Modify: `server.js` (static hosting of dist/ + SPA fallback)

**Interfaces:**
- Produces: 全部 9 个路由可用，生产 `npm run build` + `npm start` 可部署

- [ ] **Step 1: 创建剩余页面占位组件**

`src/pages/FlowPage.tsx`:
```tsx
import { DashboardShell } from '@/components/layout/DashboardShell';

export default function FlowPage() {
  return (
    <DashboardShell title="流程看板" subtitle="FLOW DASHBOARD">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: 'var(--txt2)', fontSize: '2vh',
      }}>
        🚧 流程看板 — 迁移中...
      </div>
    </DashboardShell>
  );
}
```

`src/pages/OverviewPage.tsx` 和 `src/pages/ThailandPage.tsx` 类似结构（占位）。

- [ ] **Step 2: 更新 App.tsx 注册所有路由**

`src/App.tsx` 完整路由配置:
```tsx
<Routes>
  <Route path="/login" element={<LoginPage />} />
  <Route element={<ProtectedRoute />}>
    <Route index element={<DashboardPage />} />
    <Route path="/sentry" element={<DashboardSentryPage />} />
    <Route path="/tv" element={<DashboardTvPage />} />
    <Route path="/flow" element={<FlowPage />} />
    <Route path="/overview" element={<OverviewPage />} />
    <Route path="/thailand" element={<ThailandPage />} />
    <Route element={<AdminRoute />}>
      <Route path="/admin" element={<AdminPage />} />
      <Route path="/admin-sentry" element={<AdminPage />} />
    </Route>
  </Route>
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
```

- [ ] **Step 3: 适配 server.js — 生产静态托管 + SPA fallback**

在 `server.js` 的静态文件服务部分（约在 `app.use(express.static('public'))` 附近），修改为：

```js
// 生产环境：托管 Vite 构建产物
const distPath = path.join(__dirname, 'dist');
const fs = require('fs');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  // SPA fallback: 非 /api 且非静态文件 → index.html
  app.get(/^\/(?!api\/|callback|login|admin).*/, (req, res) => {
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

// 开发环境兼容：仍然托管 public/ 目录
app.use(express.static(path.join(__dirname, 'public')));
```

- [ ] **Step 4: 老 URL 301 redirect**

在 SPA fallback 之前添加：
```js
// Redirect old .html URLs to new SPA routes
const LEGACY_REDIRECTS = {
  '/index.html': '/',
  '/index-sentry.html': '/sentry',
  '/index-tv.html': '/tv',
  '/index-flow.html': '/flow',
  '/app-overview.html': '/overview',
  '/app-thailand.html': '/thailand',
  '/admin-sentry.html': '/admin-sentry',
};

app.use((req, res, next) => {
  const target = LEGACY_REDIRECTS[req.path];
  if (target) {
    return res.redirect(301, target);
  }
  next();
});
```

- [ ] **Step 5: 验证构建 + 生产部署**

```bash
npm run build           # TypeScript check + Vite build → dist/
npm start               # Express 在 :3000 托管 API + dist/
# 打开 http://localhost:3000  → 应看到 DashboardPage
# 打开 http://localhost:3000/login → LoginPage
# 打开 http://localhost:3000/admin → AdminPage
# 老 URL http://localhost:3000/index.html → 301 → /
```

- [ ] **Step 6: 更新 CLAUDE.md 中的相关说明**

更新开发命令、架构说明、文件结构等章节。在 `CLAUDE.md` 的项目结构部分追加 React 前端目录说明。

- [ ] **Step 7: Commit + Push**

```bash
git add -A
git commit -m "feat: all routes, production SPA fallback, legacy URL redirects"
git push
```

---

### Task 11: 智能表格管理页完整迁移

**Files:**
- Modify: `src/components/admin/SmartSheetTab.tsx` (拆分为完整功能)
- Create: `src/components/admin/SheetList.tsx`
- Create: `src/components/admin/FieldManager.tsx`
- Create: `src/components/admin/RecordTable.tsx`
- Create: `src/components/admin/SmartSheetApi.ts` (admin-smartsheet.js 的 API 逻辑)
- Create: `src/hooks/useSmartSheetAdmin.ts` (完整的 smart sheet 管理 mutations)

**Interfaces:**
- Consumes: 企业微信 API via `/api/smartsheet/*`, `/api/setup`, `/api/schema/refresh`, `/api/doc/*`
- Produces: 管理后台「智能表格」tab 完全可用，功能与原 admin-smartsheet.js 对等

由于 admin-smartsheet.js 有 61KB / 1562 行，这个 task 是最大的单件。核心策略：按功能域拆成小组件，一个文件一个职责。

- [ ] **Step 1: 创建完整 Smartsheet mutations**

`src/hooks/useSmartSheetAdmin.ts` — 补充 Task 5 的 useSmartsheet.ts，添加剩余的 mutations（views, groups, doc rename/delete, setup, schema refresh, fields CRUD）：

```ts
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAddView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; viewTitle: string; viewType: string }) =>
      api('/api/smartsheet/views/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; viewId: string }) =>
      api('/api/smartsheet/views/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useAddGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fieldId: string }) =>
      api('/api/smartsheet/groups/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; groupId: string }) =>
      api('/api/smartsheet/groups/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useDeleteField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fieldIds: string[] }) =>
      api('/api/smartsheet/fields/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useUpdateField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fieldId: string; fieldTitle: string; fieldType: string }) =>
      api('/api/smartsheet/fields/update', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useSetupDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api<{ success: boolean; data: { docid: string } }>('/api/setup', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useRefreshSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api('/api/schema/refresh', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useRenameDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api('/api/doc/rename', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}
```

- [ ] **Step 2: 创建 SheetList 组件**

`src/components/admin/SheetList.tsx` — 显示所有子表，支持选择、新增、删除：

```tsx
import { useSheets, useAddSheet, useDeleteSheet } from '@/hooks/useSmartsheet';

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function SheetList({ selectedId, onSelect }: Props) {
  const { data, isLoading } = useSheets();
  const addSheet = useAddSheet();
  const deleteSheet = useDeleteSheet();

  const sheets = (data as { data?: { sheets?: Array<{ sheet_id: string; title: string }> } })?.data?.sheets ?? [];

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4' }}>子表列表</h3>
        <button
          onClick={() => {
            const title = prompt('子表名称：');
            if (title) addSheet.mutate({ title });
          }}
          style={{
            padding: '4px 10px', fontSize: '12px', background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
          }}
        >
          + 新增
        </button>
      </div>

      {isLoading && <span style={{ color: '#6b7896', fontSize: '12px' }}>加载中...</span>}

      <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
        {sheets.map((sheet) => (
          <button
            key={sheet.sheet_id}
            onClick={() => onSelect(sheet.sheet_id)}
            style={{
              padding: '6px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
              background: selectedId === sheet.sheet_id ? '#f5c451' : '#232c44',
              color: selectedId === sheet.sheet_id ? '#000' : '#e8edf7',
              border: `1px solid ${selectedId === sheet.sheet_id ? '#f5c451' : '#2c3654'}`,
              display: 'flex', alignItems: 'center', gap: '6px',
            }}
          >
            {sheet.title}
            <span
              onClick={(e) => {
                e.stopPropagation();
                if (confirm(`确定删除子表「${sheet.title}」？`)) {
                  deleteSheet.mutate({ sheetId: sheet.sheet_id });
                }
              }}
              style={{ color: '#f87171', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
            >
              ×
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 创建 FieldManager 组件**

`src/components/admin/FieldManager.tsx` — 显示选中子表的字段列表，支持新增字段。从 `admin-smartsheet.js` 的 `renderFields()` 逻辑迁移：

```tsx
import { useState } from 'react';
import { useSheets, useAddField, useDeleteField } from '@/hooks/useSmartsheet';

interface Props {
  sheetId: string;
}

const TYPE_LABELS: Record<string, string> = {
  FIELD_TYPE_TEXT: '文本', NUMBER: '数字', DATE_TIME: '日期时间',
  SINGLE_SELECT: '单选', CHECKBOX: '勾选', REFERENCE: '关联',
};

interface SheetField {
  field_id: string;
  field_title: string;
  field_type: string;
}

export function FieldManager({ sheetId }: Props) {
  const { data } = useSheets();
  const addField = useAddField();
  const deleteField = useDeleteField();
  const [adding, setAdding] = useState(false);

  const sheets = (data as { data?: { sheets?: Array<{ sheet_id: string; fields?: SheetField[] }> } })?.data?.sheets ?? [];
  const sheet = sheets.find((s) => s.sheet_id === sheetId);
  const fields = sheet?.fields ?? [];

  return (
    <div style={{ marginBottom: '16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4' }}>
          字段列表 <span style={{ color: '#6b7896' }}>({fields.length})</span>
        </h3>
        <button
          onClick={() => setAdding(true)}
          style={{
            padding: '4px 10px', fontSize: '12px', background: '#3b82f6', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer',
          }}
        >
          + 新增字段
        </button>
      </div>

      {adding && (
        <AddFieldForm
          onSubmit={(title, type) => {
            const fieldDef: Record<string, unknown> = {
              field_title: title,
              field_type: type,
            };
            if (type === 'FIELD_TYPE_NUMBER') fieldDef.property_number = { decimal_places: 1 };
            if (type === 'FIELD_TYPE_SINGLE_SELECT') {
              fieldDef.property_single_select = { is_multiple: false, is_quick_add: true, options: [] };
            }
            addField.mutate({ sheetId, fields: [fieldDef] });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
        <thead>
          <tr>
            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
              字段标题
            </th>
            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
              类型
            </th>
            <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
              操作
            </th>
          </tr>
        </thead>
        <tbody>
          {fields.map((f) => (
            <tr key={f.field_id} style={{ borderBottom: '1px solid #2c3654' }}>
              <td style={{ padding: '6px 10px', color: '#e8edf7' }}>{f.field_title}</td>
              <td style={{ padding: '6px 10px', color: '#9aa8c4' }}>
                {/* 企微 API 返回的上层类型格式与 admin-smartsheet.js 中使用的不同 */}
                {TYPE_LABELS[f.field_type] || f.field_type.replace('FIELD_TYPE_', '')}
              </td>
              <td style={{ padding: '6px 10px' }}>
                <button
                  onClick={() => {
                    if (confirm(`确定删除字段「${f.field_title}」？`)) {
                      deleteField.mutate({ sheetId, fieldIds: [f.field_id] });
                    }
                  }}
                  style={{
                    padding: '3px 8px', fontSize: '11px', background: 'transparent', color: '#f87171',
                    border: '1px solid rgba(248,113,113,.4)', borderRadius: '4px', cursor: 'pointer',
                  }}
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AddFieldForm({ onSubmit, onCancel }: { onSubmit: (title: string, type: string) => void; onCancel: () => void }) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('FIELD_TYPE_TEXT');

  return (
    <div style={{
      marginBottom: '12px', padding: '12px', background: '#1b2236',
      borderRadius: '8px', border: '1px solid #2c3654', display: 'flex', gap: '10px', alignItems: 'flex-end', flexWrap: 'wrap',
    }}>
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: '#6b7896', marginBottom: '4px' }}>字段名称</label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
            padding: '6px 10px', borderRadius: '6px', fontSize: '13px', width: '160px',
          }}
          placeholder="例如：柜号"
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: '#6b7896', marginBottom: '4px' }}>字段类型</label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{
            background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
            padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
          }}
        >
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => { if (title.trim()) onSubmit(title.trim(), type); }}
        style={{
          padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none',
          borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
        }}
      >
        确认
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '6px 14px', background: 'transparent', color: '#9aa8c4',
          border: '1px solid #2c3654', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
        }}
      >
        取消
      </button>
    </div>
  );
}
```

- [ ] **Step 4: 创建 RecordTable 组件**

`src/components/admin/RecordTable.tsx` — 显示选中子表的记录，支持查看、删除。字段值渲染逻辑复用原 `admin-smartsheet.js` 的 `renderCell` 函数：

```tsx
import { useRecords, useDeleteRecord } from '@/hooks/useSmartsheet';
import { useSheets } from '@/hooks/useSmartsheet';

interface Props {
  sheetId: string;
}

interface FieldInfo {
  field_id: string;
  field_title: string;
  field_type: string;
}

interface RecordItem {
  record_id: string;
  values: Record<string, unknown>;
}

export function RecordTable({ sheetId }: Props) {
  const { data: recordsData, isLoading } = useRecords(sheetId);
  const { data: sheetsData } = useSheets();
  const deleteRecord = useDeleteRecord();

  const sheets = (sheetsData as { data?: { sheets?: Array<{ sheet_id: string; fields?: FieldInfo[] }> } })?.data?.sheets ?? [];
  const sheet = sheets.find((s) => s.sheet_id === sheetId);
  const fields = sheet?.fields ?? [];

  const records = (recordsData as { data?: RecordItem[] })?.data ?? [];

  if (isLoading) return <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px' }}>加载记录...</div>;

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4' }}>
          记录列表 <span style={{ color: '#6b7896' }}>({records.length})</span>
        </h3>
      </div>

      {records.length === 0 ? (
        <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px', textAlign: 'center' }}>暂无记录</div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                {fields.slice(0, 8).map((f) => (
                  <th key={f.field_id} style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896', whiteSpace: 'nowrap' }}>
                    {f.field_title}
                  </th>
                ))}
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>操作</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.record_id} style={{ borderBottom: '1px solid #2c3654' }}>
                  {fields.slice(0, 8).map((f) => (
                    <td key={f.field_id} style={{ padding: '6px 10px', color: '#e8edf7', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {renderCellValue(record.values[f.field_id])}
                    </td>
                  ))}
                  <td style={{ padding: '6px 10px' }}>
                    <button
                      onClick={() => {
                        if (confirm('确定删除这条记录？')) {
                          deleteRecord.mutate({ sheetId, recordIds: [record.record_id] });
                        }
                      }}
                      style={{
                        padding: '3px 8px', fontSize: '11px', background: 'transparent', color: '#f87171',
                        border: '1px solid rgba(248,113,113,.4)', borderRadius: '4px', cursor: 'pointer',
                      }}
                    >
                      删除
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function renderCellValue(v: unknown): string {
  if (v === null || v === undefined || v === '') return '-';
  if (Array.isArray(v)) return v.map((item) => {
    if (typeof item === 'object' && item !== null) {
      return (item as Record<string, string>).text || (item as Record<string, string>).record_id || JSON.stringify(item);
    }
    return String(item);
  }).join('、');
  if (typeof v === 'object') return JSON.stringify(v);
  const s = String(v);
  // 尝试解析毫秒时间戳
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s.length === 10 ? s + '000' : s);
    if (Number.isFinite(n) && n > 946684800000 && n < 4102444800000) {
      return new Date(n).toLocaleString('zh-CN');
    }
  }
  return s;
}
```

- [ ] **Step 5: 整合 SmartSheetTab**

更新 `src/components/admin/SmartSheetTab.tsx`，整合 SheetList、FieldManager、RecordTable：

```tsx
import { useState } from 'react';
import { SheetList } from './SheetList';
import { FieldManager } from './FieldManager';
import { RecordTable } from './RecordTable';
import { useSetupDoc, useRefreshSchema, useSheets } from '@/hooks/useSmartsheet';

export function SmartSheetTab() {
  const [selectedSheetId, setSelectedSheetId] = useState('');
  const { data } = useSheets();
  const setupDoc = useSetupDoc();
  const refreshSchema = useRefreshSchema();

  const sheets = (data as { data?: { sheets?: Array<{ sheet_id: string }> } })?.data?.sheets ?? [];
  const hasDoc = sheets.length > 0;

  return (
    <div className="panel active">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
        <h2 style={{ fontSize: '16px', marginRight: 'auto' }}>🗄 智能表格管理</h2>

        {!hasDoc && (
          <button
            onClick={() => { if (confirm('将创建新的智能表格文档，包含温度记录子表')) setupDoc.mutate(); }}
            style={{
              padding: '7px 14px', fontSize: '13px', background: '#f5c451', color: '#000',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            🏗 初始化文档
          </button>
        )}

        <button
          onClick={() => refreshSchema.mutate()}
          style={{
            padding: '7px 14px', fontSize: '13px', background: '#232c44', color: '#9aa8c4',
            border: '1px solid #2c3654', borderRadius: '6px', cursor: 'pointer',
          }}
        >
          🔄 刷新缓存
        </button>
      </div>

      <SheetList selectedId={selectedSheetId} onSelect={setSelectedSheetId} />

      {selectedSheetId && (
        <>
          <FieldManager sheetId={selectedSheetId} />
          <RecordTable sheetId={selectedSheetId} />
        </>
      )}
    </div>
  );
}
```

- [ ] **Step 6: 验证智能表格管理功能**

```bash
npm run dev
# 打开 http://localhost:5173/admin → 切到「智能表格」tab
# 验证：子表列表、字段列表、记录列表、初始化文档按钮
```

- [ ] **Step 7: Commit**

```bash
git add -A && git commit -m "feat: SmartSheetTab with SheetList, FieldManager, RecordTable"
```

---

### Task 12: 服务器部署验证

**Files:**
- Modify: `package.json` (确认 scripts)
- (无代码变更，纯验证步骤)

**Interfaces:**
- Produces: 生产环境可部署

- [ ] **Step 1: 本地生产构建**

```bash
npm run build
# 确认 dist/ 目录生成，包含 index.html + assets/
ls dist/
```

- [ ] **Step 2: 本地启动生产模式测试**

```bash
npm start
# 打开 http://localhost:3000 → DashboardPage
# 打开 http://localhost:3000/login → LoginPage
# 打开 http://localhost:3000/admin → AdminPage（需先登录）
# 老 URL: http://localhost:3000/index.html → 301 → /
```

- [ ] **Step 3: 验证所有 API 端点仍正常**

```bash
curl -s http://localhost:3000/api/auth/me
# → 401（未登录，符合预期）

curl -s http://localhost:3000/api/config/info
# → 401
```

- [ ] **Step 4: 推送到 GitHub**

```bash
git push
```

- [ ] **Step 5: 提供服务器端部署指令给用户**

```
# 用户需要在服务器上执行：
cd /home/ubuntu/温度看板
git pull
npm install              # 安装新增的 React/Vite 依赖
npm run build            # 构建前端
pm2 restart durian-dashboard
```

- [ ] **Step 6: Commit final state**

```bash
git add -A && git commit -m "chore: production build verification, deploy instructions"
git push
```

---

## 迁移后收尾

- [ ] 确认服务器部署成功后，标记迁移完成
- [ ] `public/` 目录中的旧 HTML 文件保留作为参考（不再被 Express 优先加载）
- [ ] 后续功能迭代：FlowPage、OverviewPage、ThailandPage 从占位逐步充实
- [ ] 后续功能迭代：OrdersTab 拖拽排序 + 合计行、LogisticsTab、NewsTab 完整 CRUD
