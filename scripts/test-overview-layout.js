const assert = require('assert');
const fs = require('fs');

const html = fs.readFileSync('public/app-overview.html', 'utf8');

assert.ok(/\.kpi\{[^}]*display:grid[^}]*grid-template-rows:16px 28px 1fr/.test(html), 'KPI cards should reserve fixed rows so text cannot overflow');
assert.ok(/\.health-rule\{[^}]*display:none/.test(html), 'health rule should not render as a long line inside the KPI strip');
assert.ok(/\.bottleneck-list\{[^}]*overflow:auto/.test(html), 'bottleneck list should scroll instead of clipping the last card');
assert.ok(/\.bottleneck\{[^}]*padding:6px/.test(html), 'bottleneck cards should be compact enough for one-screen view');
assert.ok(/statusText\|\|r\.status/.test(html), 'risk cards should prefer Chinese status text over internal status keys');
assert.ok(!/domesticTransit ·/.test(html), 'risk card template should not hardcode internal status keys');

console.log('overview layout checks passed');
