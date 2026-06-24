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

function parseTimeMs(raw) {
  if (!raw) return null;
  const ts = parseInt(raw);
  if (!isNaN(ts) && ts > 1e12) return ts;
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d.getTime();
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

  const orderFields = {
    orderNo: findField(orderSheet, '订单编号'),
    freshBoxes: findField(orderSheet, '鲜果(柜数)') || findField(orderSheet, '鲜果'),
    frozenBoxes: findField(orderSheet, '冻果(柜数)') || findField(orderSheet, '冻果') || findField(orderSheet, '冻肉'),
    country: findField(orderSheet, '国家'),
  };
  const detailFields = {
    detailOrderNo: findField(detailSheet, '订单编号'),
    containerNo: findField(detailSheet, '柜号'),
    shipDate: findField(detailSheet, '发货日期'),
    arrivalDate: findField(detailSheet, '到岸时间') || findField(detailSheet, '到岸日期'),
    domesticShipDate: findField(detailSheet, '国内发货时间'),
    signedDate: findField(detailSheet, '签收日期'),
    country: findField(detailSheet, '国家'),
    category: findField(detailSheet, '产品品类') || findField(detailSheet, '品类'),
    brand: findField(detailSheet, '品牌'),
  };
  const { shipments } = buildFlowFacts(orderRecs, detailRecs, orderFields, detailFields);
  const shipmentsByOrder = new Map();
  shipments.forEach(item => {
    if (!shipmentsByOrder.has(item.orderNo)) shipmentsByOrder.set(item.orderNo, []);
    shipmentsByOrder.get(item.orderNo).push(item);
  });

  // 订单 → 行
  const rows = [];
  orderRecs.forEach(o => {
    const country = COUNTRY_MAP[wecom.getRecordValue(o, '国家')];
    if (!country) return; // 印尼/其他暂不展示
    const orderNo = wecom.getRecordValue(o, '订单编号') || '';
    const factory = extractFactory(orderNo);
    const fresh = num(wecom.getRecordValue(o, '鲜果(柜数)'));
    const frozen = num(wecom.getRecordValue(o, '冻果(柜数)'));
    const dets = shipmentsByOrder.get(orderNo) || [];

    // 按品类拆 2 行
    [['FRESH', fresh, '鲜果'], ['FROZEN', frozen, '冻肉']].forEach(([cat, boxes, label]) => {
      if (!boxes) return; // 该订单该品类柜数为 0，不出行
      const dCat = dets.filter(d => d.category === cat);
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

  return Array.from(merged.values());
}

/**
 * 从陆运明细 + 温度记录读取物流监控数据
 * 返回 logistics: { kpis, portDelays, inTransitContainers }
 */
async function loadLogistics(docid, sheetList) {
  const lu = findSheet(sheetList, '陆运明细');
  const temp = findSheet(sheetList, '温度记录');

  const tempRecs = temp ? (temp.records || await wecom.getAllRecords(docid, temp.sheet_id)) : [];
  const luRecs = lu ? (lu.records || await wecom.getAllRecords(docid, lu.sheet_id)) : [];

  // 温度统计：每柜最新一条
  const latestByContainer = new Map();
  tempRecs.forEach(r => {
    const cNo = wecom.getRecordValue(r, '柜号');
    if (!cNo) return;
    const t = parseTimeMs(wecom.getRecordValue(r, '更新时间')) || 0;
    const cur = latestByContainer.get(cNo);
    if (!cur || t > cur._t) latestByContainer.set(cNo, { _t: t, raw: r });
  });
  const latestList = Array.from(latestByContainer.values()).map(x => x.raw);

  let tempAlarms = 0, retSum = 0, retCnt = 0;
  latestList.forEach(r => {
    const setT = wecom.getRecordValue(r, '设定温度');
    const ret = wecom.getRecordValue(r, '回风温度');
    if (typeof ret === 'number') { retSum += ret; retCnt++; }
    if (typeof setT === 'number' && typeof ret === 'number' && Math.abs(ret - setT) > 3) tempAlarms++;
  });

  // 陆运滞留：进卡时间已填、出卡时间空 → 滞留
  const TODAY = Date.now();
  const portDelays = [];
  let portDelayed = 0;
  luRecs.forEach(r => {
    const entry = parseTimeMs(wecom.getRecordValue(r, '进卡时间'));
    const exit = parseTimeMs(wecom.getRecordValue(r, '出卡时间'));
    if (!entry || exit) return;
    const days = Math.round((TODAY - entry) / 86400000 * 10) / 10;
    if (days < 1) return; // 不足 1 天不算滞留
    portDelayed++;
    if (portDelays.length < 10) {
      portDelays.push({
        id: `lu-${wecom.getRecordValue(r, '柜号') || portDelays.length}`,
        container: wecom.getRecordValue(r, '柜号') || '-',
        route: wecom.getRecordValue(r, '目的地') || '-',
        category: 'FRESH', // 陆运表里没有品类，先默认鲜果
        delayDays: days,
        reason: wecom.getRecordValue(r, '是否中查验') || '查验/通关',
      });
    }
  });

  // 在途冷柜：温度记录最新一条，按异常→注意→正常排序，取前若干
  const inTransitContainers = latestList.map(r => {
    const setT = wecom.getRecordValue(r, '设定温度');
    const ret = wecom.getRecordValue(r, '回风温度');
    let status = 'OK', note = '正常';
    if (typeof setT === 'number' && typeof ret === 'number') {
      const diff = Math.abs(ret - setT);
      if (diff > 3) { status = 'ALARM'; note = '▲异常'; }
      else if (diff > 2) { status = 'WARN'; note = '注意'; }
    }
    return {
      id: `tc-${wecom.getRecordValue(r, '柜号')}`,
      container: wecom.getRecordValue(r, '柜号') || '-',
      brand: wecom.getRecordValue(r, '品牌') || '-',
      setTemp: typeof setT === 'number' ? setT : 0,
      returnTemp: typeof ret === 'number' ? ret : 0,
      location: wecom.getRecordValue(r, '当前位置') || '-',
      status, note,
    };
  }).sort((a, b) => {
    const rank = { ALARM: 0, WARN: 1, OK: 2 };
    return rank[a.status] - rank[b.status];
  });

  return {
    kpis: {
      inTransit: latestList.length,
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

  const [rows, logistics] = await Promise.all([
    loadOrders(docid, sheetList, snapshot),
    loadLogistics(docid, sheetList),
  ]);

  // 按国家聚合（与 board-routes 内部 byCountry 同形）
  const byCountry = (c) => {
    const r = rows.filter(o => o.country === c);
    const sum = (k) => r.reduce((a, x) => a + (Number(x[k]) || 0), 0);
    const boxes = sum('boxes');
    const done = sum('delivered');
    const denominator = boxes;
    return {
      orders: sum('orders'), boxes,
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
