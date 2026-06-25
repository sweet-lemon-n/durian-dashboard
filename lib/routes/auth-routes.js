/**
 * 认证路由：登录、登出、当前用户信息
 * 挂载路径：server.js 中 app.use('/api/auth', authRouter)
 * login 和 logout 不需要 requireAuth 守卫；me 路由需要。
 */

const express = require('express');
const router = express.Router();

const {
  getDb,
  normalizePermissions,
  normalizeDashboardPermissions,
} = require('../db');
const {
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
} = require('../auth');

/**
 * POST /login
 * Body: { username, password, rememberMe? }
 * 验证成功后设置 httpOnly JWT cookie
 */
router.post('/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: '账号已被禁用，请联系管理员' });
    }

    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const token = generateToken(user, !!rememberMe);
    setAuthCookie(res, token, !!rememberMe);

    console.log(`[auth/login] 用户「${user.username}」登录成功`);

    res.json({
      success: true,
      data: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        permissions: normalizePermissions(user.role, user.permissions),
        dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
      },
    });
  } catch (err) {
    console.error('[auth/login] 错误:', err);
    res.status(500).json({ success: false, error: '登录服务异常' });
  }
});

/**
 * POST /logout
 * 清除认证 cookie
 */
router.post('/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: '已退出登录' });
});

/**
 * GET /me
 * 返回当前登录用户基本信息（需已通过 requireAuth）
 */
router.get('/me', requireAuth, (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role,
      permissions: req.user.permissions || [],
      dashboardPermissions: req.user.dashboardPermissions || [],
    },
  });
});

module.exports = router;
