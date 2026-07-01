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
  /const STRUCTURE_TECH_COLORS=/.test(html)
    && /#60a5fa/.test(html)
    && /#2dd4bf/.test(html)
    && /#f59e0b/.test(html)
    && /#a78bfa/.test(html)
    && /#f5c451/.test(html)
    && /#22c55e/.test(html),
  'structure portrait should use differentiated technology gradients matching the fulfillment palette'
);
assert.ok(
  /function autoScrollList/.test(html)
    && /autoScrollList\('#riskPanel \.risk-board'/.test(html)
    && /autoScrollList\('#newsPanel \.news-list'/.test(html),
  'risk and news panels should auto-scroll when their content overflows'
);
assert.ok(
  /mini-gantt-body/.test(html)
    && /autoScrollList\('\.mini-gantt-body'/.test(html),
  'temperature gantt rows should be in a scrollable body and auto-scroll when overflowing'
);
assert.ok(
  /markUserIntervened/.test(html)
    && /addEventListener\('wheel',markUserIntervened/.test(html)
    && /addEventListener\('touchstart',markUserIntervened/.test(html)
    && /addEventListener\('pointerdown',markUserIntervened/.test(html)
    && /restartAutoScroll/.test(html)
    && /el\.removeAttribute\('data-user-scroll'\)/.test(html),
  'auto-scrolling lists should pause during user interaction and resume from the current position after mouse leave'
);
assert.ok(
  /\.mini-gantt-body\{[^}]*overflow:auto/.test(html),
  'temperature gantt body should allow manual user scrolling'
);
assert.ok(
  /function renderGanttCell/.test(html)
    && /cell\.segments/.test(html)
    && /gantt-segment/.test(html),
  'temperature gantt cells should render one segment per temperature record'
);
assert.ok(
  /\.gantt-segment\.alarm/.test(html)
    && /tempWarnPulse/.test(html),
  'temperature gantt alarm segments should breathe and flash'
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
assert.ok(
  /\.gantt-cell\.missing\{/.test(html),
  'overview temperature gantt should visually distinguish missing temperature cells'
);
assert.ok(
  /cell\.statusText/.test(html),
  'overview temperature gantt cell tooltip should include status text such as temperature missing'
);

console.log('overview motion checks passed');
