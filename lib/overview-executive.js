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

function daysBetween(start, end) {
  const a = parseTimeMs(start);
  const b = parseTimeMs(end);
  if (!a || !b || b < a) return null;
  return Math.round(((b - a) / 86400000) * 10) / 10;
}

function average(values) {
  const nums = values.filter(v => Number.isFinite(v));
  if (!nums.length) return 0;
  return Math.round((nums.reduce((sum, n) => sum + n, 0) / nums.length) * 10) / 10;
}

function firstContainer(item) {
  return item.containerNo || item.container || item.id || '-';
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

function buildCycleTimes(details) {
  const signed = details.signed || [];
  return {
    avgOverseasDays: average(signed.map(s => daysBetween(s.shipDate, s.arrivalDate))),
    avgOnShoreDays: average(signed.map(s => daysBetween(s.arrivalDate, s.domesticShipDate || s.signedDate))),
    avgDomesticTransitDays: average(signed.map(s => daysBetween(s.domesticShipDate, s.signedDate))),
    currentOverseasAvgDwell: average((details.overseasTransit || []).map(s => num(s.dwellDays))),
    currentOnShoreAvgDwell: average((details.onShore || []).map(s => num(s.dwellDays))),
    currentDomesticAvgDwell: average((details.domesticTransit || []).map(s => num(s.dwellDays))),
  };
}

function buildBottlenecks(flow) {
  const details = flow.details || {};
  const specs = [
    { key: 'overseasTransit', label: '国外在途', hint: '已发货未到岸', items: details.overseasTransit || [] },
    { key: 'onShore', label: '在岸待叫车', hint: '已到岸未国内发货', items: details.onShore || [] },
    { key: 'domesticTransit', label: '国内在途', hint: '国内发货后未签收', items: details.domesticTransit || [] },
  ];
  return specs
    .map(spec => {
      const sorted = spec.items.slice().sort((a, b) => num(b.dwellDays) - num(a.dwellDays));
      const longest = sorted[0] || {};
      return {
        key: spec.key,
        label: spec.label,
        hint: spec.hint,
        count: spec.items.length,
        avgDays: average(spec.items.map(item => num(item.dwellDays))),
        longestDays: num(longest.dwellDays),
        longestContainer: firstContainer(longest),
      };
    })
    .sort((a, b) => (b.longestDays - a.longestDays) || (b.count - a.count));
}

function buildTemperature(logistics) {
  const containers = logistics.inTransitContainers || [];
  const alarmContainers = containers.filter(item => item.status === 'ALARM');
  const warningContainers = containers.filter(item => item.status === 'WARN');
  const withDeviation = containers
    .map(item => ({
      containerNo: firstContainer(item),
      brand: item.brand || '-',
      setTemp: num(item.setTemp),
      returnTemp: num(item.returnTemp),
      deviation: Math.round(Math.abs(num(item.returnTemp) - num(item.setTemp)) * 10) / 10,
      status: item.status || 'OK',
      note: item.note || '',
    }))
    .filter(item => item.returnTemp || item.setTemp)
    .sort((a, b) => b.deviation - a.deviation);
  return {
    recordCount: num(logistics.kpis && logistics.kpis.tempRecords),
    alarmCount: num((logistics.kpis && logistics.kpis.tempAlarms) || alarmContainers.length),
    warningCount: warningContainers.length,
    alarmRate: pct(num((logistics.kpis && logistics.kpis.tempAlarms) || alarmContainers.length), num(logistics.kpis && logistics.kpis.tempRecords)),
    avgReturnTemp: num(logistics.kpis && logistics.kpis.avgReturnTemp),
    maxDeviation: withDeviation[0] ? withDeviation[0].deviation : 0,
    topAlerts: withDeviation.filter(item => item.status !== 'OK').slice(0, 5),
  };
}

function buildRisks(flow, temperature, aggregate) {
  const flowAlerts = (flow.alerts || []).map(item => ({
    type: item.alertType || '物流风险',
    containerNo: firstContainer(item),
    days: num(item.dwellDays),
    summary: item.summary || item.hint || item.status || '',
    severity: num(item.dwellDays) >= 7 ? 'high' : 'medium',
  }));
  const tempAlerts = (temperature.topAlerts || []).map(item => ({
    type: item.status === 'ALARM' ? '温度异常' : '温度预警',
    containerNo: item.containerNo,
    days: 0,
    summary: `设定 ${item.setTemp}°C / 回风 ${item.returnTemp}°C / 偏差 ${item.deviation}°C`,
    severity: item.status === 'ALARM' ? 'high' : 'medium',
  }));
  const portDelayed = num(aggregate.logistics && aggregate.logistics.kpis && aggregate.logistics.kpis.portDelayed);
  const portAlert = portDelayed > 0 ? [{
    type: '关口滞留',
    containerNo: '-',
    days: portDelayed,
    summary: `${portDelayed} 个柜/批次需要关注`,
    severity: 'high',
  }] : [];
  return [...portAlert, ...flowAlerts, ...tempAlerts]
    .sort((a, b) => {
      const rank = { high: 2, medium: 1, low: 0 };
      return (rank[b.severity] - rank[a.severity]) || (b.days - a.days);
    });
}

function buildExecutiveOverview({ aggregate = {}, flow = {} }) {
  const global = aggregate.global || {};
  const logistics = aggregate.logistics || {};
  const kpis = flow.kpis || {};
  const totalBoxes = num(kpis.total || global.totalBoxes);
  const shipped = num(kpis.shipped || (totalBoxes - num(global.totalPending)));
  const arrived = num(kpis.arrived || global.totalArrived);
  const signed = num(kpis.signed || global.totalDone);
  const temperature = buildTemperature(logistics);
  const risks = buildRisks(flow, temperature, aggregate);

  return {
    generatedAt: new Date().toISOString(),
    headline: {
      totalOrders: num(global.totalOrders),
      totalBoxes,
      shipped,
      signed,
      totalRisks: risks.length,
      healthScore: Math.max(0, 100 - risks.filter(r => r.severity === 'high').length * 12 - risks.filter(r => r.severity === 'medium').length * 5),
    },
    efficiency: {
      funnel: [
        { key: 'ordered', label: '下单柜数', value: totalBoxes, rate: 100, hint: '订单主表鲜果+冻果柜数' },
        { key: 'shipped', label: '已发货', value: shipped, rate: pct(shipped, totalBoxes), hint: '分柜明细有柜号' },
        { key: 'arrived', label: '已到岸', value: arrived, rate: pct(arrived, totalBoxes), hint: '到岸时间非空' },
        { key: 'signed', label: '已签收', value: signed, rate: pct(signed, totalBoxes), hint: '签收日期非空' },
      ],
      cycleTimes: buildCycleTimes(flow.details || {}),
    },
    bottlenecks: buildBottlenecks(flow),
    risks,
    structure: {
      country: normalizeBreakdown(flow.breakdowns && flow.breakdowns.country, 4),
      category: normalizeBreakdown(flow.breakdowns && flow.breakdowns.category, 4),
      brandTop: normalizeBreakdown(flow.breakdowns && flow.breakdowns.brand, 5),
    },
    temperature,
    news: {
      fetchedAt: aggregate.news && aggregate.news.fetchedAt,
      items: ((aggregate.news && aggregate.news.auto) || []).slice(0, 3),
    },
    health: {
      score: Math.max(0, 100 - risks.filter(r => r.severity === 'high').length * 12 - risks.filter(r => r.severity === 'medium').length * 5),
      highRiskCount: risks.filter(r => r.severity === 'high').length,
      mediumRiskCount: risks.filter(r => r.severity === 'medium').length,
    },
  };
}

module.exports = { buildExecutiveOverview };
