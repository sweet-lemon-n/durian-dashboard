const assert = require('assert');
const fs = require('fs');

const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

assert.ok(!pkg.dependencies?.xlsx, 'xlsx should not be a production dependency');
assert.ok(!lock.packages?.['node_modules/xlsx'], 'package-lock should not install xlsx');

console.log('production dependency checks passed');
