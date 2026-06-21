/**
 * 新闻自动抓取 — 多源聚合
 *
 * 源优先级：
 *   1. 秘塔搜索 MCP/API（可选，配置 METASO_MCP_URL + METASO_MCP_API_KEY 或 METASO_API_KEY）
 *   2. 新浪财经公开 JSON API (免费, 无需 Key, 国内服务器友好)
 *   3. 水果行业 RSS 直接抓取
 *   4. 搜索引擎 HTML 抓取 (备选)
 *
 * 用法：
 *   const { initNewsFetcher, getAutoNews, refreshNow } = require('./news-fetcher');
 */

const axios = require('axios');
const fs = require('fs');
const https = require('https');
const path = require('path');
const { getNewsSourceConfig } = require('./runtime-config');

const CONFIG = {
  REFRESH_INTERVAL_MS: 30 * 60 * 1000,
  TIMEOUT_MS: 10000,
  MAX_ITEMS: 24,
  LOG_FILE: path.join(__dirname, '..', 'data', 'news-fetcher.log'),
};

let cachedNews = [];
let lastFetchedAt = null;
let refreshTimer = null;
let lastRefreshDiagnostics = {
  ok: false,
  message: '尚未刷新',
  sources: {},
  errors: [],
  keywords: [],
};
let metasoDailyUsage = { day: '', calls: 0, lastCallAt: 0 };

function noteDiag(diag, source, status, message) {
  diag.errors.push({ source, status, message: String(message || '').slice(0, 300) });
}

function ensureSourceDiag(diag, source) {
  if (!diag.sourceStats[source]) {
    diag.sourceStats[source] = { raw: 0, accepted: 0, filtered: 0, samples: [], acceptedSamples: [] };
  }
  return diag.sourceStats[source];
}

function noteRaw(diag, source, title) {
  if (!diag) return;
  const s = ensureSourceDiag(diag, source);
  s.raw++;
  if (title && s.samples.length < 8) s.samples.push(String(title).slice(0, 80));
}

function noteAccepted(diag, source, title) {
  if (!diag) return;
  const s = ensureSourceDiag(diag, source);
  s.accepted++;
  if (title && s.acceptedSamples.length < 8) s.acceptedSamples.push(String(title).slice(0, 80));
}

function noteFiltered(diag, source) {
  if (!diag) return;
  ensureSourceDiag(diag, source).filtered++;
}

function appendNewsLog(diag) {
  try {
    const dir = path.dirname(CONFIG.LOG_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(CONFIG.LOG_FILE, JSON.stringify(diag) + '\n', 'utf-8');
    const stat = fs.statSync(CONFIG.LOG_FILE);
    if (stat.size > 1024 * 1024) {
      const lines = fs.readFileSync(CONFIG.LOG_FILE, 'utf-8').trim().split('\n').slice(-200);
      fs.writeFileSync(CONFIG.LOG_FILE, lines.join('\n') + '\n', 'utf-8');
    }
  } catch (e) {
    console.warn('[news-fetcher] 写日志失败:', e.message);
  }
}

function getSearchKeywords() {
  return getNewsSourceConfig().keywords || [];
}

function buildCombinedQuery() {
  const kws = getSearchKeywords();
  return `${kws.join(' OR ')} 最新 新闻 中国进口 口岸 通关`;
}

function canUseMetaso(diag) {
  const cfg = getNewsSourceConfig();
  if (!cfg.metasoEnabled) return false;
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (metasoDailyUsage.day !== day) metasoDailyUsage = { day, calls: 0, lastCallAt: 0 };
  const dailyLimit = Number(cfg.metasoDailyLimit || 0);
  const cooldownMinutes = Number(cfg.metasoCooldownMinutes || 0);
  if (dailyLimit <= 0) {
    noteDiag(diag, 'metaso', 'skipped', '秘塔已配置但每日额度为 0，已跳过付费搜索源');
    return false;
  }
  if (metasoDailyUsage.calls >= dailyLimit) {
    noteDiag(diag, 'metaso', 'skipped', `秘塔今日额度已用完：${metasoDailyUsage.calls}/${dailyLimit}`);
    return false;
  }
  if (cooldownMinutes > 0 && now - metasoDailyUsage.lastCallAt < cooldownMinutes * 60000) {
    noteDiag(diag, 'metaso', 'skipped', `秘塔冷却中：${cooldownMinutes} 分钟内不重复调用`);
    return false;
  }
  return true;
}

function markMetasoCall() {
  const now = Date.now();
  const day = new Date(now).toISOString().slice(0, 10);
  if (metasoDailyUsage.day !== day) metasoDailyUsage = { day, calls: 0, lastCallAt: 0 };
  metasoDailyUsage.calls++;
  metasoDailyUsage.lastCallAt = now;
}

function stripHtml(s) {
  return String(s || '')
    .replace(/<[^>]+>/g, '')
    .replace(/<!\[CDATA\[|\]\]>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .trim();
}

function countryOf(title, detail = '') {
  const text = `${title} ${detail}`;
  return /越南|同奈|Dak Lak|Đắk|Vietnam/i.test(text) ? 'VN' : 'TH';
}

function normalizeSearchItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  if (Array.isArray(payload.content)) {
    return payload.content.flatMap(c => {
      if (!c) return [];
      const text = c.text || c.content || '';
      if (typeof text !== 'string') return [];
      try {
        return normalizeSearchItems(JSON.parse(text));
      } catch (_) {
        return text.split('\n').map(line => ({ title: line.trim() })).filter(x => x.title.length > 6);
      }
    });
  }
  const data = payload.data || payload.result || payload.results || payload.items || payload.list;
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    return data.items || data.results || data.list || data.webPages || [];
  }
  return [];
}

