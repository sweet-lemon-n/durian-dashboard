const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const {
  ensureOverviewSnapshotSchema,
  saveOverviewSnapshot,
  getOverviewSnapshotComparison,
} = require('../lib/overview-snapshots');

const dbPath = path.join(os.tmpdir(), `overview-snapshots-${Date.now()}.db`);
const db = new Database(dbPath);

ensureOverviewSnapshotSchema(db);

saveOverviewSnapshot(db, {
  snapshotDate: '2026-06-19',
  totalOrders: 10,
  totalBoxes: 30,
  shipped: 20,
  signed: 8,
  totalRisks: 6,
  healthScore: 72,
});

saveOverviewSnapshot(db, {
  snapshotDate: '2026-06-26',
  totalOrders: 12,
  totalBoxes: 40,
  shipped: 25,
  signed: 10,
  totalRisks: 4,
  healthScore: 83,
});

saveOverviewSnapshot(db, {
  snapshotDate: '2026-06-26',
  totalOrders: 13,
  totalBoxes: 41,
  shipped: 26,
  signed: 11,
  totalRisks: 3,
  healthScore: 88,
});

const comparison = getOverviewSnapshotComparison(db, '2026-06-26', 7);

assert.equal(comparison.totalBoxes7d.current, 41);
assert.equal(comparison.totalBoxes7d.previous, 30);
assert.equal(comparison.totalBoxes7d.direction, 'up');
assert.equal(comparison.totalBoxes7d.changePct, 36.7);
assert.equal(comparison.totalRisks7d.current, 3);
assert.equal(comparison.totalRisks7d.previous, 6);
assert.equal(comparison.totalRisks7d.direction, 'down');
assert.equal(comparison.healthScore7d.current, 88);
assert.equal(comparison.healthScore7d.previous, 72);
assert.equal(comparison.healthScore7d.direction, 'up');

db.close();
fs.unlinkSync(dbPath);

console.log('overview snapshot checks passed');
