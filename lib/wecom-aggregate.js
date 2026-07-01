/**
 * 企微数据源聚合器：从订单主表/分柜明细表/陆运明细/温度记录读真实数据，
 * 转成与 board-routes.aggregate() 同形的 /api/aggregate 响应。
 *
 * 关键映射规则（来自用户业务定义）：
 *   - 行 = 国家 × 工厂简称(订单编号前缀 KK/YL/CT/PT…) × 品类(FRESH/FROZEN)
 *     一条订单的"鲜果(柜数)"和"冻果(柜数)"两列拆成两行
 *   - boxes  = 该订单该品类的柜数（订单主表）
 *   - signed = 分柜明细 COUNT(签收日期非空)
 *   - delivered = 分柜明细 COUNT(到岸时间非空)
 *   - transit = 分柜明细 COUNT(发货日期非空 AND 到岸时间空)
 *   - pending = boxes − 该(订单,品类)在分柜明细中出现的柜数
 *   - port = 0（企微数据没有"在口岸"维度）
 *
 *   - rate = delivered/boxes
 *
 * 印尼订单暂不展示（COUNTRY_MAP 不映射）；news 始终走 board-content fallback。
 */
const wecom = require('./wecom');
const { read } = require('./content-store');
const { buildFlowFacts } = require('./flow-dashboard');
const { getFlowDashboardConfig } = require('./runtime-config');

const COUNTRY_MAP = { '泰国': 'TH', '越南': 'VN' /* '印尼': 'ID'  暂不显示 */ };
const FACTORY_REGEX = /^([A-Z]+)-/;

function extractFactory(orderNo) {
  if (!orderNo) return '其他';
  const m = String(orderNo).match(FACTORY_REGEX);
  return m ? m[1] : '其他';
}

function categoryOf(rawCat) {
  const s = String(rawCat || '');
  if (/鲜/.test(s)) return 'FRESH';
  if (/冻/.test(s)) return 'FROZEN';
  return null;
}

function findField(sheet, title) {
  const fields = sheet && sheet.fields ? sheet.fields : [];
  return fields.find(f => f.field_title === title)
    || fields.find(f => String(f.field_title || '').includes(title))
    || null;
}

function findConfiguredField(sheet, spec, fallbackTitle) {
  const fields = sheet && sheet.fields ? sheet.fields : [];
  return fields.find(f => spec && spec.fieldId && f.field_id === spec.fieldId)
    || fields.find(f => spec && spec.title && f.field_title === spec.title)
    || findField(sheet, fallbackTitle)
    || null;
}

function recordValue(record, field) {
  return field ? wecom.getRecordValue(record, field.field_title) : '';
}

function parseTimeMs(raw) {
  if (!raw) return null;
  const s = String(raw).trim();
  const ts = parseInt(s);
  if (!isNaN(ts) && ts > 1000000000) return s.length === 10 ? ts * 1000 : ts;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.getTime();
}