function parseJsonRpcResponse(data) {
  if (typeof data !== 'string') return data;
  const direct = data.trim();
  if (!direct) return null;
  if (direct.startsWith('{') || direct.startsWith('[')) return JSON.parse(direct);

  const ssePayloads = [];
  direct.split(/\r?\n/).forEach(line => {
    const m = line.match(/^data:\s*(.+)$/);
    if (m && m[1] !== '[DONE]') ssePayloads.push(m[1]);
  });
  for (let i = ssePayloads.length - 1; i >= 0; i--) {
    try { return JSON.parse(ssePayloads[i]); } catch (_) {}
  }
  return null;
}

async function postJsonRpc(url, apiKey, method, params, id) {
  const resp = await axios.post(url, {
    jsonrpc: '2.0',
    id,
    method,
    params: params || {},
  }, {
    timeout: CONFIG.TIMEOUT_MS,
    responseType: 'text',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
      Accept: 'application/json, text/event-stream',
      'Content-Type': 'application/json',
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });

  const parsed = parseJsonRpcResponse(resp.data);
  if (parsed && parsed.error) throw new Error(parsed.error.message || JSON.stringify(parsed.error));
  return parsed && Object.prototype.hasOwnProperty.call(parsed, 'result') ? parsed.result : parsed;
}

function buildToolArgs(tool, query) {
  const schema = tool && tool.inputSchema;
  const props = (schema && schema.properties) || {};
  const keys = Object.keys(props);
  const args = {};
  const queryKey = keys.find(k => /^(query|q|keyword|keywords|input|searchQuery|question)$/i.test(k)) || 'query';
  args[queryKey] = query;
  for (const k of keys) {
    if (/^(limit|size|count|topK|top_k|num|pageSize)$/i.test(k)) args[k] = 8;
  }
  if (!Object.keys(props).length) {
    args.query = query;
    args.limit = 8;
  }
  return args;
}

function normalizeNewsItem(item, source) {
  const title = stripHtml(item.title || item.name || item.headline || item.summary || item.text);
  const detail = stripHtml(item.snippet || item.description || item.detail || item.content || item.summary);
  const url = item.url || item.link || item.href || item.sourceUrl;
  if (!title || title.length < 4) return null;
  if (!isRelevantNews(title, detail)) return null;
  return {
    country: countryOf(title, detail),
    icon: '📰',
    title: title.slice(0, 60),
    detail: detail.slice(0, 200),
    url,
    source,
    fetchedAt: new Date().toISOString(),
  };
}

// ================================================================
//  源 0: 秘塔搜索 API（可选）
// ================================================================

