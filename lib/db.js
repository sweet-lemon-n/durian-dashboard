/**
 * SQLite 数据库初始化与用户 CRUD 操作
 *
 * 使用 better-sqlite3（同步 API），数据库文件存储在 data/auth.db
 * createUser 因需要 bcrypt 哈希密码，是唯一异步函数
 */

const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const fs = require('fs');

const SALT_ROUNDS = 12;

let db = null;

/**
 * 初始化数据库：创建/打开数据库文件，建表，启用 WAL 模式
 * @param {string} dbPath - 数据库文件路径
 * @returns {Database} better-sqlite3 实例
 */
function initDatabase(dbPath) {
  if (db) return db;

  // 确保目录存在
  const dir = path.dirname(dbPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  // 用户表
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      username        TEXT    UNIQUE NOT NULL,
      password_hash   TEXT    NOT NULL,
      display_name    TEXT    NOT NULL DEFAULT '',
      role            TEXT    NOT NULL DEFAULT 'viewer'
                              CHECK(role IN ('admin', 'viewer')),
      is_active       INTEGER NOT NULL DEFAULT 1,
      token_version   INTEGER NOT NULL DEFAULT 1,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT    NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // 操作审计日志表（预留，后续审计功能使用）
  db.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id     INTEGER,
      action      TEXT    NOT NULL,
      resource    TEXT,
      details     TEXT,
      ip_address  TEXT,
      created_at  TEXT    NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);

  console.log('[db] SQLite 数据库已初始化:', dbPath);
  return db;
}

/**
 * 获取当前数据库实例
 * @returns {Database}
 */
function getDb() {
  if (!db) throw new Error('数据库未初始化，请先调用 initDatabase()');
  return db;
}

/**
 * 按用户名查找用户
 * @param {Database} database - db 实例
 * @param {string} username
 * @returns {object|undefined} 用户行（含 password_hash）
 */
function getUserByUsername(database, username) {
  return database.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

/**
 * 按 ID 查找用户
 * @param {Database} database
 * @param {number} id
 * @returns {object|undefined}
 */
function getUserById(database, id) {
  return database.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

/**
 * 创建新用户（异步 — 内部 bcrypt 哈希密码）
 * @param {Database} database
 * @param {object} opts
 * @param {string} opts.username
 * @param {string} opts.password - 明文密码
 * @param {string} [opts.displayName] - 显示名，默认同 username
 * @param {string} [opts.role] - 角色，默认 'viewer'
 * @returns {Promise<{id: number}>}
 */
async function createUser(database, { username, password, displayName, role }) {
  if (!username || !password) {
    throw new Error('用户名和密码不能为空');
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const stmt = database.prepare(
    'INSERT INTO users (username, password_hash, display_name, role) VALUES (?, ?, ?, ?)'
  );
  const result = stmt.run(username, passwordHash, displayName || username, role || 'viewer');
  return { id: Number(result.lastInsertRowid) };
}

/**
 * 更新用户字段
 * @param {Database} database
 * @param {number} id
 * @param {object} fields - 要更新的字段，键为列名（password_hash, display_name, role, is_active, token_version 等）
 */
function updateUser(database, id, fields) {
  const allowed = ['password_hash', 'display_name', 'role', 'is_active', 'token_version'];
  const sets = [];
  const values = [];

  for (const [key, value] of Object.entries(fields)) {
    if (allowed.includes(key)) {
      sets.push(`${key} = ?`);
      values.push(value);
    }
  }

  if (sets.length === 0) return { changes: 0 };

  sets.push("updated_at = datetime('now')");
  values.push(id);

  const stmt = database.prepare(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`);
  const result = stmt.run(...values);
  return { changes: result.changes };
}

/**
 * 列出所有用户（不含密码哈希）
 * @param {Database} database
 * @returns {Array<object>}
 */
function listUsers(database) {
  return database.prepare(
    'SELECT id, username, display_name, role, is_active, token_version, created_at, updated_at FROM users ORDER BY id'
  ).all();
}

/**
 * 递增用户的 token_version（强制所有现有 JWT 失效）
 * @param {Database} database
 * @param {number} userId
 */
function incrementTokenVersion(database, userId) {
  database.prepare(
    "UPDATE users SET token_version = token_version + 1, updated_at = datetime('now') WHERE id = ?"
  ).run(userId);
}

/**
 * 返回用户总数
 * @param {Database} database
 * @returns {number}
 */
function countUsers(database) {
  const row = database.prepare('SELECT COUNT(*) AS cnt FROM users').get();
  return row.cnt;
}

module.exports = {
  initDatabase,
  getDb,
  getUserByUsername,
  getUserById,
  createUser,
  updateUser,
  listUsers,
  incrementTokenVersion,
  countUsers,
};
