const assert = require('assert');
const fs = require('fs');

const server = fs.readFileSync('server.js', 'utf8');
const index = fs.readFileSync('public/index.html', 'utf8');

assert.ok(
  server.includes("includes('temperature')") && server.includes("includes('gantt')"),
  '/api/dashboard must allow new temperature permission and legacy gantt permission'
);

assert.ok(
  index.includes("hasDashboardPermission('temperature', 'gantt')"),
  'index.html must map temperature dashboard permission to legacy gantt visibility'
);

console.log('gantt permission checks passed');
