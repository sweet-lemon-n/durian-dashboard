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
  'risk list should use flex column so many risks scroll instead of being compressed into strips'
);
assert.ok(
  /\.risk-board\{[^}]*overflow-y:auto[^}]*overflow-x:hidden/.test(html),
  'risk list should hide horizontal overflow and only scroll vertically'
);
assert.ok(
  /\.risk\{[^}]*min-height:42px/.test(html),
  'risk cards should keep a readable minimum height'
);
assert.ok(
  !/gsap\.fromTo\('\.kpi[^']*'\s*,\{autoAlpha:0/.test(html),
  'KPI entrance should not fade from full transparency because it creates black flashes'
);
assert.ok(
  /function startAmbientMotion/.test(html),
  'overview should define continuous ambient motion, not only refresh-time entrance animation'
);
assert.ok(
  /@keyframes alertSweep/.test(html),
  'overview should include persistent alert sweep animation for warning cards'
);
assert.ok(
  /@keyframes donutTurn/.test(html) && /#60a5fa','#2dd4bf/.test(html),
  'donut charts should use gradient colors and slow rotation'
);
assert.ok(
  /statusText\|\|r\.status/.test(html),
  'risk cards should prefer Chinese status text over internal status keys'
);
assert.ok(
  !/domesticTransit ·/.test(html),
  'risk card template should not hardcode internal status keys'
);

console.log('overview layout checks passed');
