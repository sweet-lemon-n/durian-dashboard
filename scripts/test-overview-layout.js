const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');

assert.ok(
  /\.kpi\{[^}]*display:grid[^}]*grid-template-rows:16px 28px 1fr/.test(html),
  'KPI cards should reserve fixed rows so text cannot overflow'
);
assert.ok(
  /\.health-rule\{[^}]*display:none/.test(html),
  'health rule should not render long line inside KPI strip'
);
assert.ok(
  /\.bottleneck-list\{[^}]*overflow:auto/.test(html),
  'bottleneck list scroll instead clipping last card'
);
assert.ok(
  /\.bottleneck\{[^}]*padding:6px/.test(html),
  'bottleneck cards should compact enough one-screen view'
);
assert.ok(
  /\.risk-board\{[^}]*display:flex[^}]*flex-direction:column/.test(html),
  'risk list should use flex column so many risks scroll instead being compressed into strips'
);
assert.ok(
  /\.risk-board\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/.test(html),
  'risk list should hide horizontal overflow only scroll vertically'
);
assert.ok(
  /\.risk-board\{[^}]*padding-right:0/.test(html) && !/\.risk-board\{[^}]*scrollbar-gutter:stable/.test(html),
  'risk list should not reserve an ugly scrollbar gutter or create a visible empty strip'
);
assert.ok(
  /\.risk\{[^}]*min-height:42px/.test(html),
  'risk cards should keep readable minimum height'
);
assert.ok(
  /外部信息/.test(html) && !/只保留最新 3 条/.test(html),
  'news panel should not claim only three items are shown'
);
assert.ok(
  /data-auto-scroll/.test(html) && /mouseenter/.test(html) && /mouseleave/.test(html),
  'auto-scrolling lists should expose pause-on-hover behavior'
);
assert.ok(
  /const panel=\$\('riskPanel'\);if\(panel\)\{panel\.scrollTop=0;panel\.scrollLeft=0\}/.test(html),
  'risk panel itself should reset scroll position after render'
);
assert.strictEqual(
  (html.match(/function renderRisks/g) || []).length,
  (html.match(/const panel=\$\('riskPanel'\);if\(panel\)\{panel\.scrollTop=0;panel\.scrollLeft=0\}/g) || []).length,
  'every risk renderer should reset the outer risk panel scroll position'
);
assert.ok(
  !/gsap\.fromTo\('\.kpi[^']*'\s*,\{autoAlpha:0/.test(html),
  'KPI entrance should not fade from full transparency because creates black flashes'
);
assert.ok(
  /function startAmbientMotion/.test(html),
  'overview define continuous ambient motion, not only refresh-time entrance animation'
);
assert.ok(
  /@keyframes alertSweep/.test(html),
  'overview include persistent alert sweep animation warning cards'
);
assert.ok(
  /@keyframes donutTurn/.test(html) && /donut-grad-/.test(html),
  'donut charts should use gradient colors slow rotation'
);
assert.ok(
  !/<div class="structure-grid" hidden><\/div>/.test(html),
  'structure portrait should not render a hidden legacy grid that pushes donut charts out of view'
);
assert.ok(
  /\.donut-grid\{[^}]*height:calc\(100% - 39px\)[^}]*grid-template-columns:repeat\(3/.test(html),
  'structure portrait should dedicate the panel body to three donut cards'
);

console.log('overview layout checks passed');
