// 看板内容 API：/api/aggregate（聚合，登录可读）+ orders/logistics/news CRUD（写操作需 admin）
// 数据来自 lib/content-store.js 的占位 JSON；企微真实温度数据另走 /api/dashboard。
// 注意：本路由挂在 server.js 的 `app.use('/api', guard)` 之后，故 GET 默认已要求登录。
//       响应体保持原始 object/array（不包 {success,data}），以匹配移植自模板的前端 JS。
const express = require('express');
const { read, writeSync, genId } = require('./content-store');
const { requireRole } = require('./auth');

const router = express.Router();
const adminOnly = requireRole('admin');

// ---------- 聚合计算（看板用）----------
function aggregate(db) {
  const byCountry = (c) => {
    const rows = db.orders.filter(o => o.country === c);
    const sum = (k) => rows.reduce((a, r) => a + (Number(r[k]) || 0), 0);
    const boxes = sum('boxes');
    const done = c === 'TH' ? sum('delivered') : sum('signed');
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
  const totalDone    = (th.delivered + th.signed) + (vn.delivered + vn.signed);
  const totalMoving  = (th.transit + th.port) + (vn.transit + vn.port);
  const totalPending = th.pending + vn.pending;

  return {
    meta: db.meta,
    global: { totalOrders, totalBoxes, totalDone, totalMoving, totalPending },
    th, vn,
    logistics: db.logistics,
    news: { th: db.news.filter(n => n.country === 'TH'), vn: db.news.filter(n => n.country === 'VN') },
    generatedAt: new Date().toISOString(),
  };
}

// ====== GET /api/aggregate ======
router.get('/aggregate', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json(aggregate(read()));
});

// ====== 订单 CRUD ======
router.get('/orders', (req, res) => {
  res.json(read().orders);
});
router.post('/orders', adminOnly, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('ord') };
  db.orders.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/orders/:id', adminOnly, (req, res) => {
  const db = read();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders[idx] = { ...db.orders[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(db.orders[idx]);
});
router.delete('/orders/:id', adminOnly, (req, res) => {
  const db = read();
  const idx = db.orders.findIndex(o => o.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '订单不存在' });
  db.orders.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ====== 物流整体 ======
router.get('/logistics', (req, res) => {
  res.json(read().logistics);
});
router.put('/logistics', adminOnly, (req, res) => {
  const db = read();
  db.logistics = { ...db.logistics, ...req.body };
  writeSync(db);
  res.json(db.logistics);
});

// ---- 物流 KPI 单独更新 ----
router.put('/logistics/kpis', adminOnly, (req, res) => {
  const db = read();
  db.logistics.kpis = { ...db.logistics.kpis, ...req.body };
  writeSync(db);
  res.json(db.logistics.kpis);
});

// ---- 物流-滞留预警 CRUD ----
router.post('/logistics/portDelays', adminOnly, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('pd') };
  db.logistics.portDelays.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/logistics/portDelays/:id', adminOnly, (req, res) => {
  const db = read();
  const arr = db.logistics.portDelays;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '滞留记录不存在' });
  arr[idx] = { ...arr[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(arr[idx]);
});
router.delete('/logistics/portDelays/:id', adminOnly, (req, res) => {
  const db = read();
  const arr = db.logistics.portDelays;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '滞留记录不存在' });
  arr.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ---- 物流-在途冷柜 CRUD ----
router.post('/logistics/inTransitContainers', adminOnly, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('tc') };
  db.logistics.inTransitContainers.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/logistics/inTransitContainers/:id', adminOnly, (req, res) => {
  const db = read();
  const arr = db.logistics.inTransitContainers;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '在途柜不存在' });
  arr[idx] = { ...arr[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(arr[idx]);
});
router.delete('/logistics/inTransitContainers/:id', adminOnly, (req, res) => {
  const db = read();
  const arr = db.logistics.inTransitContainers;
  const idx = arr.findIndex(x => x.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '在途柜不存在' });
  arr.splice(idx, 1);
  writeSync(db);
  res.json({ ok: true });
});

// ====== 新闻 CRUD ======
router.get('/news', (req, res) => {
  res.json(read().news);
});
router.post('/news', adminOnly, (req, res) => {
  const db = read();
  const body = { ...req.body, id: req.body.id || genId('news') };
  db.news.push(body);
  writeSync(db);
  res.status(201).json(body);
});
router.put('/news/:id', adminOnly, (req, res) => {
  const db = read();
  const idx = db.news.findIndex(n => n.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '新闻不存在' });
  db.news[idx] = { ...db.news[idx], ...req.body, id: req.params.id };
  writeSync(db);
  res.json(db.news[idx]);
});
router.delete('/news/:id', adminOnly, (req, res) => {
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

module.exports = { router, aggregate };
