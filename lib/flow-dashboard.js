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

function findFieldByTitles(sheet, titles) {
  const fields = sheet && sheet.fields ? sheet.fields : [];
  for (const title of titles) {
    const exact = fields.find(f => f.field_title === title);
    if (exact) return exact;
  }
  for (const title of titles) {
    const partial = fields.find(f => String(f.field_title || '').includes(title));
    if (partial) return partial;
  }
  return null;
}

function valueOf(record, field) {
  return field ? wecom.getRecordValue(record, field.field_title) : null;
}

function rawValueOf(record, field) {
  return field && record && record.values ? record.values[field.field_title] : null;
}

function textValue(record, field) {
  return String(valueOf(record, field) == null ? '' : valueOf(record, field)).trim();
}

function collectRawTokens(value, out = []) {
  if (value == null) return out;
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim();
    if (s) out.push(s);
    return out;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectRawTokens(item, out));
    return out;
  }
  if (typeof value === 'object') {
    ['record_id', 'recordId', 'text', 'title', 'value', 'id'].forEach(key => {
      if (value[key] != null) collectRawTokens(value[key], out);
    });
    Object.keys(value).forEach(key => {
      if (!['record_id', 'recordId', 'text', 'title', 'value', 'id'].includes(key)) {
        collectRawTokens(value[key], out);
      }
    });
  }
  return out;
}

function uniqueStrings(values) {
  return Array.from(new Set(values.map(v => String(v || '').trim()).filter(Boolean)));
}

function linkedRecordIds(record, field) {
  const raw = rawValueOf(record, field);
  const ids = [];
  const walk = value => {
    if (!value) return;
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === 'object') {
      const id = value.record_id || value.recordId;
      if (id) ids.push(String(id));
      Object.keys(value).forEach(key => walk(value[key]));
    }
  };
  walk(raw);
  return uniqueStrings(ids);
}