function dateKey(raw) {
  const ts = parseTimeMs(raw);
  if (!ts) return '';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function shipmentTemperatureKey(containerNo, rawDate) {
  const c = String(containerNo || '').trim();
  const d = dateKey(rawDate);
  return c && d ? `${c}|${d}` : '';
}

function isOverseasTempRecord(record) {
  const text = [
    wecom.getRecordValue(record, '状态'),
    wecom.getRecordValue(record, '当前位置'),
    wecom.getRecordValue(record, '备注'),
  ].map(v => String(v || '')).join(' ');
  return /海外在途|国外在途/.test(text);
}

const num = (v) => {
  const n = Number(v);
  return isNaN(n) ? 0 : n;
};

// __APPEND_BELOW__

// 找子表（按 title 匹配，找不到则 null）
function findSheet(list, title) {
  return (list || []).find(s => s.title === title) || null;
}

/**
 * 从企微读取四张表，组装订单聚合的 rows
 * 返回：{ rows, byCountry: {TH:{...},VN:{...}}, global }
 */
async function loadOrders(docid, sheetList, snapshot) {
  const orderSheet = findSheet(sheetList, '订单主表');
  const detailSheet = findSheet(sheetList, '分柜明细表');
  if (!orderSheet || !detailSheet) {
    throw new Error('找不到订单主表或分柜明细表，请先配置好这两张子表');
  }

  const orderRecs = orderSheet.records || await wecom.getAllRecords(docid, orderSheet.sheet_id);
  const detailRecs = detailSheet.records || await wecom.getAllRecords(docid, detailSheet.sheet_id);
  const flowConfig = getFlowDashboardConfig();
  const flowFields = flowConfig.fields || {};

  const orderFields = {
    orderNo: findConfiguredField(orderSheet, flowFields.orderNo, '订单编号'),
    freshBoxes: findConfiguredField(orderSheet, flowFields.freshBoxes, '鲜果(柜数)') || findField(orderSheet, '鲜果'),
    frozenBoxes: findConfiguredField(orderSheet, flowFields.frozenBoxes, '冻果(柜数)') || findField(orderSheet, '冻果') || findField(orderSheet, '冻肉'),
    country: findConfiguredField(orderSheet, flowFields.country, '国家'),
  };
  const detailFields = {
    detailOrderNo: findConfiguredField(detailSheet, flowFields.detailOrderNo, '订单编号'),
    containerNo: findConfiguredField(detailSheet, flowFields.containerNo, '柜号'),
    shipDate: findConfiguredField(detailSheet, flowFields.shipDate, '发货日期'),
    arrivalDate: findConfiguredField(detailSheet, flowFields.arrivalDate, '到岸时间') || findField(detailSheet, '到岸日期'),
    domesticShipDate: findConfiguredField(detailSheet, flowFields.domesticShipDate, '国内发货时间'),
    signedDate: findConfiguredField(detailSheet, flowFields.signedDate, '签收日期'),
    country: findConfiguredField(detailSheet, flowFields.country, '国家'),
    category: findConfiguredField(detailSheet, flowFields.category, '产品品类') || findField(detailSheet, '品类'),
    brand: findConfiguredField(detailSheet, flowFields.brand, '品牌'),
  };
  const { shipments } = buildFlowFacts(orderRecs, detailRecs, orderFields, detailFields);
  const shipmentsByOrder = new Map();
  shipments.forEach(item => {
    if (!shipmentsByOrder.has(item.orderNo)) shipmentsByOrder.set(item.orderNo, []);
    shipmentsByOrder.get(item.orderNo).push(item);
  });
  const countryOrderCounts = new Map();
  orderRecs.forEach(o => {
    const country = COUNTRY_MAP[recordValue(o, orderFields.country)];
    const orderNo = recordValue(o, orderFields.orderNo) || '';
    if (!country || !orderNo) return;
    if (!countryOrderCounts.has(country)) countryOrderCounts.set(country, new Set());
    countryOrderCounts.get(country).add(orderNo);
  });

  // 订单 → 行
  const rows = [];
  orderRecs.forEach(o => {
    const country = COUNTRY_MAP[recordValue(o, orderFields.country)];
    if (!country) return; // 印尼/其他暂不展示
    const orderNo = recordValue(o, orderFields.orderNo) || '';
    const factory = extractFactory(orderNo);
    const fresh = num(recordValue(o, orderFields.freshBoxes));
    const frozen = num(recordValue(o, orderFields.frozenBoxes));
    const dets = shipmentsByOrder.get(orderNo) || [];

    // 按品类拆 2 行
    const hasCategorizedDetails = dets.some(d => d.category === 'FRESH' || d.category === 'FROZEN');
    const hasSingleCategoryOrder = Boolean(fresh) !== Boolean(frozen);
    [['FRESH', fresh, '鲜果'], ['FROZEN', frozen, '冻果']].forEach(([cat, boxes, label]) => {
      if (!boxes) return; // 该订单该品类柜数为 0，不出行
      let dCat = dets.filter(d => d.category === cat);
      if (!dCat.length && !hasCategorizedDetails && hasSingleCategoryOrder) dCat = dets;
      const signed = dCat.filter(d => d.status === 'signed').length;
      const arrived = dCat.filter(d => ['onShore', 'domesticTransit', 'signed'].includes(d.status)).length;
      const shippedNotArrived = dCat.filter(d => d.status === 'overseasTransit').length;
      const shipped = dCat.length;
      const detailedCnt = dCat.length;
      const pending = Math.max(0, boxes - detailedCnt);
      const denominator = boxes;
      const done = signed;
      const rate = denominator ? +(done / denominator * 100).toFixed(1) : 0;

      rows.push({
        id: `${orderNo}-${cat}`,
        country,
        category: cat,
        brand: `${factory} ${label}`, // 工厂简称当 brand 展示
        orders: 1,
        boxes,
        signed,
        delivered: done,
        arrived,
        shipped,
        detailed: detailedCnt,
        transit: shippedNotArrived,
        port: 0, // 当前企微数据没有"在口岸"维度
        pending,
        rate,
        rateDenominator: denominator,
        _calculation: {
          numerator: done,
          denominator,
          actualArrived: arrived,
          signed,
          shipped,
          detailed: detailedCnt,
          orderBoxes: boxes,
        },
      });
    });
  });

  // 同 brand+品类合并（同一工厂可能有多个订单：KK 鲜果 多条订单 → 合成一行）
  const merged = new Map();
  rows.forEach(r => {
    const key = `${r.country}|${r.brand}|${r.category}`;
    if (!merged.has(key)) {
      merged.set(key, { ...r, id: `wecom-${r.country}-${r.brand}-${r.category}`.replace(/\s+/g, '_') });
    } else {
      const m = merged.get(key);
      ['orders', 'boxes', 'signed', 'delivered', 'arrived', 'shipped', 'detailed', 'transit', 'port', 'pending', 'rateDenominator'].forEach(k => { m[k] += r[k]; });
      if (m._calculation && r._calculation) {
        m._calculation.numerator += r._calculation.numerator;
        m._calculation.denominator += r._calculation.denominator;
        m._calculation.actualArrived += r._calculation.actualArrived;
        m._calculation.signed += r._calculation.signed;
        m._calculation.shipped += r._calculation.shipped;
        m._calculation.detailed += r._calculation.detailed;
        m._calculation.orderBoxes += r._calculation.orderBoxes;
      }
      m.rate = m.rateDenominator ? +(m.delivered / m.rateDenominator * 100).toFixed(1) : 0;
    }
  });

  return {
    rows: Array.from(merged.values()),
    countryOrderCounts: Object.fromEntries(Array.from(countryOrderCounts.entries()).map(([country, set]) => [country, set.size])),
  };
}

/**
 * 从陆运明细 + 温度记录读取物流监控数据
 * 返回 logistics: { kpis, portDelays, inTransitContainers }
 */
async function loadLogistics(docid, sheetList) {
  const lu = findSheet(sheetList, '陆运明细');
  const temp = findSheet(sheetList, '温度记录');
  const orderSheet = findSheet(sheetList, '订单主表');
  const detailSheet = findSheet(sheetList, '分柜明细表');

  const tempRecs = temp ? (temp.records || await wecom.getAllRecords(docid, temp.sheet_id)) : [];
  const luRecs = lu ? (lu.records || await wecom.getAllRecords(docid, lu.sheet_id)) : [];
  const orderRecs = orderSheet ? (orderSheet.records || await wecom.getAllRecords(docid, orderSheet.sheet_id)) : [];
  const detailRecs = detailSheet ? (detailSheet.records || await wecom.getAllRecords(docid, detailSheet.sheet_id)) : [];
  const flowConfig = getFlowDashboardConfig();
  const flowFields = flowConfig.fields || {};
  const orderFields = {
    orderNo: findConfiguredField(orderSheet, flowFields.orderNo, '订单编号'),
    freshBoxes: findConfiguredField(orderSheet, flowFields.freshBoxes, '鲜果(柜数)') || findField(orderSheet, '鲜果'),
    frozenBoxes: findConfiguredField(orderSheet, flowFields.frozenBoxes, '冻果(柜数)') || findField(orderSheet, '冻果') || findField(orderSheet, '冻肉'),
    country: findConfiguredField(orderSheet, flowFields.country, '国家'),
  };
  const detailFields = {
    detailOrderNo: findConfiguredField(detailSheet, flowFields.detailOrderNo, '订单编号'),
    containerNo: findConfiguredField(detailSheet, flowFields.containerNo, '柜号'),
    shipDate: findConfiguredField(detailSheet, flowFields.shipDate, '发货日期'),
    arrivalDate: findConfiguredField(detailSheet, flowFields.arrivalDate, '到岸时间') || findField(detailSheet, '到岸日期'),
    domesticShipDate: findConfiguredField(detailSheet, flowFields.domesticShipDate, '国内发货时间'),
    signedDate: findConfiguredField(detailSheet, flowFields.signedDate, '签收日期'),
    country: findConfiguredField(detailSheet, flowFields.country, '国家'),
    category: findConfiguredField(detailSheet, flowFields.category, '产品品类') || findField(detailSheet, '品类'),
    brand: findConfiguredField(detailSheet, flowFields.brand, '品牌'),
  };
  const { shipments } = buildFlowFacts(orderRecs, detailRecs, orderFields, detailFields);
  const overseasShipments = shipments.filter(s => s.status === 'overseasTransit');
  const activeShipmentKeys = new Set(overseasShipments
    .map(s => shipmentTemperatureKey(s.containerNo, s.shipDate))
    .filter(Boolean));

  // 温度统计：同一柜号可多次装柜，同一趟也会一天多次更新；甘特需要保留每条记录
  const activeTempList = tempRecs.filter(r => {
    const cNo = wecom.getRecordValue(r, '柜号');
    if (!cNo) return false;
    const releaseDate = wecom.getRecordValue(r, '放柜时间');
    const key = shipmentTemperatureKey(cNo, releaseDate);
    return activeShipmentKeys.has(key) || isOverseasTempRecord(r);
  }).sort((a, b) => (parseTimeMs(wecom.getRecordValue(a, '更新时间')) || 0) - (parseTimeMs(wecom.getRecordValue(b, '更新时间')) || 0));

  let tempAlarms = 0, retSum = 0, retCnt = 0;
  activeTempList.forEach(r => {
    const setT = wecom.getRecordValue(r, '设定温度');
    const ret = wecom.getRecordValue(r, '回风温度');
    if (typeof ret === 'number') { retSum += ret; retCnt++; }
    if (typeof setT === 'number' && typeof ret === 'number' && Math.abs(ret - setT) > 1.5) tempAlarms++;
  });

  const onShoreDays = Number(flowConfig.thresholds && flowConfig.thresholds.onShoreDays) || 2;
  const portDelayedShipments = shipments.filter(s => s.status === 'onShore' && (s.dwellDays || 0) >= onShoreDays);
  const portDelayed = portDelayedShipments.length;
  const portDelays = portDelayedShipments.slice(0, 10).map(s => ({
    id: `flow-${s.id}`,
    container: s.containerNo || '-',
    route: s.country || '-',
    category: s.category === 'FROZEN' ? 'FROZEN' : 'FRESH',
    delayDays: s.dwellDays || 0,
    reason: '已到岸未叫车',
  }));

  // 在途冷柜：温度记录最新一条，按异常→注意→正常排序，取前若干
  const inTransitContainers = activeTempList.map(r => {
    const setT = wecom.getRecordValue(r, '设定温度');
    const ret = wecom.getRecordValue(r, '回风温度');
    let status = 'OK', note = '正常';
    if (typeof setT === 'number' && typeof ret === 'number') {
      const diff = Math.abs(ret - setT);
      if (diff > 1.5) { status = 'ALARM'; note = '▲预警'; }
      else if (diff > 1) { status = 'WARN'; note = '注意'; }
    }
    return {
      id: `tc-${wecom.getRecordValue(r, '柜号')}`,
      container: wecom.getRecordValue(r, '柜号') || '-',
      brand: wecom.getRecordValue(r, '品牌') || '-',
      setTemp: typeof setT === 'number' ? setT : 0,
      returnTemp: typeof ret === 'number' ? ret : 0,
      location: wecom.getRecordValue(r, '当前位置') || '-',
      releaseDate: wecom.getRecordValue(r, '放柜时间') || '',
      recordedAt: wecom.getRecordValue(r, '更新时间') || '',
      transitStatus: isOverseasTempRecord(r) ? '国外在途' : '',
      status, note,
    };
  }).sort((a, b) => {
    const rank = { ALARM: 0, WARN: 1, OK: 2 };
    return rank[a.status] - rank[b.status];
  });

  return {
    kpis: {
      inTransit: overseasShipments.length,
      tempRecords: tempRecs.length,
      avgReturnTemp: retCnt ? Math.round(retSum / retCnt * 10) / 10 : 0,
      tempAlarms,
      portDelayed,
    },
    portDelays,
    inTransitContainers,
  };
}

/**
 * 主入口：返回与 board-routes.aggregate(db) 同形的对象
 * news 由 board-routes 注入自动新闻，其余从企微来
 */
async function aggregateFromWecom(docid, snapshot = null) {
  let sheetList = snapshot && snapshot.sheets;
  if (!sheetList) {
    const sheetsResp = await wecom.getSheets(docid);
    if (sheetsResp.errcode) throw new Error(`getSheets 失败: ${sheetsResp.errmsg}`);
    sheetList = sheetsResp.sheet_list || sheetsResp.properties || [];
  }

  const [orderData, logistics] = await Promise.all([
    loadOrders(docid, sheetList, snapshot),
    loadLogistics(docid, sheetList),
  ]);
  const rows = orderData.rows || [];
  const countryOrderCounts = orderData.countryOrderCounts || {};

  // 按国家聚合（与 board-routes 内部 byCountry 同形）
  const byCountry = (c) => {
    const r = rows.filter(o => o.country === c);
    const sum = (k) => r.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const boxes = sum('boxes');
    const done = sum('delivered');
    const denominator = boxes;
    return {
      orders: countryOrderCounts[c] || 0, boxes,
      delivered: sum('delivered'), signed: sum('signed'),
      arrived: sum('arrived'), transit: sum('transit'), port: sum('port'), pending: sum('pending'),
      rate: denominator ? +(done / denominator * 100).toFixed(1) : 0,
      calculation: {
        formula: '签收率 = 已签收柜数 / 订单总柜数',
        numeratorField: '分柜明细表.签收日期非空数量',
        denominatorField: '订单主表.鲜果(柜数)/冻果(柜数)',
        numerator: done,
        denominator,
      },
      rows: r,
    };
  };
  const th = byCountry('TH');
  const vn = byCountry('VN');

  const totalOrders = th.orders + vn.orders;
  const totalBoxes = th.boxes + vn.boxes;
  const totalDone = th.delivered + vn.delivered;
  const totalArrived = th.arrived + vn.arrived;
  const totalMoving = th.transit + vn.transit;
  const totalPending = th.pending + vn.pending;

  const db = read();
  const meta = db.meta;

  return {
    meta,
    global: { totalOrders, totalBoxes, totalDone, totalArrived, totalMoving, totalPending },
    th, vn,
    logistics,
    news: { th: [], vn: [] },
    generatedAt: new Date().toISOString(),
    _source: 'wecom',
    _cache: snapshot ? { fetchedAt: snapshot.fetchedAt, ageMs: Date.now() - new Date(snapshot.fetchedAt).getTime() } : null,
  };
}

module.exports = { aggregateFromWecom };
