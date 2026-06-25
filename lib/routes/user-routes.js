/**
 * 用户管理路由：CRUD + 密码重置 + 批量停用
 * 挂载路径：server.js 中 app.use('/api/users', userRouter)
 * 所有路由需要 admin 权限（由 server.js 的中间件保护）
 */

const express = require('express');
const router = express.Router();
const {
  getDb,
  createUser,
  updateUser,
  listUsers,
  incrementTokenVersion,
  normalizePermissions,
  stringifyPermissions,
  normalizeDashboardPermissions,
  stringifyDashboardPermissions,
} = require('../db');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isActive: !!user.is_active,
    tokenVersion: user.token_version,
    permissions: normalizePermissions(user.role, user.permissions),
    dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function getUserByIdSafe(db, id) {
  return db.prepare(
    'SELECT id, username, display_name, role, is_active, token_version, permissions, dashboard_permissions, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);
}

// GET / — 列出所有用户
router.get('/', (req, res) => {
  const users = listUsers(getDb()).map(user => ({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isActive: !!user.is_active,
    tokenVersion: user.token_version,
    permissions: user.permissions,
    dashboardPermissions: user.dashboardPermissions,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }));
  res.json({ success: true, data: users });
});

// POST / — 创建用户
router.post('/', async (req, res) => {
  try {
    const { username, password, displayName, role, permissions, dashboardPermissions } = req.body || {};
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername || !password) {
      return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    }

    const db = getDb();
    const created = await createUser(db, {
      username: cleanUsername,
      password,
      displayName: String(displayName || cleanUsername).trim(),
      role: role === 'admin' ? 'admin' : 'viewer',
      permissions,
      dashboardPermissions,
    });
    res.status(201).json({ success: true, data: publicUser(getUserByIdSafe(db, created.id)) });
  } catch (err) {
    const isDuplicate = /UNIQUE constraint failed/.test(err.message);
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: isDuplicate ? '用户名已存在' : err.message,
    });
  }
});

// PUT /:id — 更新用户信息
router.put('/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, error: '用户 ID 不正确' });
  }

  const db = getDb();
  const existing = getUserByIdSafe(db, userId);
  if (!existing) return res.status(404).json({ success: false, error: '账号不存在' });

  const role = req.body.role === 'admin' ? 'admin' : 'viewer';
  const isActive = req.body.isActive === undefined ? !!existing.is_active : !!req.body.isActive;
  if (userId === req.user.userId && role !== 'admin') {
    return res.status(400).json({ success: false, error: '不能取消当前登录账号的管理员身份' });
  }
  if (userId === req.user.userId && !isActive) {
    return res.status(400).json({ success: false, error: '不能禁用当前登录账号' });
  }

  const fields = {
    display_name: String(req.body.displayName || existing.display_name || existing.username).trim(),
    role,
    is_active: isActive ? 1 : 0,
    permissions: stringifyPermissions(role, req.body.permissions),
    dashboard_permissions: stringifyDashboardPermissions(req.body.dashboardPermissions),
  };
  updateUser(db, userId, fields);
  if (role !== existing.role || isActive !== !!existing.is_active || fields.permissions !== existing.permissions) {
    incrementTokenVersion(db, userId);
  }
  res.json({ success: true, data: publicUser(getUserByIdSafe(db, userId)) });
});

// POST /:id/password — 重置密码
router.post('/:id/password', async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const password = req.body && req.body.password;
    if (!Number.isInteger(userId) || !password) {
      return res.status(400).json({ success: false, error: '用户 ID 或新密码不能为空' });
    }

    const db = getDb();
    if (!getUserByIdSafe(db, userId)) return res.status(404).json({ success: false, error: '账号不存在' });
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);
    updateUser(db, userId, { password_hash: passwordHash });
    incrementTokenVersion(db, userId);
    res.json({ success: true, message: '密码已重置' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// DELETE /:id — 删除用户
router.delete('/:id', (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, error: '用户 ID 不正确' });
  }
  if (userId === req.user.userId) {
    return res.status(400).json({ success: false, error: '不能删除当前登录账号' });
  }

  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (!result.changes) return res.status(404).json({ success: false, error: '账号不存在' });
  res.json({ success: true, message: '账号已删除' });
});

module.exports = router;
