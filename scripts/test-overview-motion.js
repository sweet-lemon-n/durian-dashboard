const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');
const server = fs.readFileSync('server.js', 'utf8');
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));

assert.ok(
  pkg.dependencies && pkg.dependencies.gsap,
  'GSAP should be installed server-deployed local dependency'
);
assert.ok(
  /app\.get\('\/vendor\/gsap\/gsap\.min\.js'/.test(server),
  'server should expose local GSAP browser bundle'
);
assert.ok(
  /<script src="\/vendor\/gsap\/gsap\.min\.js"><\/script>/.test(html),
  'overview page should load local GSAP before page logic'
);
assert.ok(
  /window\.DashboardMotion\s*=/.test(html),
  'overview page should define DashboardMotion integration point'
);
assert.ok(
  /DashboardMotion\.afterOverviewRender/.test(html),
  'overview load should trigger motion after rendering dashboard sections'
);
assert.ok(
  /prefers-reduced-motion:\s*reduce/.test(html),
  'overview motion should respect reduced-motion users'
);
assert.ok(
  /<linearGradient id="\$\{gradId\}"/.test(html) && /stroke="url\(#\$\{gradId\}\)"/.test(html),
  'donut charts should render actual SVG gradient strokes, not only static CSS colors'
);
assert.ok(
  !/conic-gradient/.test(html),
  'donut charts should not fall back to static conic-gradient backgrounds'
);
assert.ok(
  !/filter:\s*['"`][^'"`]*brightness\(/.test(html),
  'ambient motion should not animate brightness because it can dim the top overview'
);
assert.ok(
  !/\.topbar,\.dashboard,\.modal-backdrop\{position:relative;z-index:1\}/.test(html),
  'motion stacking rule must not override drill modal fixed positioning'
);
assert.ok(
  /\.modal-backdrop\{[^}]*position:fixed[^}]*z-index:20/.test(html),
  'drill modal backdrop should stay fixed above the dashboard after motion styles'
);

console.log('overview motion checks passed');
