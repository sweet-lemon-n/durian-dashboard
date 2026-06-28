# Overview Topic Dashboards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add six deep topic dashboards inside `public/app-overview.html`, entered from the executive overview blocks.

**Architecture:** The existing overview page reads a `board` URL parameter and switches between overview-grid mode and topic-dashboard mode. It continues to use `/api/auth/me`, `/api/overview-executive`, current filters, existing drilldown modal, and current motion utilities.

**Tech Stack:** Node.js static tests, vanilla HTML/CSS/JavaScript, existing Express static page serving.

## Global Constraints

- Keep the first version on `public/app-overview.html`; do not add backend routes.
- Do not add remote dependencies or frontend build tooling.
- Topic dashboards must provide multiple analysis surfaces, not just enlarged overview cards.
- Preserve existing overview behavior when `board` is absent.
- Preserve `country`, `factory`, and `container` filters when switching topic dashboards.

---

### Task 1: Topic Dashboard Static Contract

**Files:**
- Create: `scripts/test-overview-topic-dashboards.js`
- Modify: `public/app-overview.html`

**Interfaces:**
- Consumes: `public/app-overview.html` as text.
- Produces: Static regression coverage for topic board keys, links, render functions, and topic mode structure.

- [ ] **Step 1: Write the failing test**

Create `scripts/test-overview-topic-dashboards.js` with assertions for:

```js
const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');

[
  "key:'fulfillment'",
  "key:'logistics'",
  "key:'temperature'",
  "key:'orders'",
  "key:'risks'",
  "key:'news'",
].forEach(marker => {
  assert.ok(html.includes(marker), `topic dashboard config must include ${marker}`);
});

[
  'function currentBoardKey',
  'function buildBoardUrl',
  'function renderTopicShell',
  'function renderTopicDashboard',
  'function renderFulfillmentDashboard',
  'function renderLogisticsDashboard',
  'function renderTemperatureDashboard',
  'function renderOrdersDashboard',
  'function renderRisksDashboard',
  'function renderNewsDashboard',
].forEach(marker => {
  assert.ok(html.includes(marker), `overview topic dashboards must contain ${marker}`);
});

[
  'class="topic-shell"',
  'class="topic-nav"',
  '返回总览',
  '进入看板',
  'data-board-link="fulfillment"',
  'data-board-link="logistics"',
  'data-board-link="temperature"',
  'data-board-link="orders"',
  'data-board-link="risks"',
  'data-board-link="news"',
].forEach(marker => {
  assert.ok(html.includes(marker), `topic dashboard UI must contain ${marker}`);
});

assert.ok(
  /new URLSearchParams\(location\.search\)/.test(html),
  'topic dashboard mode must be driven by URL search parameters'
);

console.log('overview topic dashboard checks passed');
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node scripts/test-overview-topic-dashboards.js`

Expected: FAIL with a missing `key:'fulfillment'` or `function currentBoardKey` assertion.

- [ ] **Step 3: Implement topic mode**

Modify `public/app-overview.html` to add:

- `BOARD_CONFIGS`
- `currentBoardKey()`
- `buildBoardUrl(boardKey)`
- `renderTopicShell(model, config, bodyHtml)`
- `renderTopicDashboard(model)`
- six topic render functions
- overview panel "进入看板" links
- CSS for `.topic-shell`, `.topic-nav`, `.topic-grid`, `.topic-card`, `.topic-kpi-grid`, `.topic-table`, and topic-specific accents

- [ ] **Step 4: Run test to verify it passes**

Run: `node scripts/test-overview-topic-dashboards.js`

Expected: PASS with `overview topic dashboard checks passed`.

### Task 2: Regression Verification

**Files:**
- Modify: `TASKS.md`

**Interfaces:**
- Consumes: Existing tests and changed page.
- Produces: Verified topic dashboard page and task record.

- [ ] **Step 1: Run page and overview checks**

Run:

```bash
node scripts/test-overview-topic-dashboards.js
node scripts/test-modular-regressions.js
node scripts/test-overview-layout.js
node scripts/test-overview-motion.js
node scripts/test-page-syntax.js public/app-overview.html
git diff --check
```

Expected: all commands exit `0`.

- [ ] **Step 2: Update task log**

Add a completed entry to `TASKS.md`:

```md
- [x] `P2` 将老板经营驾驶舱的 6 个核心板块升级为可进入的专题分析看板。
```

- [ ] **Step 3: Run final checks**

Run:

```bash
node scripts/test-overview-topic-dashboards.js
node scripts/test-page-syntax.js public/app-overview.html
git diff --check
```

Expected: all commands exit `0`.
