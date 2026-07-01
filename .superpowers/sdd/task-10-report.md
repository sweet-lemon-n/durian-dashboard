# Task 10 Report: 剩余页面迁移 + 生产部署适配

## Summary

Implemented placeholder pages for Flow/Overview/Thailand, updated App.tsx with all 9 routes, adapted server.js for production SPA hosting with legacy URL redirects, and updated CLAUDE.md.

### Changes Made

**Created files:**
- `src/pages/FlowPage.tsx` — Placeholder page for /flow route
- `src/pages/OverviewPage.tsx` — Placeholder page for /overview route
- `src/pages/ThailandPage.tsx` — Placeholder page for /thailand route

**Modified files:**
- `src/App.tsx` — Added imports and routes for FlowPage, OverviewPage, ThailandPage (all 9 routes now registered: `/`, `/sentry`, `/tv`, `/flow`, `/overview`, `/thailand`, `/admin`, `/admin-sentry`, `/login`)
- `server.js` — Major production hosting changes:
  1. Added `fs` import at top level
  2. Moved legacy 301 redirects to execute BEFORE static file serving (prevents `dist/` copies of old HTML from short-circuiting redirects)
  3. Added production static hosting for `dist/` (if exists)
  4. Added SPA fallback: regex-match non-/api /callback /login /admin routes → `dist/index.html`
  5. Updated regex to exclude only exact `/login` and `/admin` (not `/admin-sentry` or similar)
- `CLAUDE.md` — Updated architecture diagram, middleware order, project structure, commands, and frontend descriptions to reflect React SPA production hosting

### Verification Results

| Test | Result |
|------|--------|
| `npx tsc -b` | Pass (no errors) |
| `npm run build` | Pass (121 modules, 666ms) |
| Server startup | Starts without errors |
| `GET /` | 200 → serves SPA index.html |
| `GET /index.html` | 301 → `/` |
| `GET /admin-sentry.html` | 301 → `/admin-sentry` |
| `GET /flow` | 200 → SPA fallback (dist/index.html) |
| `GET /api/dashboard` | 401 → JSON error (auth guard works) |
| `GET /gantt.js` | 200 → static file from public/ |
| `GET /nonexistent` | 200 → SPA fallback (React Router catch-all redirects to /) |

### Deployment Note

After pushing, the server needs:
```bash
git pull && npm install && npm run build && pm2 restart durian-dashboard
```
