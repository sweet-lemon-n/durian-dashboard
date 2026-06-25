const assert = require('assert');
const path = require('path');

const authRouter = require('../lib/routes/auth-routes');
assert.ok(typeof authRouter === 'function', 'auth-routes must export a Router function');
assert.ok(Array.isArray(authRouter.stack), 'auth-routes router must have handlers');

// 确认路由有 login, logout, me 路由
let hasLogin = false, hasLogout = false, hasMe = false;
authRouter.stack.forEach(layer => {
  const route = layer.route;
  if (!route) return;
  if (route.path === '/login') hasLogin = true;
  if (route.path === '/logout') hasLogout = true;
  if (route.path === '/me') hasMe = true;
});
assert.ok(hasLogin, 'auth-routes must have POST /login');
assert.ok(hasLogout, 'auth-routes must have POST /logout');
assert.ok(hasMe, 'auth-routes must have GET /me');

console.log('auth routes loaded: OK');
