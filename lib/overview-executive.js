const DAY_MS = 86400000;
const STATUS_TEXT = {
  overseasTransit: '国外在途',
  onShore: '在岸待叫车',
  domesticTransit: '国内在途',
  signed: '已签收',
  arrived: '已到岸',
};
const TEMP_STATUS_TEXT = {
  ALARM: '温度异常',
  WARN: '温度预警',
  OK: '温度正常',
};
const SEVERITY_TEXT = {
  high: '严重',
  medium: '中等',
  low: '轻微',
};
const HEALTH_RULE = {
  baseScore: 100,
  highRiskDeduction: 12,
  mediumRiskDeduction: 5,
  minScore: 0,
  description: '100 分起，严重风险每条扣 12 分，中等风险每条扣 5 分，最低 0 分。',
};
const TEMP_WARNING_DEVIATION = 1.5;

function num(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function pct(n, d) {
  return d ? Math.round((num(n) / num(d)) * 1000) / 10 : 0;
}

function parseTimeMs(value) {
  if (!value) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.getTime();
  if (typeof value === 'number') return value > 100000000000 ? value : value * 1000;
  const s = String(value).trim();
  if (!s) return null;
  if (/^\d{10,13}$/.test(s)) {
    const n = Number(s);
    return s.length === 10 ? n * 1000 : n;
  }
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}

function dateKey(value) {
  const ts = parseTimeMs(value);
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysBetween(start, end) {
  const a = parseTimeMs(start);
  const b = parseTimeMs(end);
  if (!a || !b || b < a) return null;
  return Math.round(((b - a) / DAY_MS) * 10) / 10;
}

function average(values) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return 0;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10;
}

function firstContainer(item) {
  return item.containerNo || item.container || item.id || '-';
}

function factoryOf(item) {
  const raw = item.factory || item.brand || item.orderNo || '';
  const s = String(raw || '').trim();
  if (!s) return '';
  return s.includes('-') ? s.split('-')[0] : s;
}

function uniqueSorted(values) {
  return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean))).sort();
}

function inPeriod(value, start, end) {
  const ts = parseTimeMs(value);
  return !!ts && ts >= start && ts < end;
}

function comparison(current, previous) {
  let direction = 'flat';
  if (current > previous) direction = 'up';
  if (current < previous) direction = 'down';
  return {
    current,
    previous,
    direction,
    changePct: previous ? Math.round(((current - previous) / previous) * 1000) / 10 : (current ? 100 : 0),
  };
}