async function fetchFromMetasoMcp(diag) {
  const cfg = getNewsSourceConfig();
  if (!cfg.metasoEnabled) return [];
  const apiKey = cfg.metasoMcpApiKey || cfg.metasoApiKey;
  const mcpUrl = cfg.metasoMcpUrl;
  if (!apiKey || !mcpUrl) return [];
  if (/\/mcp\/servers\//.test(mcpUrl) && !/\/sse|\/messages|\/mcp/i.test(mcpUrl.replace('https://www.modelscope.cn/mcp/servers/', ''))) {
    throw new Error('当前填写的是 ModelScope 展示页地址，不是 MCP 服务调用地址。请在页面里复制 MCP 服务 URL / SSE URL。');
  }

  await postJsonRpc(mcpUrl, apiKey, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'durian-dashboard', version: '1.0.0' },
  }, 1).catch(e => {
    console.warn('[news-fetcher] 秘塔 MCP initialize 失败，继续尝试 tools/list:', e.message);
  });

  const listed = await postJsonRpc(mcpUrl, apiKey, 'tools/list', {}, 2);
  const tools = listed && listed.tools ? listed.tools : [];
  const tool = tools.find(t => /search|metaso|web|news/i.test(t.name || '')) || tools[0];
  if (!tool) return [];

  const all = [];
  const result = await postJsonRpc(mcpUrl, apiKey, 'tools/call', {
    name: tool.name,
    arguments: buildToolArgs(tool, buildCombinedQuery()),
  }, 100);
  const rawItems = normalizeSearchItems(result);
  rawItems.forEach(item => {
    const title = stripHtml(item.title || item.name || item.headline || item.summary || item.text);
    noteRaw(diag, 'metaso-mcp', title);
    const normalized = normalizeNewsItem(item, 'metaso-mcp');
    if (normalized) { noteAccepted(diag, 'metaso-mcp', normalized.title); all.push(normalized); }
    else noteFiltered(diag, 'metaso-mcp');
  });
  return all;
}

async function fetchFromMetasoApi(diag) {
  const cfg = getNewsSourceConfig();
  if (!cfg.metasoEnabled) return [];
  const apiKey = cfg.metasoApiKey;
  const apiUrl = cfg.metasoApiUrl;
  if (!apiKey || !apiUrl) return [];

  const all = [];
  const q = buildCombinedQuery();
  const resp = await axios.post(apiUrl, {
    query: q,
    q,
    keyword: q,
    size: 12,
    limit: 12,
  }, {
    timeout: CONFIG.TIMEOUT_MS,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'X-API-Key': apiKey,
      'Content-Type': 'application/json',
    },
    httpsAgent: new https.Agent({ rejectUnauthorized: false }),
  });
  normalizeSearchItems(resp.data).forEach(item => {
    const title = stripHtml(item.title || item.name || item.headline || item.summary || item.text);
    noteRaw(diag, 'metaso', title);
    const normalized = normalizeNewsItem(item, 'metaso');
    if (normalized) { noteAccepted(diag, 'metaso', normalized.title); all.push(normalized); }
    else noteFiltered(diag, 'metaso');
  });
  return all;
}

async function fetchFromMetaso(diag) {
  const cfg = getNewsSourceConfig();
  if (cfg.metasoMcpUrl) return fetchFromMetasoMcp(diag);
  return fetchFromMetasoApi(diag);
}

// ================================================================
//  源 1: 新浪财经公开 JSON API
//  免费、无需 Key、国内服务器不会被拦
// ================================================================

/** 新浪财经频道 lid 映射 */
const SINA_LIDS = [
  { lid: '2516', name: '期货' },    // 农产品期货相关
  { lid: '2509', name: '财经' },
  { lid: '2510', name: '国内' },
  { lid: '1686', name: '产经' },
  { lid: '2515', name: '消费' },
];

