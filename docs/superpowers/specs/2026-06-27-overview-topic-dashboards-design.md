# Overview Topic Dashboards Design

## Goal

Turn each major block in `public/app-overview.html` into a full topic dashboard that users can enter from the executive overview, while keeping the current overview as the top-level command center.

## Scope

The first version adds six topic dashboards behind URL parameters on the existing page:

- `?board=fulfillment`: fulfillment efficiency dashboard
- `?board=logistics`: logistics bottleneck dashboard
- `?board=temperature`: cold-chain temperature dashboard
- `?board=orders`: order structure dashboard
- `?board=risks`: risk workbench dashboard
- `?board=news`: external information dashboard

These dashboards must not simply enlarge the current overview cards. Each topic view must provide multiple analysis surfaces: KPI tiles, charts or distribution views, prioritized lists, and drilldown entry points.

## Architecture

`public/app-overview.html` remains a single-file page and continues to consume `/api/auth/me` and `/api/overview-executive`. The page reads `board` from `location.search` to decide whether to render the current overview grid or a topic dashboard. Existing filters, permissions, modal drilldowns, refresh loop, and motion hooks are reused.

No new backend route is required for this first version. If a future topic needs data not returned by `/api/overview-executive`, that will be recorded as a follow-up task instead of blocking the first version.

## Topic Views

### Fulfillment Efficiency

Style: flow command screen.

Displays:

- Fulfillment KPI tiles for total boxes, shipped, arrived, signed, and health score.
- Full chain funnel with stage conversion rates.
- Cycle time cards for overseas, on-shore, and domestic segments.
- Country, category, and factory structure slices for context.
- Drilldown buttons for shipped, arrived, signed, and delayed records.

### Logistics Bottleneck

Style: dispatch monitoring screen.

Displays:

- Bottleneck KPI tiles based on current bottleneck records.
- Bottleneck ranking with longest dwell hints and progress against shipped containers.
- Status distribution using available drilldown groups.
- Priority container list with drilldown.

### Temperature Monitoring

Style: cold-chain monitoring screen.

Displays:

- Alarm rate, alarm count, maximum deviation, and average return temperature.
- Temperature mini Gantt across recent days.
- Top abnormal containers.
- Temperature details and container-specific drilldown.

### Order Structure

Style: business analysis screen.

Displays:

- Order and box KPI tiles.
- Country, category, and brand or factory distributions.
- Shipped and signed comparison.
- Drilldowns by country, category, factory, and shipped details.

### Risk Workbench

Style: action desk.

Displays:

- Total risk, high-priority risk, temperature alert, and logistics bottleneck summaries.
- Risk type distribution.
- Prioritized work list with status and days.
- Drilldowns for all risks and individual risk rows.

### External Information

Style: industry intelligence stream.

Displays:

- News count and source count.
- Source distribution.
- Main news stream.
- Recency timeline using available date strings.

## Interaction

The overview page adds "进入看板" actions on each block. Topic dashboards show a compact topic navigation strip and a "返回总览" action. Existing filter changes preserve the current `board` parameter.

## Testing

Add a focused static test that verifies:

- All six board keys exist.
- Overview panels expose topic dashboard links.
- Topic mode has a dedicated renderer and back-to-overview link.
- Topic render functions exist for all six dashboards.

Run the new test, existing overview tests, page syntax checks, and whitespace diff checks before completion.
