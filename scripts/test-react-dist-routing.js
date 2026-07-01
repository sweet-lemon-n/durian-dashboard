const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const server = fs.readFileSync(path.join(root, 'server.js'), 'utf8');

assert(
  /app\.use\(\s*['"]\/assets['"]\s*,\s*express\.static\(path\.join\(__dirname,\s*['"]dist['"]\s*,\s*['"]assets['"]\)\)\s*\)/.test(server),
  'server.js should serve React build assets from dist/assets at /assets'
);

assert(
  /const\s+reactDistIndexPath\s*=\s*path\.join\(__dirname,\s*['"]dist['"]\s*,\s*['"]index\.html['"]\)/.test(server),
  'server.js should define the dist/index.html React entry path'
);

assert(
  /const\s+reactAppRoutes\s*=\s*\[[\s\S]*['"]\/flow['"][\s\S]*['"]\/overview['"][\s\S]*['"]\/admin['"][\s\S]*\]/.test(server),
  'server.js should list extensionless React app routes'
);

assert(
  /app\.get\(\s*reactAppRoutes\s*,\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*res\.sendFile\(reactDistIndexPath\)[\s\S]*\}\s*\)/.test(server),
  'server.js should send dist/index.html for React app routes'
);

assert(
  /app\.use\(express\.static\(path\.join\(__dirname,\s*['"]public['"]\)\)\)/.test(server),
  'server.js should continue serving legacy public pages'
);

assert(
  /app\.get\(\s*['"]\/admin['"]\s*,\s*\(req,\s*res\)\s*=>\s*\{[\s\S]*public[\s\S]*admin\.html/.test(server),
  'legacy /admin route should remain mapped to public/admin.html until replacement'
);

console.log('React dist routing checks passed');