/** 水果/农产品/进口 关键词 */
const FRUIT_KW = /榴莲|冻榴莲|冷冻榴莲|山竹|龙眼|火龙果|水果进口|东盟水果|友谊关|凭祥|磨憨|磨丁|蛇口|南沙港|泰国水果|越南水果|泰国榴莲|越南榴莲|冷链|农产品进口|海关|通关|口岸/i;
const NEWS_RELEVANCE_KW = /榴莲|冻榴莲|冷冻榴莲|泰国榴莲|越南榴莲|泰国水果|越南水果|东盟水果|东盟鲜果|水果进口|进口水果|鲜果批量|水果交易|山竹|龙眼|火龙果/i;
const NEWS_CONTEXT_KW = /泰国|越南|东盟|磨憨|磨丁|凭祥|友谊关|南沙|蛇口|口岸|海关|通关|冷链|农产品/i;
const NEWS_PRODUCT_KW = /榴莲|水果|鲜果|农产品/i;
const NEWS_EXCLUDE_KW = /银行|金融护航|快递|科技新闻|手机|电脑|驱动下载|玫瑰|柴油发电|气候|社区开展/i;

function isRelevantNews(title, detail = '') {
  const text = `${title} ${detail}`;
  if (NEWS_EXCLUDE_KW.test(title)) return false;
  if (NEWS_RELEVANCE_KW.test(title)) return true;
  if (NEWS_RELEVANCE_KW.test(detail)) return true;
  if (NEWS_CONTEXT_KW.test(title) && NEWS_PRODUCT_KW.test(text)) return true;
  if (/榴莲/.test(detail) && NEWS_CONTEXT_KW.test(text)) return true;
  return false;
}

function isLooseRelevantNews(title, detail = '') {
  const text = `${title} ${detail}`;
  if (NEWS_EXCLUDE_KW.test(title)) return false;
  return NEWS_PRODUCT_KW.test(text) && NEWS_CONTEXT_KW.test(text);
}

async function fetchSinaFeed(lid, count, diag) {
  try {
    const url = `https://feed.mix.sina.com.cn/api/roll/get?pageid=153&lid=${lid}&k=&num=${count}`;
    const resp = await axios.get(url, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Referer': 'https://finance.sina.com.cn/',
      },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    const list = (resp.data && resp.data.result && resp.data.data) || [];
    const results = [];

    for (const item of list) {
      const title = stripHtml(item.title);
      noteRaw(diag, 'sina', title);
      if (!title || title.length < 6) continue;
      if (!FRUIT_KW.test(title)) { noteFiltered(diag, 'sina'); continue; }

      const detail = stripHtml(item.intro || item.keywords);
      const normalized = {
        country: countryOf(title, detail),
        icon: '📰',
        title: title.slice(0, 60),
        detail: detail.slice(0, 200),
        url: item.url || `https://finance.sina.com.cn/search/?q=${encodeURIComponent(title)}`,
        source: 'sina',
        fetchedAt: new Date().toISOString(),
      };
      noteAccepted(diag, 'sina', normalized.title);
      results.push(normalized);
    }

    return results;
  } catch (e) {
    console.warn(`[news-fetcher] 新浪财经 lid=${lid} 失败:`, e.message);
    return [];
  }
}

async function fetchAllSina(diag) {
  const all = [];
  const results = await Promise.allSettled(SINA_LIDS.map(l => fetchSinaFeed(l.lid, 60, diag)));
  for (const r of results) {
    if (r.status === 'fulfilled') all.push(...r.value);
  }
  return all;
}

// ================================================================
//  源 2: 水果行业站点 RSS
// ================================================================

const FRUIT_RSS = [
  'https://www.guojiguoshu.com/feed/',
  'https://www.chinafruitportal.com/feed/',
];

function parseRssXml(xml) {
  const items = [];
  const itemRegex = /<item>([\s\S]*?)<\/item>/gi;
  let m;
  while ((m = itemRegex.exec(xml)) !== null) {
    const body = m[1];
    const title = (body.match(/<title>([\s\S]*?)<\/title>/i) || [])[1] || '';
    const link = (body.match(/<link>([\s\S]*?)<\/link>/i) || [])[1] || '';
    const desc = (body.match(/<description>([\s\S]*?)<\/description>/i) || [])[1] || '';
    if (title) {
      items.push({
        title: stripHtml(title),
        link: stripHtml(link),
        desc: stripHtml(desc),
      });
    }
  }
  return items;
}