function allShipments(flow) {
  const details = flow.details || {};
  const source = details.shipped && details.shipped.length
    ? details.shipped
    : [
      ...(details.overseasTransit || []),
      ...(details.onShore || []),
      ...(details.domesticTransit || []),
      ...(details.signed || []),
    ];
  const seen = new Set();
  return source.filter(item => {
    const key = `${firstContainer(item)}|${item.orderNo || ''}|${item.shipDate || ''}|${item.status || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalizeOrderFacts(flow) {
  return (flow.orders || []).filter(order => num(order.boxes) > 0 || order.orderNo);
}

function normalizeFilters(filters = {}) {
  return {
    country: String(filters.country || '').trim(),
    factory: String(filters.factory || '').trim(),
    container: String(filters.container || '').trim().toUpperCase(),
  };
}

function matchesFilters(item, filters) {
  if (filters.country && String(item.country || '') !== filters.country) return false;
  if (filters.factory && factoryOf(item) !== filters.factory) return false;
  if (filters.container && !String(firstContainer(item)).toUpperCase().includes(filters.container)) return false;
  return true;
}

function groupOrders(orderFacts, shipments, filters) {
  const shipmentOrderNos = new Set(shipments.map(s => s.orderNo).filter(Boolean));
  const filtered = orderFacts.filter(order => {
    if (filters.container && !shipmentOrderNos.has(order.orderNo)) return false;
    return matchesFilters(order, filters);
  });
  const map = new Map();
  filtered.forEach(order => {
    const key = order.orderNo || '-';
    if (!map.has(key)) {
      map.set(key, {
        orderNo: key,
        country: order.country || '-',
        factory: factoryOf(order),
        freshBoxes: 0,
        frozenBoxes: 0,
        totalBoxes: 0,
      });
    }
    const row = map.get(key);
    if (order.category === 'FROZEN') row.frozenBoxes += num(order.boxes);
    else row.freshBoxes += num(order.boxes);
    row.totalBoxes += num(order.boxes);
  });
  return Array.from(map.values()).sort((a, b) => b.totalBoxes - a.totalBoxes);
}

function normalizeShipment(item) {
  return {
    orderNo: item.orderNo || '-',
    containerNo: firstContainer(item),
    country: item.country || '-',
    factory: factoryOf(item),
    brand: item.brand || factoryOf(item) || '-',
    category: item.category === 'FROZEN' ? '冻果' : item.category === 'FRESH' ? '鲜果' : (item.categoryText || '-'),
    status: item.status || '-',
    statusText: STATUS_TEXT[item.status] || item.statusText || item.status || '-',
    shipDate: item.shipDateText || dateKey(item.shipDate),
    arrivalDate: item.arrivalDateText || dateKey(item.arrivalDate),
    domesticShipDate: item.domesticShipDateText || dateKey(item.domesticShipDate),
    signedDate: item.signedDateText || dateKey(item.signedDate),
    dwellDays: num(item.dwellDays),
  };
}

function normalizeTemperature(item) {
  const rawStatus = item.status || 'OK';
  const deviation = Math.round(Math.abs(num(item.returnTemp) - num(item.setTemp)) * 10) / 10;
  const status = rawStatus === 'ALARM' ? rawStatus : (deviation > TEMP_WARNING_DEVIATION ? 'WARN' : rawStatus);
  return {
    containerNo: firstContainer(item),
    brand: item.brand || '-',
    setTemp: num(item.setTemp),
    returnTemp: num(item.returnTemp),
    deviation,
    status,
    statusText: TEMP_STATUS_TEXT[status] || status,
    recordedAt: item.recordedAtText || item.timeText || item.dateText || dateKey(item.recordedAt || item.time || item.date),
    note: item.note || '',
  };
}

function normalizeRiskDetail(risk) {
  const raw = risk.raw || {};
  return {
    type: risk.type || '-',
    containerNo: risk.containerNo || firstContainer(raw),
    orderNo: raw.orderNo || '-',
    country: raw.country || '-',
    factory: raw.factory || factoryOf(raw),
    statusText: raw.statusText || STATUS_TEXT[raw.status] || TEMP_STATUS_TEXT[raw.status] || raw.status || '-',
    summary: risk.summary || '',
    days: num(risk.days),
    severity: risk.severity || '-',
    severityText: SEVERITY_TEXT[risk.severity] || risk.severity || '-',
  };
}

function statusRows(shipments, status) {
  if (status === 'arrived') return shipments.filter(s => ['onShore', 'domesticTransit', 'signed'].includes(s.status));
  return shipments.filter(s => s.status === status);
}

function normalizeBreakdown(items, limit = 5) {
  return (items || [])
    .map(item => ({
      key: item.key || item.label || '-',
      label: item.label || item.key || '-',
      value: num(item.shipped || item.count || item.value || item.boxes),
      rate: num(item.rate || item.totalRate || item.parentRate),
    }))
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildBreakdownFromShipments(shipments, keyFn, labelFn, limit) {
  const map = new Map();
  shipments.forEach(item => {
    const key = keyFn(item) || '-';
    if (!map.has(key)) map.set(key, { key, label: labelFn(key), value: 0 });
    map.get(key).value += 1;
  });
  const total = shipments.length;
  return Array.from(map.values())
    .map(item => ({ ...item, rate: pct(item.value, total) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

function buildCycleTimes(shipments) {
  const signed = shipments.filter(s => s.status === 'signed');
  return {
    avgOverseasDays: average(signed.map(s => daysBetween(s.shipDate, s.arrivalDate))),
    avgOnShoreDays: average(signed.map(s => daysBetween(s.arrivalDate, s.domesticShipDate || s.signedDate))),
    avgDomesticTransitDays: average(signed.map(s => daysBetween(s.domesticShipDate, s.signedDate))),
    currentOverseasAvgDwell: average(shipments.filter(s => s.status === 'overseasTransit').map(s => num(s.dwellDays))),
    currentOnShoreAvgDwell: average(shipments.filter(s => s.status === 'onShore').map(s => num(s.dwellDays))),
    currentDomesticAvgDwell: average(shipments.filter(s => s.status === 'domesticTransit').map(s => num(s.dwellDays))),
  };
}

function buildBottlenecks(shipments) {
  const shippedTotal = shipments.length;
  const specs = [
    { key: 'domesticTransit', label: '国内在途', hint: '国内发货后未签收' },
    { key: 'overseasTransit', label: '国外在途', hint: '已发货未到岸' },
    { key: 'onShore', label: '在岸待叫车', hint: '已到岸未国内发货' },
  ];
  return specs
    .map(spec => {
      const items = shipments.filter(item => item.status === spec.key);
      const sorted = items.slice().sort((a, b) => num(b.dwellDays) - num(a.dwellDays));
      const longest = sorted[0] || {};
      return {
        key: spec.key,
        label: spec.label,
        hint: spec.hint,
        count: items.length,
        progressRate: pct(items.length, shippedTotal),
        progressBasis: '占已发货柜比例',
        avgDays: average(items.map(item => num(item.dwellDays))),
        longestDays: num(longest.dwellDays),
        longestContainer: firstContainer(longest),
      };
    })
    .sort((a, b) => (b.longestDays - a.longestDays) || (b.count - a.count));
}

function buildTemperature(logistics) {
  const containers = logistics.inTransitContainers || [];
  const withDeviation = containers
    .map(normalizeTemperature)
    .filter(item => item.returnTemp || item.setTemp)
    .sort((a, b) => b.deviation - a.deviation);
  const alarmCount = num((logistics.kpis && logistics.kpis.tempAlarms) || withDeviation.filter(item => item.status === 'ALARM').length);
  const topAlerts = withDeviation.filter(item => item.status !== 'OK').slice(0, 8);
  return {
    recordCount: num(logistics.kpis && logistics.kpis.tempRecords),
    alarmCount,
    warningCount: withDeviation.filter(item => item.status === 'WARN').length,
    alarmRate: pct(alarmCount, num(logistics.kpis && logistics.kpis.tempRecords)),
    avgReturnTemp: num(logistics.kpis && logistics.kpis.avgReturnTemp),
    maxDeviation: withDeviation[0] ? withDeviation[0].deviation : 0,
    details: withDeviation,
    topAlerts,
    gantt: buildTemperatureGantt(topAlerts.length ? topAlerts : withDeviation),
  };
}

function buildTemperatureGantt(rows) {
  const days = [];
  for (let i = 6; i >= 0; i -= 1) {
    const d = new Date(Date.now() - i * DAY_MS);
    const key = dateKey(d);
    days.push({ key, label: `${d.getMonth() + 1}/${d.getDate()}` });
  }
  return {
    days,
    rows: rows.slice(0, 8).map(item => ({
      containerNo: item.containerNo,
      brand: item.brand,
      cells: days.map((day, idx) => ({
        date: day.key,
        level: idx === days.length - 1 ? (item.status === 'ALARM' ? 'alarm' : item.status === 'WARN' ? 'warn' : 'ok') : 'none',
        returnTemp: idx === days.length - 1 ? item.returnTemp : null,
        setTemp: idx === days.length - 1 ? item.setTemp : null,
        deviation: idx === days.length - 1 ? item.deviation : null,
      })),
    })),
  };
}

function buildRisks(flowAlerts, temperature, aggregate) {
  const risks = (flowAlerts || []).map(item => {
    const raw = normalizeShipment(item);
    return {
      type: item.alertType || '物流风险',
      containerNo: firstContainer(item),
      days: num(item.dwellDays),
      statusText: raw.statusText,
      summary: item.summary || item.hint || raw.statusText || '',
      severity: num(item.dwellDays) >= 7 ? 'high' : 'medium',
      raw,
    };
  });
  temperature.topAlerts.forEach(item => {
    risks.push({
      type: item.status === 'ALARM' ? '温度异常' : '温度预警',
      containerNo: item.containerNo,
      days: 0,
      statusText: item.statusText,
      summary: `回风温度偏离目标 ${item.deviation}°C`,
      severity: item.status === 'ALARM' ? 'high' : 'medium',
      raw: item,
    });
  });
  const portDelayed = num(aggregate.logistics && aggregate.logistics.kpis && aggregate.logistics.kpis.portDelayed);
  if (portDelayed > 0) {
    risks.unshift({
      type: '关口滞留',
      containerNo: '-',
      days: portDelayed,
      statusText: '关口滞留',
      summary: `${portDelayed} 个柜/批次需要关注`,
      severity: 'high',
      raw: { portDelayed },
    });
  }
  return risks.sort((a, b) => {
    const rank = { high: 2, medium: 1, low: 0 };
    return (rank[b.severity] - rank[a.severity]) || (b.days - a.days);
  });
}

function buildComparisons(shipments) {
  const now = Date.now();
  const currentStart = now - 7 * DAY_MS;
  const previousStart = now - 14 * DAY_MS;
  const countBy = field => ({
    current: shipments.filter(s => inPeriod(s[field], currentStart, now)).length,
    previous: shipments.filter(s => inPeriod(s[field], previousStart, currentStart)).length,
  });
  const shipped = countBy('shipDate');
  const arrived = countBy('arrivalDate');
  const signed = countBy('signedDate');
  const avgTransit = (start, end) => average(shipments
    .filter(s => inPeriod(s.signedDate, start, end))
    .map(s => daysBetween(s.shipDate, s.signedDate)));
  return {
    shipped7d: comparison(shipped.current, shipped.previous),
    arrived7d: comparison(arrived.current, arrived.previous),
    signed7d: comparison(signed.current, signed.previous),
    avgTransitDays7d: comparison(avgTransit(currentStart, now), avgTransit(previousStart, currentStart)),
  };
}

function buildDrilldowns({ orderRows, shipments, bottlenecks, risks, temperature, structure }) {
  const normalizedShipments = shipments.map(normalizeShipment);
  const byStatus = status => statusRows(shipments, status).map(normalizeShipment);
  const riskRows = risks.map(normalizeRiskDetail);
  return {
    orders: { title: '订单明细', columns: ['orderNo', 'country', 'factory', 'freshBoxes', 'frozenBoxes', 'totalBoxes'], rows: orderRows },
    boxes: { title: '下单柜量明细', columns: ['orderNo', 'country', 'factory', 'freshBoxes', 'frozenBoxes', 'totalBoxes'], rows: orderRows },
    shipped: { title: '已发货柜明细', columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'shipDate', 'statusText', 'dwellDays'], rows: normalizedShipments },
    arrived: { title: '已到岸柜明细', columns: ['containerNo', 'orderNo', 'country', 'factory', 'arrivalDate', 'statusText', 'dwellDays'], rows: byStatus('arrived') },
    signed: { title: '已签收柜明细', columns: ['containerNo', 'orderNo', 'country', 'factory', 'signedDate'], rows: byStatus('signed') },
    bottlenecks: Object.fromEntries(bottlenecks.map(item => [item.key, {
      title: `${item.label}明细`,
      columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'statusText', 'dwellDays'],
      rows: byStatus(item.key),
    }])),
    risks: { title: '全部风险待办', columns: ['type', 'containerNo', 'orderNo', 'country', 'factory', 'statusText', 'summary', 'days', 'severityText'], rows: riskRows },
    riskItems: Object.fromEntries(risks.map((risk, index) => [String(index), {
      title: `${risk.containerNo || '-'} 风险明细`,
      columns: ['type', 'containerNo', 'orderNo', 'country', 'factory', 'statusText', 'summary', 'days', 'severityText'],
      rows: [normalizeRiskDetail(risk)],
    }])),
    temperatureAlerts: { title: '温度异常明细', columns: ['containerNo', 'brand', 'setTemp', 'returnTemp', 'deviation', 'statusText', 'recordedAt', 'note'], rows: temperature.topAlerts },
    temperatureDetails: { title: '温度明细', columns: ['containerNo', 'brand', 'setTemp', 'returnTemp', 'deviation', 'statusText', 'recordedAt', 'note'], rows: temperature.details || [] },
    temperatureByContainer: Object.fromEntries((temperature.details || []).map(row => [row.containerNo, {
      title: `${row.containerNo} 温度明细`,
      columns: ['containerNo', 'brand', 'setTemp', 'returnTemp', 'deviation', 'statusText', 'recordedAt', 'note'],
      rows: (temperature.details || []).filter(item => item.containerNo === row.containerNo),
    }])),
    byCountry: Object.fromEntries((structure.country || []).map(item => [item.label, {
      title: `${item.label}明细`,
      columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'statusText', 'dwellDays'],
      rows: normalizedShipments.filter(row => row.country === item.label),
    }])),
    byCategory: Object.fromEntries((structure.category || []).map(item => [item.key, {
      title: `${item.label}明细`,
      columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'statusText', 'dwellDays'],
      rows: normalizedShipments.filter(row => row.category === item.label),
    }])),
    byFactory: Object.fromEntries(uniqueSorted(shipments.map(factoryOf)).map(factory => [factory, {
      title: `${factory} 明细`,
      columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'statusText', 'dwellDays'],
      rows: normalizedShipments.filter(row => row.factory === factory),
    }])),
    byContainer: Object.fromEntries(normalizedShipments.map(row => [row.containerNo, {
      title: `${row.containerNo} 单柜详情`,
      columns: ['containerNo', 'orderNo', 'country', 'factory', 'category', 'shipDate', 'arrivalDate', 'domesticShipDate', 'signedDate', 'statusText', 'dwellDays'],
      rows: [row],
    }])),
  };
}

function buildExecutiveOverview({ aggregate = {}, flow = {}, filters = {} }) {
  const activeFilters = normalizeFilters(filters);
  const orderFacts = normalizeOrderFacts(flow);
  const all = allShipments(flow);
  const filteredShipments = all.filter(item => matchesFilters(item, activeFilters));
  const orderRows = groupOrders(orderFacts, filteredShipments, activeFilters);
  const totalBoxes = orderRows.length ? orderRows.reduce((sum, row) => sum + row.totalBoxes, 0) : num((flow.kpis || {}).total || (aggregate.global || {}).totalBoxes);
  const shipped = filteredShipments.length || num((flow.kpis || {}).shipped);
  const arrived = statusRows(filteredShipments, 'arrived').length;
  const signed = statusRows(filteredShipments, 'signed').length;
  const temperature = buildTemperature(aggregate.logistics || {});
  const filteredFlowAlerts = (flow.alerts || []).filter(item => matchesFilters(item, activeFilters));
  const risks = buildRisks(filteredFlowAlerts, temperature, aggregate);
  const bottlenecks = buildBottlenecks(filteredShipments);
  const structure = {
    country: buildBreakdownFromShipments(filteredShipments, s => s.country || '未填国家', key => key, 4),
    category: buildBreakdownFromShipments(filteredShipments, s => s.category || 'UNKNOWN', key => ({ FRESH: '鲜果', FROZEN: '冻果', UNKNOWN: '未填品类' }[key] || key), 4),
    brandTop: buildBreakdownFromShipments(filteredShipments, s => s.brand || factoryOf(s) || '未填品牌', key => key, 5),
  };
  const highRiskCount = risks.filter(r => r.severity === 'high').length;
  const mediumRiskCount = risks.filter(r => r.severity === 'medium').length;
  const healthScore = Math.max(
    HEALTH_RULE.minScore,
    HEALTH_RULE.baseScore - highRiskCount * HEALTH_RULE.highRiskDeduction - mediumRiskCount * HEALTH_RULE.mediumRiskDeduction
  );

  return {
    generatedAt: new Date().toISOString(),
    activeFilters,
    filters: {
      countries: uniqueSorted([...orderFacts.map(o => o.country), ...all.map(s => s.country)]),
      factories: uniqueSorted([...orderFacts.map(factoryOf), ...all.map(factoryOf)]),
      containers: uniqueSorted(all.map(firstContainer)),
    },
    headline: {
      totalOrders: orderRows.length || num((aggregate.global || {}).totalOrders),
      totalBoxes,
      shipped,
      signed,
      totalRisks: risks.length,
      healthScore,
      healthRule: HEALTH_RULE,
      descriptions: {
        totalOrders: '当前业务订单数量',
        totalBoxes: '客户已下单的总柜量',
        shipped: '已经装柜发出的柜量',
        signed: '终端已完成签收的柜量',
        healthScore: '风险越少、履约越顺，分数越高',
      },
    },
    comparisons: buildComparisons(filteredShipments),
    efficiency: {
      funnel: [
        { key: 'ordered', label: '下单柜数', value: totalBoxes, rate: 100, hint: '客户已下单总柜量', drilldown: 'boxes' },
        { key: 'shipped', label: '已发货', value: shipped, rate: pct(shipped, totalBoxes), hint: '已经装柜发出', drilldown: 'shipped' },
        { key: 'arrived', label: '已到岸', value: arrived, rate: pct(arrived, totalBoxes), hint: '已抵达口岸/目的港', drilldown: 'arrived' },
        { key: 'signed', label: '已签收', value: signed, rate: pct(signed, totalBoxes), hint: '终端完成签收', drilldown: 'signed' },
      ],
      cycleTimes: buildCycleTimes(filteredShipments),
    },
    bottlenecks,
    risks,
    structure,
    temperature,
    news: {
      fetchedAt: aggregate.news && aggregate.news.fetchedAt,
      items: (aggregate.news && aggregate.news.auto) || [],
    },
    health: {
      score: healthScore,
      highRiskCount,
      mediumRiskCount,
      rule: HEALTH_RULE,
    },
    drilldowns: buildDrilldowns({ orderRows, shipments: filteredShipments, bottlenecks, risks, temperature, structure }),
  };
}

module.exports = { buildExecutiveOverview };
