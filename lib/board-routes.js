// 看板内容 API：/api/aggregate（聚合，登录可读）+ orders/logistics/news CRUD（写操作需模块权限）
// 数据来自 lib/content-store.js 的占位 JSON；企微真实温度数据另走 /api/dashboard。
// 数据源切换：DATA_SOURCE_FILE 持久化当前选择（manual|wecom），可在后台切换。
// 注意：本路由挂在 server.js 的 `app.use('/api', guard)` 之后，故 GET 默认已要求登录。
//       响应体保持原始 object/array（不包 {success,data}），以匹配移植自模板的前端 JS。
const express = require('express');
const fs = require('fs');
const path = require('path');
const { read, writeSync, genId } = require('./content-store');
const { requireRole, requirePermission } = require('./auth');
const { aggregateFromWecom } = require('./wecom-aggregate');
const { normalizeDashboardPermissions } = require('./db');
const { getAutoNews, getLastFetchedTime, getNewsSourceSummary, refreshNow } = require('./news-fetcher');

const router = express.Router();
const adminOnly = requireRole('admin');
const canManageOrders = requirePermission('orders');
const canManageLogistics = requirePermission('logistics');
const canManageNews = requirePermission('news');


function dashboardVisibility(user) {
  const allowed = new Set(normalizeDashboardPermissions(user && user.dashboardPermissions));
  return {
    summary: allowed.has('summary'),
    th: allowed.has('th'),
    vn: allowed.has('vn'),
    logistics: allowed.has('logistics'),
    news: allowed.has('news'),
    gantt: allowed.has('gantt'),
  };
}

function applyDashboardVisibility(out, user) {
  const visibility = dashboardVisibility(user);
  return {
    ...out,
    visibility,
    global: visibility.summary ? out.global : null,
    th: visibility.th ? out.th : null,
    vn: visibility.vn ? out.vn : null,
    logistics: visibility.logistics ? out.logistics : null,
    news: visibility.news ? out.news : null,
  };
}

// ---------- 数据源开关 ----------
const DATA_SOURCE_FILE = path.join(__dirname, '..', 'data', 'data-source.json');
const VALID_SOURCES = ['manual', 'wecom'];
function readSource() {
  try {
    const raw = JSON.parse(fs.readFileSync(DATA_SOURCE_FILE, 'utf-8'));
    return VALID_SOURCES.includes(raw.source) ? raw.source : 'manual';
  } catch (_) { return 'manual'; }
}
function writeSource(source) {
  if (!VALID_SOURCES.includes(source)) throw new Error('非法数据源：' + source);
  const tmp = DATA_SOURCE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ source }, null, 2), 'utf-8');
  fs.renameSync(tmp, DATA_SOURCE_FILE);
}
let currentSource = readSource();
console.log('[board-routes] 当前数据源：' + currentSource);


// ---------- 聚合计算（看板用）----------
function aggregate(db) {
  const sortedOrders = sortOrders(db.orders);
  const byCountry = (c) => {
    const rows = sortedOrders.filter(o => o.country === c);
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const boxes = sum('boxes');
    const done = sum('delivered');
    return {
      orders: sum('orders'),
      boxes,
      delivered: sum('delivered'),
      signed: sum('signed'),
      transit: sum('transit'),
      port: sum('port'),
      pending: sum('pending'),
      rate: boxes ? +(done / boxes * 100).toFixed(1) : 0,
      rows,
    };
  };
  const th = byCountry('TH');
  const vn = byCountry('VN');

  const totalOrders  = th.orders + vn.orders;
  const totalBoxes   = th.boxes + vn.boxes;
  const totalDone    = th.delivered + vn.delivered;
  const totalMoving  = th.transit + vn.transit;
  const totalPending = th.pending + vn.pending;

  return {
    meta: db.meta,
    global: { totalOrders, totalBoxes, totalDone, totalMoving, totalPending },
    th, vn,
    logistics: db.logistics,
    news: { th: [], vn: [], auto: getAutoNews(), fetchedAt: getLastFetchedTime() },
    generatedAt: new Date().toISOString(),
  };
}

// ====== GET /api/aggregate ======
// 按 currentSource 分流；wecom 失败自动 fallback 到 manual 并在响应里说明
router.get('/aggregate', async (req, res) => {
  res.set('Cache-Control', 'no-store');
  if (currentSource === 'wecom') {
    try {
      let out = applyDashboardVisibility(await aggregateFromWecom(process.env.DOCID), req.user);
      if (out.news) {
        out.news.th = [];
        out.news.vn = [];
        out.news.auto = getAutoNews();
        out.news.fetchedAt = getLastFetchedTime();
      }
      return res.json(out);
    } catch (e) {
      console.warn('[aggregate] wecom 数据源失败，fallback 到 manual:', e.message);
      const out = applyDashboardVisibility(aggregate(read()), req.user);
      out._source = 'manual';
      out._warning = 'wecom 数据源调用失败：' + e.message;
      return res.json(out);
    }
  }
  const out = applyDashboardVisibility(aggregate(read()), req.user);
  out._source = 'manual';
  res.json(out);
});

