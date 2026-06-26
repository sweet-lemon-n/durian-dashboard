const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.ok(
  pkg.dependencies && pkg.dependencies.gsap,
  'GSAP should be installed as a server-deployed local dependency'
);

assert.ok(
  /app\.get\('\/vendor\/gsap\/gsap\.min\.js'/.test(server),
  'server should expose a local GSAP browser bundle'
);

assert.ok(
  /<script src="\/vendor\/gsap\/gsap\.min\.js"><\/script>/.test(html),
  'overview page should load local GSAP before page logic'
);

assert.ok(
  /window\.DashboardMotion\s*=/.test(html),
  'overview page should define a DashboardMotion integration point'
);

assert.ok(
  /DashboardMotion\.afterOverviewRender/.test(html),
  'overview load should trigger motion after rendering dashboard sections'
);

assert.ok(
  /prefers-reduced-motion:\s*reduce/.test(html),
  'overview motion should respect reduced-motion users'
);

console.log('overview motion checks passed');
