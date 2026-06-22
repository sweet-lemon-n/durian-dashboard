/**
 * 企业微信智能表内存快照缓存。
 *
 * 第一版只保存在 Node 进程内存中，不落本地文件：
 * - 定时整批刷新看板和穿透需要的子表。
 * - 刷新成功后整体替换快照。
 * - 刷新失败时继续使用上一份成功快照。
 */
const wecom = require('./wecom');

const DEFAULT_REFRESH_MS = 30 * 1000;
const CACHE_SHEET_TITLES = [
  '订单主表',
  '分柜明细表',
  '温度记录',
  '陆运明细',
  '海运明细',
  '国内段明细',
  '海运国内',
];

let state = {
  docid: null,
  snapshot: null,
  refreshing: null,
  timer: null,
  lastError: null,
  lastRefreshStartedAt: null,
  lastRefreshFinishedAt: null,
  refreshCount: 0,
};

function refreshIntervalMs() {
  return Number(process.env.WECOM_CACHE_REFRESH_MS || DEFAULT_REFRESH_MS);
}

function ensureTimer(docid) {
  state.docid = docid || state.docid;
  if (state.timer || !state.docid) return;
  const intervalMs = refreshIntervalMs();
  state.timer = setInterval(() => {
    refreshNow(state.docid).catch(() => {});
  }, intervalMs);
  if (state.timer.unref) state.timer.unref();
  console.log(`[wecom-cache] 内存快照缓存已按需启动，刷新间隔 ${intervalMs}ms`);
}

function wantedSheet(sheet) {
  return sheet && sheet.type === 'smartsheet' && CACHE_SHEET_TITLES.includes(sheet.title);
}

async function fetchSheet(docid, sheet) {
  const fieldsResp = await wecom.getFields(docid, sheet.sheet_id);
  if (fieldsResp.errcode !== 0) {
    throw new Error(`获取子表「${sheet.title}」字段失败: [${fieldsResp.errcode}] ${fieldsResp.errmsg}`);
  }
  const fields = fieldsResp.fields || [];
  const fieldTitles = fields.map(f => f.field_title);
  const fieldMap = {};
  fields.forEach(f => { fieldMap[f.field_title] = f; });
  const records = await wecom.getAllRecords(docid, sheet.sheet_id);

  return {
    ...sheet,
    fields,
    fieldTitles,
    fieldMap,
    records,
  };
}

async function fetchSnapshot(docid) {
  if (!docid) throw new Error('缺少 DOCID 环境变量配置');
  const startedAt = Date.now();
  const sheetResp = await wecom.getSheets(docid);
  if (sheetResp.errcode !== 0) {
    throw new Error(`获取子表失败: [${sheetResp.errcode}] ${sheetResp.errmsg}`);
  }

  const sheetList = (sheetResp.sheet_list || []).filter(wantedSheet);
  const sheets = await Promise.all(sheetList.map(sheet => fetchSheet(docid, sheet)));
  const sheetsByTitle = {};
  sheets.forEach(sheet => { sheetsByTitle[sheet.title] = sheet; });

  return {
    docid,
    fetchedAt: new Date().toISOString(),
    durationMs: Date.now() - startedAt,
    sheets,
    sheetsByTitle,
    recordCounts: Object.fromEntries(sheets.map(sheet => [sheet.title, sheet.records.length])),
  };
}

async function refreshNow(docid) {
  if (state.refreshing) return state.refreshing;
  state.docid = docid || state.docid;
  state.lastRefreshStartedAt = new Date().toISOString();
  state.refreshing = fetchSnapshot(state.docid)
    .then(snapshot => {
      state.snapshot = snapshot;
      state.lastError = null;
      state.refreshCount += 1;
      state.lastRefreshFinishedAt = new Date().toISOString();
      console.log(`[wecom-cache] 刷新成功: ${snapshot.sheets.length} 张表, ${snapshot.durationMs}ms`, snapshot.recordCounts);
      return snapshot;
    })
    .catch(err => {
      state.lastError = {
        message: err.message,
        at: new Date().toISOString(),
      };
      state.lastRefreshFinishedAt = new Date().toISOString();
      console.warn('[wecom-cache] 刷新失败:', err.message);
      if (state.snapshot) return state.snapshot;
      throw err;
    })
    .finally(() => {
      state.refreshing = null;
    });
  return state.refreshing;
}

async function getSnapshotOrRefresh(docid) {
  ensureTimer(docid);
  if (state.snapshot && (!docid || state.snapshot.docid === docid)) return state.snapshot;
  return refreshNow(docid);
}

function getSnapshot() {
  return state.snapshot;
}

function getStatus() {
  const snapshot = state.snapshot;
  return {
    hasSnapshot: !!snapshot,
    docid: state.docid,
    fetchedAt: snapshot ? snapshot.fetchedAt : null,
    ageMs: snapshot ? Date.now() - new Date(snapshot.fetchedAt).getTime() : null,
    durationMs: snapshot ? snapshot.durationMs : null,
    recordCounts: snapshot ? snapshot.recordCounts : {},
    refreshing: !!state.refreshing,
    lastError: state.lastError,
    lastRefreshStartedAt: state.lastRefreshStartedAt,
    lastRefreshFinishedAt: state.lastRefreshFinishedAt,
    refreshCount: state.refreshCount,
  };
}

function initWecomCache(docid, options = {}) {
  const intervalMs = Number(options.intervalMs || process.env.WECOM_CACHE_REFRESH_MS || DEFAULT_REFRESH_MS);
  state.docid = docid;
  if (state.timer) clearInterval(state.timer);
  refreshNow(docid).catch(() => {});
  state.timer = setInterval(() => {
    refreshNow(docid).catch(() => {});
  }, intervalMs);
  if (state.timer.unref) state.timer.unref();
  console.log(`[wecom-cache] 已启用内存快照缓存，刷新间隔 ${intervalMs}ms`);
}

function stopWecomCache() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

module.exports = {
  CACHE_SHEET_TITLES,
  initWecomCache,
  stopWecomCache,
  refreshNow,
  getSnapshot,
  getSnapshotOrRefresh,
  getStatus,
};