async function fetchRssFeed(feedUrl, diag) {
  try {
    const resp = await axios.get(feedUrl, {
      timeout: CONFIG.TIMEOUT_MS,
      headers: { 'User-Agent': 'durian-dashboard/1.0' },
      httpsAgent: new https.Agent({ rejectUnauthorized: false }),
    });

    const xml = typeof resp.data === 'string' ? resp.data : JSON.stringify(resp.data);
    const items = parseRssXml(xml);
    const results = [];

    for (const item of items) {
      noteRaw(diag, 'rss', item.title);
      if (!item.title || item.title.length < 6) continue;
      const normalized = {
        country: countryOf(item.title, item.desc),
        icon: '📰',
        title: item.title.slice(0, 60),
        detail: item.desc.slice(0, 200),
        url: item.link,
        source: 'rss',
        fetchedAt: new Date().toISOString(),
      };
      if (!isRelevantNews(normalized.title, normalized.detail) && !isLooseRelevantNews(normalized.title, normalized.detail)) {
        noteFiltered(diag, 'rss');
        continue;
      }
      noteAccepted(diag, 'rss', normalized.title);
      results.push(normalized);
    }

    return results;
  } catch (e) {
    console.warn(`[news-fetcher] RSS ${feedUrl} 失败:`, e.message);
    return [];
  }
}

// ================================================================
//  源 3: 搜索引擎 HTML 抓取 (备选)
// ================================================================

