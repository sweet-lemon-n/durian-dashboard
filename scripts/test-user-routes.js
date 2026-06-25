const assert = require('assert');
const userRouter = require('../lib/routes/user-routes');

assert.ok(typeof userRouter === 'function', 'user-routes must export a Router function');
assert.ok(Array.isArray(userRouter.stack), 'user-routes router must have handlers');

let hasGet = false, hasPost = false, hasPut = false, hasDelete = false;
userRouter.stack.forEach(layer => {
  const route = layer.route;
  if (!route) return;
  const methods = Object.keys(route.methods);
  if (route.path === '/') {
    if (methods.includes('get')) hasGet = true;
    if (methods.includes('post')) hasPost = true;
  }
  if (route.path === '/:id') {
    if (methods.includes('put')) hasPut = true;
    if (methods.includes('delete')) hasDelete = true;
  }
  if (route.path === '/:id/password') hasPost = true;
});
assert.ok(hasGet, 'user-routes must have GET /');
assert.ok(hasPost, 'user-routes must have POST / and POST /:id/password');
assert.ok(hasPut, 'user-routes must have PUT /:id');
assert.ok(hasDelete, 'user-routes must have DELETE /:id');

console.log('user routes loaded: OK');