function fieldTokens(record, field) {
  return uniqueStrings([
    ...linkedRecordIds(record, field),
    ...collectRawTokens(rawValueOf(record, field)),
    textValue(record, field),
  ]);
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

function mergeGroupToShipments(group, fields, context = {}) {
  const nonEmptyDates = Array.from(new Set(group
    .map(r => textValue(r, fields.shipDate))
    .filter(Boolean)));
  const buckets = nonEmptyDates.length ? new Map(nonEmptyDates.map(d => [d, []])) : new Map([['', []]]);
  group.forEach(record => {
    const d = textValue(record, fields.shipDate);
    const key = d && buckets.has(d) ? d : buckets.keys().next().value;
    buckets.get(key).push(record);
  });
  return Array.from(buckets.entries()).map(([shipDate, records]) => reduceShipment(shipDate, records, fields, context));
}

function latestNonEmpty(records, field) {
  for (let i = records.length - 1; i >= 0; i--) {
    const v = textValue(records[i], field);
    if (v) return v;
  }
  return '';
}

function buildOrderContext(orderRecords, orderFields) {
  const orderNoByRecordId = new Map();
  const orderNoByToken = new Map();
  const countryByOrderNo = new Map();
  const countryByRecordId = new Map();

  orderRecords.forEach(record => {
    const orderNo = textValue(record, orderFields.orderNo);
    const country = textValue(record, orderFields.country);
    if (!orderNo) return;
    const recordId = record.record_id ? String(record.record_id) : '';
    if (recordId) {
      orderNoByRecordId.set(recordId, orderNo);
      orderNoByToken.set(recordId, orderNo);
      if (country) countryByRecordId.set(recordId, country);
    }
    orderNoByToken.set(orderNo, orderNo);
    fieldTokens(record, orderFields.orderNo).forEach(token => orderNoByToken.set(token, orderNo));
    if (country) countryByOrderNo.set(orderNo, country);
  });

  return { orderNoByRecordId, orderNoByToken, countryByOrderNo, countryByRecordId };
}

function resolveOrder(record, field, context = {}) {
  const tokens = fieldTokens(record, field);
  for (const token of tokens) {
    const mapped = context.orderNoByRecordId && context.orderNoByRecordId.get(token);
    if (mapped) {
      return { orderNo: mapped, orderRecordId: token, raw: tokens };
    }
  }
  for (const token of tokens) {
    const mapped = context.orderNoByToken && context.orderNoByToken.get(token);
    if (mapped) {
      const orderRecordId = context.orderNoByRecordId && context.orderNoByRecordId.has(token) ? token : '';
      return { orderNo: mapped, orderRecordId, raw: tokens };
    }
  }
  return { orderNo: textValue(record, field), orderRecordId: '', raw: tokens };
}

function reduceShipment(shipDate, records, fields, context = {}) {
  const first = records[0];
  const arrivalDate = latestNonEmpty(records, fields.arrivalDate);
  const domesticShipDate = latestNonEmpty(records, fields.domesticShipDate);
  const signedDate = latestNonEmpty(records, fields.signedDate);
  const orderRef = resolveOrder(first, fields.detailOrderNo, context);
  const orderNo = orderRef.orderNo;
  const containerNo = textValue(first, fields.containerNo);
  const port = latestNonEmpty(records, fields.port);
  let status = 'overseasTransit';
  if (signedDate) status = 'signed';
  else if (domesticShipDate) status = 'domesticTransit';
  else if (arrivalDate) status = 'onShore';

  return {
    id: `${orderNo}|${containerNo}|${shipDate || 'no-date'}`,
    orderNo,
    orderRecordId: orderRef.orderRecordId,
    orderRawTokens: orderRef.raw,
    containerNo,
    shipDate,
    shipDateText: formatDate(shipDate),
    arrivalDate,
    arrivalDateText: formatDate(arrivalDate),
    domesticShipDate,
    domesticShipDateText: formatDate(domesticShipDate),
    signedDate,
    signedDateText: formatDate(signedDate),
    country: textValue(first, fields.country)
      || (orderRef.orderRecordId && context.countryByRecordId && context.countryByRecordId.get(orderRef.orderRecordId))
      || (context.countryByOrderNo && context.countryByOrderNo.get(orderNo))
      || '',
    category: categorize(textValue(first, fields.category)),
    categoryText: textValue(first, fields.category),
    brand: textValue(first, fields.brand),
    customsPort: port,
    port,
    arrivalPort: port,
    destination: latestNonEmpty(records, fields.destination),
    arrivalLocation: latestNonEmpty(records, fields.arrivalLocation),
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

function buildShipments(detailRecords, fields, context = {}) {
  const groups = new Map();
  detailRecords.forEach(record => {
    const orderRef = resolveOrder(record, fields.detailOrderNo, context);
    const orderNo = orderRef.orderNo;
    const containerNo = textValue(record, fields.containerNo);
    if (!orderNo || !containerNo) return;
    const key = `${orderNo}|${containerNo}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  });
  return Array.from(groups.values()).flatMap(group => mergeGroupToShipments(group, fields, context));
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

function buildFlowFacts(orderRecords, detailRecords, orderFields, detailFields) {
  const orderFacts = [];
  const context = buildOrderContext(orderRecords, orderFields);
  orderRecords.forEach(record => {
    const orderNo = textValue(record, orderFields.orderNo);
    const freshBoxes = numberValue(record, orderFields.freshBoxes);
    const frozenBoxes = numberValue(record, orderFields.frozenBoxes);
    const country = textValue(record, orderFields.country);
    orderFacts.push({ orderNo, category: 'FRESH', boxes: freshBoxes, country });
    orderFacts.push({ orderNo, category: 'FROZEN', boxes: frozenBoxes, country });
  });
  const shipments = buildShipments(detailRecords, detailFields, context);
  shipments.forEach(item => {
    if (!item.country && context.countryByOrderNo.has(item.orderNo)) item.country = context.countryByOrderNo.get(item.orderNo);
  });
  return { orderFacts, shipments };
}

async function aggregateFlowDashboard(snapshot) {
  if (!snapshot) throw new Error('企微缓存尚未初始化');
  const config = getFlowDashboardConfig();
  const orderSheet = findSheet(snapshot, config.orderSheetId, config.orderSheetTitle);
  const detailSheet = findSheet(snapshot, config.detailSheetId, config.detailSheetTitle);
  if (!orderSheet || !detailSheet) throw new Error('找不到订单主表或分柜明细表，请先在后台配置流向看板字段');

  const orderFields = resolveFields(orderSheet, config.fields);
  const detailFields = resolveFields(detailSheet, config.fields);
  detailFields.port = detailFields.port || findFieldByTitles(detailSheet, ['口岸', '关口', '到岸口岸', '到达口岸', '目的口岸', '目的港']);
  detailFields.destination = detailFields.destination || findFieldByTitles(detailSheet, ['目的地', '目的站', '到达地']);
  detailFields.arrivalLocation = detailFields.arrivalLocation || findFieldByTitles(detailSheet, ['到岸位置', '到达位置', '位置']);
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
  const { orderFacts, shipments } = buildFlowFacts(orders, details, orderFields, detailFields);
  const total = orderFacts.reduce((sum, item) => sum + item.boxes, 0);
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
    orders: orderFacts,
    details: byStatus,
    alerts: alertItems,
    breakdowns: {
      country: buildBreakdown(shipments, total, s => s.country || '未填国家', key => key),
      category: buildBreakdown(shipments, total, s => s.category, key => ({ FRESH: '鲜果', FROZEN: '冻果', UNKNOWN: '未填品类' }[key] || key)),
      brand: buildBreakdown(shipments, total, s => s.brand || '未填品牌', key => key).slice(0, 12),
    },
  };
}

module.exports = { aggregateFlowDashboard, buildFlowFacts, pct };