// ====== 数据源切换 ======
router.get('/data-source', (req, res) => {
  res.json({ current: currentSource, available: VALID_SOURCES });
});
router.put('/data-source', adminOnly, (req, res) => {
  const next = req.body && req.body.source;
  if (!VALID_SOURCES.includes(next)) {
    return res.status(400).json({ error: '非法数据源，必须是 ' + VALID_SOURCES.join('/') });
  }
  try {
    writeSource(next);
    currentSource = next;
    console.log('[board-routes] 数据源切换为：' + next);
    res.json({ current: currentSource });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ====== 订单 CRUD ======
// 内部工具：按 sort 升序、缺省 sort 视为 Infinity（排到最后），保证旧数据不报错
function sortOrders(arr) {
  return arr.slice().sort((a, b) => {
    const sa = (a.sort == null) ? Number.MAX_SAFE_INTEGER : Number(a.sort);
    const sb = (b.sort == null) ? Number.MAX_SAFE_INTEGER : Number(b.sort);
    return sa - sb;
  });
}
function nextSort(arr) {
  let max = -1;
  arr.forEach(o => { const s = Number(o.sort); if (Number.isFinite(s) && s > max) max = s; });
  return max + 1;
}

router.get('/orders', canManageOrders, (req, res) => {
  res.json(sortOrders(read().orders));
});
router.post('/orders', canManageOrders, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('ord') };
  if (body.sort == null) body.sort = nextSort(db.orders);
  db.orders.push(body);
  writeSync(db);
  res.status(201).json(body);
});
// 重排：body { ids: [...] }，按数组顺序写入 sort 0..N-1
router.put('/orders/reorder', canManageOrders, (req, res) => {
  const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : null;
  if (!ids) return res.status(400).json({ error: '缺少 ids 数组' });
  const db = read();
  const known = new Map(db.orders.map(o => [o.id, o]));
  ids.forEach((id, i) => { if (known.has(id)) known.get(id).sort = i; });
  // 未在 ids 中出现的订单（理论不该有）继续排到末尾
  let tail = ids.length;
  db.orders.forEach(o => { if (!ids.includes(o.id)) o.sort = tail++; });
  writeSync(db);
  res.json(sortOrders(db.orders));
});
router.put('/orders/:id', canManageOrders, (req, res) => {
  const db = read();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders[idx] = { ...db.orders[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(db.orders[idx]);
});
router.delete('/orders/:id', canManageOrders, (req, res) => {
  const db = read();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ====== 物流整体 ======
router.get('/logistics', canManageLogistics, (req, res) => {
  res.json(read().logistics);
});
router.put('/logistics', canManageLogistics, (req, res) => {
  const db = read();
  db.logistics = { ...db.logistics, ...req.body };
  writeSync(db);
  res.json(db.logistics);
});

// ---- 物流 KPI 单独更新 ----
router.put('/logistics/kpis', canManageLogistics, (req, res) => {
  const db = read();
  db.logistics.kpis = { ...db.logistics.kpis, ...req.body };
  writeSync(db);
  res.json(db.logistics.kpis);
});

// ---- 物流-滞留预警 CRUD ----
router.post('/logistics/portDelays', canManageLogistics, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('pd') };
  db.logistics.portDelays.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/logistics/portDelays/:id', canManageLogistics, (req, res) => {
  const db = read();
  const arr = db.logistics.portDelays;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '滞留记录不存在' });
  arr[idx] = { ...arr[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(arr[idx]);
});
router.delete('/logistics/portDelays/:id', canManageLogistics, (req, res) => {
  const db = read();
  const arr = db.logistics.portDelays;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '滞留记录不存在' });
  arr.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ---- 物流-在途冷柜 CRUD ----
router.post('/logistics/inTransitContainers', canManageLogistics, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('tc') };
  db.logistics.inTransitContainers.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/logistics/inTransitContainers/:id', canManageLogistics, (req, res) => {
  const db = read();
  const arr = db.logistics.inTransitContainers;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '在途柜不存在' });
  arr[idx] = { ...arr[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(arr[idx]);
});
router.delete('/logistics/inTransitContainers/:id', canManageLogistics, (req, res) => {
  const db = read();
  const arr = db.logistics.inTransitContainers;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '在途柜不存在' });
  arr.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ====== 新闻 CRUD ======
router.get('/news', canManageNews, (req, res) => {
  res.json(read().news);
});
router.post('/news', canManageNews, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('news') };
  db.news.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/news/:id', canManageNews, (req, res) => {
  const db = read();
  const idx = db.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '新闻不存在' });
  db.news[idx] = { ...db.news[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(db.news[idx]);
});
router.delete('/news/:id', canManageNews, (req, res) => {
  const db = read();
  const idx = db.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '新闻不存在' });
  db.news.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ====== 看板元信息 ======
router.put('/meta', adminOnly, (req, res) => {
  const db = read();
  db.meta = { ...db.meta, ...req.body, updatedAt: new Date().toISOString() };
  writeSync(db);
  res.json(db.meta);
});

// ====== 自动新闻（数据驱动 + 外部抓取）======
router.get('/news/auto', (req, res) => {
  res.json({
    success: true,
    data: {
      items: getAutoNews(),
      fetchedAt: require('./news-fetcher').getLastFetchedTime(),
      sources: getNewsSourceSummary(),
    },
  });
});
router.post('/news/auto/refresh', adminOnly, async (req, res) => {
  try {
    await refreshNow();
    res.json({ success: true, message: '新闻缓存已刷新', count: getAutoNews().length });
  } catch (e) {
    res.status(500).json({ success: false, error: e.message });
  }
});

module.exports = { router, aggregate };
