function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function dateKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function addDays(dateText, days) {
  const d = new Date(`${dateText}T00:00:00`);
  d.setDate(d.getDate() + days);
  return dateKey(d);
}

function comparison(current, previous) {
  if (!current || !previous) return null;
  let direction = 'flat';
  if (current > previous) direction = 'up';
  if (current < previous) direction = 'down';
  return {
    current,
    previous,
    direction,
    changePct: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : (current ? 100 : 0),
  };
}

function ensureOverviewSnapshotSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS overview_kpi_snapshots (
      snapshot_date TEXT PRIMARY KEY,
      total_orders INTEGER NOT NULL DEFAULT 0,
      total_boxes INTEGER NOT NULL DEFAULT 0,
      shipped INTEGER NOT NULL DEFAULT 0,
      signed INTEGER NOT NULL DEFAULT 0,
      total_risks INTEGER NOT NULL DEFAULT 0,
      health_score INTEGER NOT NULL DEFAULT 0,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
}

function normalizeSnapshot(input = {}) {
  return {
    snapshotDate: input.snapshotDate || dateKey(),
    totalOrders: num(input.totalOrders),
    totalBoxes: num(input.totalBoxes),
    shipped: num(input.shipped),
    signed: num(input.signed),
    totalRisks: num(input.totalRisks),
    healthScore: num(input.healthScore),
  };
}

function saveOverviewSnapshot(db, input) {
  ensureOverviewSnapshotSchema(db);
  const row = normalizeSnapshot(input);
  db.prepare(`
    INSERT INTO overview_kpi_snapshots
      (snapshot_date, total_orders, total_boxes, shipped, signed, total_risks, health_score, payload_json)
    VALUES
      (@snapshotDate, @totalOrders, @totalBoxes, @shipped, @signed, @totalRisks, @healthScore, @payloadJson)
    ON CONFLICT(snapshot_date) DO UPDATE SET
      total_orders = excluded.total_orders,
      total_boxes = excluded.total_boxes,
      shipped = excluded.shipped,
      signed = excluded.signed,
      total_risks = excluded.total_risks,
      health_score = excluded.health_score,
      payload_json = excluded.payload_json,
      updated_at = datetime('now')
  `).run({
    ...row,
    payloadJson: JSON.stringify({
      totalOrders: row.totalOrders,
      totalBoxes: row.totalBoxes,
      shipped: row.shipped,
      signed: row.signed,
      totalRisks: row.totalRisks,
      healthScore: row.healthScore,
    }),
  });
  return row;
}

function getSnapshotByDate(db, snapshotDate) {
  ensureOverviewSnapshotSchema(db);
  const row = db.prepare(`
    SELECT snapshot_date, total_orders, total_boxes, shipped, signed, total_risks, health_score
    FROM overview_kpi_snapshots
    WHERE snapshot_date = ?
  `).get(snapshotDate);
  if (!row) return null;
  return {
    snapshotDate: row.snapshot_date,
    totalOrders: num(row.total_orders),
    totalBoxes: num(row.total_boxes),
    shipped: num(row.shipped),
    signed: num(row.signed),
    totalRisks: num(row.total_risks),
    healthScore: num(row.health_score),
  };
}

function getOverviewSnapshotComparison(db, snapshotDate = dateKey(), periodDays = 7) {
  const current = getSnapshotByDate(db, snapshotDate);
  const previous = getSnapshotByDate(db, addDays(snapshotDate, -periodDays));
  if (!current || !previous) {
    return {
      totalOrders7d: null,
      totalBoxes7d: null,
      shipped7d: null,
      signed7d: null,
      totalRisks7d: null,
      healthScore7d: null,
    };
  }
  return {
    totalOrders7d: comparison(current.totalOrders, previous.totalOrders),
    totalBoxes7d: comparison(current.totalBoxes, previous.totalBoxes),
    shipped7d: comparison(current.shipped, previous.shipped),
    signed7d: comparison(current.signed, previous.signed),
    totalRisks7d: comparison(current.totalRisks, previous.totalRisks),
    healthScore7d: comparison(current.healthScore, previous.healthScore),
  };
}

module.exports = {
  ensureOverviewSnapshotSchema,
  saveOverviewSnapshot,
  getOverviewSnapshotComparison,
  dateKey,
};
