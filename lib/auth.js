/**
 * JWT 认证工具与 Express 中间件
 *
 * - 使用 jsonwebtoken (HS256) 签发/验证令牌
 * - 令牌存储在 httpOnly cookie 中
 * - requireAuth 中间件验证令牌 + 检查 token_version（支持强制下线）
 * - requireRole 中间件工厂函数检查用户角色
 */

const jwt = require('jsonwebtoken');

const COOKIE_NAME = 'token';

// ---- JWT 工具 ----

/**
 * 生成 JWT 令牌
 * @param {object} user - 数据库用户行（含 id, username, role, token_version）
 * @param {boolean} rememberMe - true=7天过期，false=24h过期
 * @returns {string} 签名的 JWT
 */
function generateToken(user, rememberMe) {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET 未配置');

  const expiresIn = rememberMe ? '7d' : '24h';

  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      tokenVersion: user.token_version,
    },
    secret,
    { algorithm: 'HS256', expiresIn }
  );
}

/**
 * 验证 JWT 令牌
 * @param {string} token
 * @returns {object|null} 解码后的 payload，无效/过期返回 null
 */
function verifyToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET, { algorithms: ['HS256'] });
  } catch (_) {
    return null;
  }
}

// ---- Cookie 辅助函数 ----

/**
 * 设置认证 cookie
 * @param {Response} res - Express response
 * @param {string} token - JWT 字符串
 * @param {boolean} rememberMe - true=持久化 7 天，false=会话 cookie
 */
function setAuthCookie(res, token, rememberMe) {
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: rememberMe ? 7 * 24 * 60 * 60 * 1000 : undefined,
  });
}

/**
 * 清除认证 cookie
 * @param {Response} res - Express response
 */
function clearAuthCookie(res) {
  res.clearCookie(COOKIE_NAME, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
  });
}

// ---- Express 中间件 ----

/**
 * 认证中间件：验证 JWT cookie，检查 token_version
 *
 * 验证通过后，在 req.user 上附加用户信息：
 *   { userId, username, displayName, role }
 *
 * 验证失败返回 401 JSON。
 * 注意：此中间件依赖 cookie-parser 先解析 cookie。
 */
function requireAuth(req, res, next) {
  const token = req.cookies && req.cookies[COOKIE_NAME];
  if (!token) {
    return res.status(401).json({ success: false, error: '未登录，请先登录' });
  }

  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ success: false, error: '登录已过期，请重新登录' });
  }

  // 检查 token_version（支持强制下线）
  try {
    const { getDb, normalizePermissions, normalizeDashboardPermissions } = require('./db');
    const db = getDb();
    const user = db.prepare(
      'SELECT id, is_active, token_version, role, username, display_name, permissions, dashboard_permissions FROM users WHERE id = ?'
    ).get(payload.userId);

    if (!user) {
      return res.status(401).json({ success: false, error: '账号不存在' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: '账号已被禁用，请联系管理员' });
    }

    if (user.token_version !== payload.tokenVersion) {
      return res.status(401).json({ success: false, error: '登录已失效，请重新登录' });
    }

    // 挂载用户信息到请求对象
    req.user = {
      userId: user.id,
      username: user.username,
      displayName: user.display_name,
      role: user.role,
      permissions: normalizePermissions(user.role, user.permissions),
      dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
    };
  } catch (err) {
    console.error('[auth] token_version 检查异常:', err.message);
    return res.status(500).json({ success: false, error: '认证服务异常' });
  }

  next();
}

/**
 * 角色检查中间件工厂
 * @param  {...string} roles - 允许的角色列表
 * @returns {Function} Express 中间件
 *
 * 用法：app.post('/admin/only', requireRole('admin'), handler)
 */
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        error: `权限不足，需要 ${roles.join('/')} 角色`,
      });
    }
    next();
  };
}

/**
 * 模块权限检查：admin 永远通过，viewer 需包含对应模块权限。
 * @param {string} permission - 模块权限 key
 * @returns {Function} Express 中间件
 */
function requirePermission(permission) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ success: false, error: '未登录' });
    }
    if (req.user.role === 'admin' || (req.user.permissions || []).includes(permission)) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: `权限不足，需要 ${permission} 模块权限`,
    });
  };
}

module.exports = {
  COOKIE_NAME,
  generateToken,
  verifyToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole,
  requirePermission,
};
