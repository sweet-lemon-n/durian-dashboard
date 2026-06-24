const wecom = require('./wecom');
const { getFlowDashboardConfig } = require('./runtime-config');

function findSheet(snapshot, id, title) {
  const sheets = snapshot && snapshot.sheets ? snapshot.sheets : [];
  return sheets.find(s => id && s.sheet_id === id)
    || sheets.find(s => s.title === title)
    || null;
}

function findField(sheet, spec) {
  const fields = sheet && sheet.fields ? sheet.fields : [];
  return fields.find(f => spec.fieldId && f.field_id === spec.fieldId)
    || fields.find(f => f.field_title === spec.title)
    || fields.find(f => String(f.field_title || '').includes(spec.title))
    || null;
}

function valueOf(record, field) {
  return field ? wecom.getRecordValue(record, field.field_title) : null;
}

function textValue(record, field) {
  return String(valueOf(record, field) == null ? '' : valueOf(record, field)).trim();
}

function numberValue(record, field) {
  const raw = valueOf(record, field);
  const n = Number(raw);
  return Number.isFinite(n) ? n : 0;
}

function parseTimeMs(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const n = Number(s);
  if (Number.isFinite(n) && n > 1000000000) return s.length === 10 ? n * 1000 : n;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.getTime();
}

function formatDate(raw) {
  const ts = parseTimeMs(raw);
  if (!ts) return '';
  const d = new Date(ts);
  const p = x => String(x).padStart(2, '0');
  return `${String(d.getFullYear()).slice(2)}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function daysSince(raw) {
  const ts = parseTimeMs(raw);
  if (!ts) return null;
  return Math.max(0, Math.round((Date.now() - ts) / 8640000) / 10);
}

function pct(n, d) {
  return d ? Math.round((n / d) * 1000) / 10 : 0;
}

function makeNode(key, label, count, total, parentCount, hint = '') {
  return {
    key,
    label,
    count,
    totalRate: pct(count, total),
    parentRate: pct(count, parentCount),
    hint,
  };
}

function resolveFields(sheet, configFields, prefix = '') {
  const out = {};
  Object.entries(configFields).forEach(([key, spec]) => {
    if (prefix && !key.startsWith(prefix)) return;
    out[key] = findField(sheet, spec);
  });
  return out;
}

function fieldMeta(field) {
  return field ? { fieldId: field.field_id, title: field.field_title, type: field.field_type } : null;
}

function categorize(raw) {
  const s = String(raw || '');
  if (/鲜/.test(s)) return 'FRESH';
  if (/冻/.test(s)) return 'FROZEN';
  return 'UNKNOWN';
}

function mergeGroupToShipments(group, fields) {
  const nonEmptyDates = Array.from(new Set(group
    .map(r => textValue(r, fields.shipDate))
    .filter(Boolean)));
  const buckets = nonEmptyDates.length ? new Map(nonEmptyDates.map(d => [d, []])) : new Map([['', []]]);
  group.forEach(record => {
    const d = textValue(record, fields.shipDate);
    const key = d && buckets.has(d) ? d : buckets.keys().next().value;
    buckets.get(key).push(record);
  });
  return Array.from(buckets.entries()).map(([shipDate, records]) => reduceShipment(shipDate, records, fields));
}

function latestNonEmpty(records, field) {
  for (let i = records.length - 1; i >= 0; i--) {
    const v = textValue(records[i], field);
    if (v) return v;
  }
  return '';
}

function reduceShipment(shipDate, records, fields) {
  const first = records[0];
  const arrivalDate = latestNonEmpty(records, fields.arrivalDate);
  const domesticShipDate = latestNonEmpty(records, fields.domesticShipDate);
  const signedDate = latestNonEmpty(records, fields.signedDate);
  const orderNo = textValue(first, fields.detailOrderNo);
  const containerNo = textValue(first, fields.containerNo);
  let status = 'overseasTransit';
  if (signedDate) status = 'signed';
  else if (domesticShipDate) status = 'domesticTransit';
  else if (arrivalDate) status = 'onShore';

  return {
    id: `${orderNo}|${containerNo}|${shipDate || 'no-date'}`,
    orderNo,
    containerNo,
    shipDate,
    shipDateText: formatDate(shipDate),
    arrivalDate,
    arrivalDateText: formatDate(arrivalDate),
    domesticShipDate,
    domesticShipDateText: formatDate(domesticShipDate),
    signedDate,
    signedDateText: formatDate(signedDate),
    country: textValue(first, fields.country),
    category: categorize(textValue(first, fields.category)),
    categoryText: textValue(first, fields.category),
    brand: textValue(first, fields.brand),
    status,
    records: records.map(r => r.record_id),
    dwellDays: status === 'overseasTransit'
      ? daysSince(shipDate)
      : status === 'onShore'
        ? daysSince(arrivalDate)
        : status === 'domesticTransit'
          ? daysSince(domesticShipDate)
          : null,
  };
}

function buildShipments(detailRecords, fields) {
  const groups = new Map();
  detailRecords.forEach(record => {
    const orderNo = textValue(record, fields.detailOrderNo);
    const containerNo = textValue(record, fields.containerNo);
    if (!orderNo || !containerNo) return;
    const key = `${orderNo}|${containerNo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return Array.from(groups.values()).flatMap(group => mergeGroupToShipments(group, fields));
}

function buildBreakdown(shipments, total, keyFn, labelFn) {
  const map = new Map();
  shipments.forEach(item => {
    const key = keyFn(item) || 'UNKNOWN';
    if (!map.has(key)) map.set(key, { key, label: labelFn(key, item), shipped: 0, arrived: 0, signed: 0, onShore: 0 });
    const row = map.get(key);
    row.shipped += 1;
    if (['onShore', 'domesticTransit', 'signed'].includes(item.status)) row.arrived += 1;
    if (item.status === 'signed') row.signed += 1;
    if (item.status === 'onShore') row.onShore += 1;
  });
  return Array.from(map.values())
    .map(row => ({ ...row, rate: pct(row.shipped, total) }))
    .sort((a, b) => b.shipped - a.shipped);
}

async function aggregateFlowDashboard(snapshot) {
  if (!snapshot) throw new Error('企微缓存尚未初始化');
  const config = getFlowDashboardConfig();
  const orderSheet = findSheet(snapshot, config.orderSheetId, config.orderSheetTitle);
  const detailSheet = findSheet(snapshot, config.detailSheetId, config.detailSheetTitle);
  if (!orderSheet || !detailSheet) throw new Error('找不到订单主表或分柜明细表，请先在后台配置流向看板字段');

  const orderFields = resolveFields(orderSheet, config.fields);
  const detailFields = resolveFields(detailSheet, config.fields);
  const required = [
    ['订单主表.鲜果柜数', orderFields.freshBoxes],
    ['订单主表.冻果柜数', orderFields.frozenBoxes],
    ['分柜明细表.订单编号', detailFields.detailOrderNo],
    ['分柜明细表.柜号', detailFields.containerNo],
    ['分柜明细表.发货日期', detailFields.shipDate],
    ['分柜明细表.到岸日期', detailFields.arrivalDate],
    ['分柜明细表.国内发货时间', detailFields.domesticShipDate],
    ['分柜明细表.签收日期', detailFields.signedDate],
  ];
  const missing = required.filter(([, field]) => !field).map(([name]) => name);
  if (missing.length) throw new Error(`流向看板字段未配置或字段不存在：${missing.join('、')}`);

  const orders = orderSheet.records || [];
  const details = detailSheet.records || [];
  const total = orders.reduce((sum, record) => sum + numberValue(record, orderFields.freshBoxes) + numberValue(record, orderFields.frozenBoxes), 0);
  const shipments = buildShipments(details, detailFields);
  const statusCounts = shipments.reduce((acc, item) => {
    acc[item.status] = (acc[item.status] || 0) + 1;
    return acc;
  }, {});

  const shipped = shipments.length;
  const overseasTransit = statusCounts.overseasTransit || 0;
  const onShore = statusCounts.onShore || 0;
  const domesticTransit = statusCounts.domesticTransit || 0;
  const signed = statusCounts.signed || 0;
  const domesticTransfer = domesticTransit + signed;
  const arrived = onShore + domesticTransfer;
  const unshipped = Math.max(0, total - shipped);
  const pending = onShore;

  const nodes = {
    total: makeNode('total', '总柜数', total, total, total, '订单主表下单柜数'),
    unshipped: makeNode('unshipped', '未发货', unshipped, total, total, '尚未形成柜号'),
    shipped: makeNode('shipped', '已发货', shipped, total, total, '分柜明细有柜号'),
    overseasTransit: makeNode('overseasTransit', '国外在途', overseasTransit, total, shipped, '已发货未到岸'),
    arrived: makeNode('arrived', '已到岸', arrived, total, shipped, '到岸日期非空'),
    onShore: makeNode('onShore', '在岸', onShore, total, arrived, '已到岸未叫车'),
    domesticTransfer: makeNode('domesticTransfer', '国内短驳', domesticTransfer, total, arrived, '国内发货时间非空'),
    domesticTransit: makeNode('domesticTransit', '国内在途', domesticTransit, total, domesticTransfer, '短驳未签收'),
    signed: makeNode('signed', '已签收', signed, total, domesticTransfer, '签收日期非空'),
  };

  const byStatus = {
    unshipped: [],
    shipped: shipments,
    overseasTransit: shipments.filter(s => s.status === 'overseasTransit'),
    arrived: shipments.filter(s => ['onShore', 'domesticTransit', 'signed'].includes(s.status)),
    onShore: shipments.filter(s => s.status === 'onShore'),
    domesticTransfer: shipments.filter(s => ['domesticTransit', 'signed'].includes(s.status)),
    domesticTransit: shipments.filter(s => s.status === 'domesticTransit'),
    signed: shipments.filter(s => s.status === 'signed'),
  };

  const alertItems = [
    ...byStatus.onShore.filter(s => (s.dwellDays || 0) >= config.thresholds.onShoreDays).map(s => ({ ...s, alertType: '在岸待叫车' })),
    ...byStatus.overseasTransit.filter(s => (s.dwellDays || 0) >= config.thresholds.overseasTransitDays).map(s => ({ ...s, alertType: '国外在途偏久' })),
    ...byStatus.domesticTransit.filter(s => (s.dwellDays || 0) >= config.thresholds.domesticTransitDays).map(s => ({ ...s, alertType: '国内在途偏久' })),
  ].sort((a, b) => (b.dwellDays || 0) - (a.dwellDays || 0)).slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    source: 'wecom',
    cache: { fetchedAt: snapshot.fetchedAt, ageMs: Date.now() - new Date(snapshot.fetchedAt).getTime() },
    config: {
      orderSheet: { sheetId: orderSheet.sheet_id, title: orderSheet.title },
      detailSheet: { sheetId: detailSheet.sheet_id, title: detailSheet.title },
      fields: Object.fromEntries(Object.entries({ ...orderFields, ...detailFields }).map(([key, field]) => [key, fieldMeta(field)])),
      thresholds: config.thresholds,
    },
    nodes,
    links: [
      ['total', 'unshipped'],
      ['total', 'shipped'],
      ['shipped', 'overseasTransit'],
      ['shipped', 'arrived'],
      ['arrived', 'onShore'],
      ['arrived', 'domesticTransfer'],
      ['domesticTransfer', 'domesticTransit'],
      ['domesticTransfer', 'signed'],
    ],
    kpis: {
      total,
      shipped,
      unshipped,
      arrived,
      signed,
      pending,
      shippedRate: pct(shipped, total),
      signedRate: pct(signed, total),
    },
    details: byStatus,
    alerts: alertItems,
    breakdowns: {
      country: buildBreakdown(shipments, total, s => s.country || '未填国家', key => key),
      category: buildBreakdown(shipments, total, s => s.category, key => ({ FRESH: '鲜果', FROZEN: '冻果', UNKNOWN: '未填品类' }[key] || key)),
      brand: buildBreakdown(shipments, total, s => s.brand || '未填品牌', key => key).slice(0, 12),
    },
  };
}

module.exports = { aggregateFlowDashboard };
