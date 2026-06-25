const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const admin = fs.readFileSync('public/admin.html', 'utf8');

assert.ok(
  fs.existsSync('scripts/test-page-syntax.js'),
  'reusable page syntax checker must exist'
);

assert.ok(
  /app\.post\('\/callback'[\s\S]*console\.log\('\[callback\] 收到 POST 推送'/.test(server)
    && /app\.post\('\/callback'[\s\S]*res\.send\('success'\)/.test(server),
  'POST /callback must acknowledge WeCom push with plain success'
);

assert.ok(
  !/app\.get\('\/api\/auth\/me'/.test(server),
  'server.js must not keep a stale inline /api/auth/me route after auth route extraction'
);

assert.ok(
  /admin:'系统管理'/.test(admin) && !/accounts:'账号管理'/.test(admin),
  'admin permission UI must use admin module key instead of legacy accounts key'
);

assert.ok(
  /overview:'运营总览'/.test(admin)
    && /orders:'订单看板'/.test(admin)
    && /flow:'货柜流向'/.test(admin)
    && /temperature:'温度监控'/.test(admin),
  'dashboard permission UI must expose new module keys'
);

console.log('modular regression checks passed');