async function fetchFromEngine(sourceName, searchUrl, patterns, diag) {
  const all = [];

  for (const kw of getSearchKeywords()) {
    try {
      const resp = await axios.get(searchUrl.replace('{kw}', encodeURIComponent(kw)), {
        timeout: CONFIG.TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; DurianDashboard/1.0)',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const html = resp.data;
      const titles = [];
      let m;
      while ((m = patterns.titleRegex.exec(html)) !== null) {
        titles.push({ url: m[1], title: stripHtml(m[2]) });
      }

      const descs = [];
      while ((m = patterns.descRegex.exec(html)) !== null) {
        descs.push(stripHtml(m[1]));
      }
      if (!descs.length && patterns.fallbackRegex) {
        while ((m = patterns.fallbackRegex.exec(html)) !== null) {
          descs.push(stripHtml(m[1]));
        }
      }

      for (let i = 0; i < Math.min(titles.length, 4); i++) {
        const t = titles[i];
        noteRaw(diag, sourceName, t.title);
        if (!t.title || t.title.length < 4) continue;
        if (all.find(x => x.url === t.url)) continue;
        const detail = descs[i] || '';
        if (!isRelevantNews(t.title, detail) && !isLooseRelevantNews(t.title, detail)) { noteFiltered(diag, sourceName); continue; }
        noteAccepted(diag, sourceName, t.title);
        all.push({
          country: countryOf(t.title, detail),
          icon: '📰',
          title: t.title.slice(0, 60),
          detail: detail.slice(0, 200),
          url: t.url,
          source: sourceName,
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      // 静默跳过
    }
  }
  return all;
}

// ================================================================
//  核心刷新逻辑
// ================================================================

async function refreshInternal() {
  const items = [];
  const diag = {
    ok: false,
    message: '',
    sources: {},
    errors: [],
    keywords: getSearchKeywords(),
    refreshedAt: new Date().toISOString(),
    sourceStats: {},
    metasoUsage: { ...metasoDailyUsage },
  };

  // 0. 秘塔搜索（配置后优先）
  try {
    let metasoItems = [];
    if (canUseMetaso(diag)) {
      markMetasoCall();
      metasoItems = await fetchFromMetaso(diag);
    } else {
      const cfg = getNewsSourceConfig();
      if (!cfg.metasoEnabled) noteDiag(diag, 'metaso', 'skipped', '秘塔未启用，已跳过付费搜索源');
    }
    diag.sources.metaso = metasoItems.length;
    if (metasoItems.length > 0) {
      console.log(`[news-fetcher] 秘塔搜索: ${metasoItems.length} 条`);
      items.push(...metasoItems);
    }
  } catch (e) {
    noteDiag(diag, 'metaso', 'error', e.message);
    console.warn('[news-fetcher] 秘塔搜索失败:', e.message);
  }

  // 1. 新浪财经 (国内服务器友好, 免费)
  try {
    const sinaItems = await fetchAllSina(diag);
    diag.sources.sina = sinaItems.length;
    if (sinaItems.length > 0) {
      console.log(`[news-fetcher] 新浪财经: ${sinaItems.length} 条`);
      items.push(...sinaItems);
    }
  } catch (e) {
    noteDiag(diag, 'sina', 'error', e.message);
    console.warn('[news-fetcher] 新浪财经失败:', e.message);
  }

  // 2. 水果行业 RSS
  const rssResults = await Promise.allSettled(FRUIT_RSS.map(f => fetchRssFeed(f, diag)));
  for (const r of rssResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      console.log(`[news-fetcher] RSS: ${r.value.length} 条`);
      items.push(...r.value);
      diag.sources.rss = (diag.sources.rss || 0) + r.value.length;
    } else if (r.status === 'rejected') {
      noteDiag(diag, 'rss', 'error', r.reason && r.reason.message);
    }
  }

  // 3. 搜索引擎备选
  const engineResults = await Promise.allSettled([
    fetchFromEngine('sogou', 'https://news.sogou.com/news?query={kw}&mode=1&sort=0&page=1', {
      titleRegex: /<h3[^>]*>[^<]*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<p[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
      fallbackRegex: /<p[^>]*class="[^"]*star-wiki[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    }, diag),
    fetchFromEngine('toutiao', 'https://so.toutiao.com/search?dvpf=pc&source=input&keyword={kw}', {
      titleRegex: /<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<span[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      fallbackRegex: /<div[^>]*class="[^"]*s-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    }, diag),
  ]);
  for (const r of engineResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      items.push(...r.value);
      diag.sources.engine = (diag.sources.engine || 0) + r.value.length;
    } else if (r.status === 'rejected') {
      noteDiag(diag, 'engine', 'error', r.reason && r.reason.message);
    }
  }

  // 去重
  const seen = new Set();
  const deduped = [];
  for (const item of items) {
    const key = item.title.slice(0, 25);
    if (!seen.has(key)) {
      seen.add(key);
      if (!item.id) item.id = `auto-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      deduped.push(item);
    }
  }

  cachedNews = deduped.slice(0, CONFIG.MAX_ITEMS);
  lastFetchedAt = new Date();

  const bySource = {};
  cachedNews.forEach(n => { bySource[n.source] = (bySource[n.source] || 0) + 1; });
  diag.ok = cachedNews.length > 0;
  diag.sources = { ...diag.sources, final: bySource };
  diag.metasoUsage = { ...metasoDailyUsage };
  diag.message = cachedNews.length
    ? `刷新完成：${cachedNews.length} 条`
    : '免费新闻源暂未抓到可展示新闻。可放宽关键词，或稍后重试；秘塔付费源默认关闭。';
  lastRefreshDiagnostics = diag;
  appendNewsLog(diag);
  console.log(`[news-fetcher] 刷新完成: ${cachedNews.length} 条 (${JSON.stringify(bySource)})`);

  return cachedNews;
}

// ================================================================
//  公开 API
// ================================================================

function getAutoNews() { return cachedNews; }
function getLastFetchedTime() { return lastFetchedAt; }
function getNewsSourceSummary() {
  const bySource = {};
  cachedNews.forEach(n => { bySource[n.source || 'unknown'] = (bySource[n.source || 'unknown'] || 0) + 1; });
  return bySource;
}
function getRefreshDiagnostics() { return lastRefreshDiagnostics; }
function refreshNow() { return refreshInternal(); }

function initNewsFetcher() {
  setTimeout(() => {
    refreshInternal().catch(e => console.warn('[news-fetcher] 初始化失败:', e.message));
  }, 3000);

  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshInternal().catch(e => console.warn('[news-fetcher] 定时刷新失败:', e.message));
  }, CONFIG.REFRESH_INTERVAL_MS);

  console.log(`[news-fetcher] 已启动，刷新间隔 ${CONFIG.REFRESH_INTERVAL_MS / 60000} 分钟`);
}

function stopNewsFetcher() {
  if (refreshTimer) { clearInterval(refreshTimer); refreshTimer = null; }
}

module.exports = { initNewsFetcher, stopNewsFetcher, getAutoNews, getLastFetchedTime, getNewsSourceSummary, getRefreshDiagnostics, refreshNow };
