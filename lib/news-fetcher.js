/**
 * 新闻自动抓取 — 多源聚合
 *
 * 源优先级：
 *   1. 新浪财经公开 JSON API (免费, 无需 Key, 国内服务器友好)
 *   2. 水果行业 RSS 直接抓取
 *   3. 搜索引擎 HTML 抓取 (备选)
 *
 * 用法：
 *   const { initNewsFetcher, getAutoNews, refreshNow } = require('./news-fetcher');
 */

const axios = require('axios');
const https = require('https');

const CONFIG = {
  REFRESH_INTERVAL_MS: 30 * 60 * 1000,
  TIMEOUT_MS: 10000,
  MAX_ITEMS: 12,
};

let cachedNews = [];
let lastFetchedAt = null;
let refreshTimer = null;

// ================================================================
//  源 1: 新浪财经公开 JSON API
//  免费、无需 Key、国内服务器不会被拦
// ================================================================

/** 新浪财经频道 lid 映射 */
const SINA_LIDS = [
  { lid: '2516', name: '期货' },    // 农产品期货相关
  { lid: '2509', name: '财经' },
  { lid: '2510', name: '国内' },
];

/** 水果/农产品/进口 关键词 */
const FRUIT_KW = /榴莲|山竹|龙眼|火龙果|水果进口|东盟水果|友谊关|凭祥|磨憨|蛇口|泰国水果|越南水果|冷链|农产品进口/i;

async function fetchSinaFeed(lid, count) {
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
      const title = (item.title || '').replace(/<[^>]+>/g, '').trim();
      if (!title || title.length < 6) continue;
      if (!FRUIT_KW.test(title)) continue;

      const isVN = /越南/i.test(title);
      results.push({
        country: isVN ? 'VN' : 'TH',
        icon: '📰',
        title: title.slice(0, 60),
        detail: (item.intro || item.keywords || '').replace(/<[^>]+>/g, '').trim().slice(0, 200),
        url: item.url || `https://finance.sina.com.cn/search/?q=${encodeURIComponent(title)}`,
        source: 'sina',
        fetchedAt: new Date().toISOString(),
      });
    }

    return results;
  } catch (e) {
    console.warn(`[news-fetcher] 新浪财经 lid=${lid} 失败:`, e.message);
    return [];
  }
}

async function fetchAllSina() {
  const all = [];
  const results = await Promise.allSettled(SINA_LIDS.map(l => fetchSinaFeed(l.lid, 30)));
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
        title: title.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
        link: link.replace(/<[^>]+>/g, '').trim(),
        desc: desc.replace(/<[^>]+>/g, '').replace(/<!\[CDATA\[|\]\]>/g, '').trim(),
      });
    }
  }
  return items;
}

async function fetchRssFeed(feedUrl) {
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
      if (!item.title || item.title.length < 6) continue;
      const isVN = /越南/i.test(item.title);
      results.push({
        country: isVN ? 'VN' : 'TH',
        icon: '📰',
        title: item.title.slice(0, 60),
        detail: item.desc.slice(0, 200),
        url: item.link,
        source: 'rss',
        fetchedAt: new Date().toISOString(),
      });
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

async function fetchFromEngine(sourceName, searchUrl, patterns) {
  const keywords = ['榴莲进口', '榴莲价格', '泰国榴莲'];
  const all = [];

  for (const kw of keywords) {
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
        titles.push({ url: m[1], title: m[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim() });
      }

      const descs = [];
      while ((m = patterns.descRegex.exec(html)) !== null) {
        descs.push(m[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim());
      }
      if (!descs.length && patterns.fallbackRegex) {
        while ((m = patterns.fallbackRegex.exec(html)) !== null) {
          descs.push(m[1].replace(/<[^>]+>/g, '').trim());
        }
      }

      for (let i = 0; i < Math.min(titles.length, 2); i++) {
        const t = titles[i];
        if (!t.title || t.title.length < 4) continue;
        if (all.find(x => x.url === t.url)) continue;
        const isVN = /越南/i.test(t.title);
        all.push({
          country: isVN ? 'VN' : 'TH',
          icon: '📰',
          title: t.title.slice(0, 60),
          detail: (descs[i] || '').slice(0, 200),
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

  // 1. 新浪财经 (国内服务器友好, 免费)
  try {
    const sinaItems = await fetchAllSina();
    if (sinaItems.length > 0) {
      console.log(`[news-fetcher] 新浪财经: ${sinaItems.length} 条`);
      items.push(...sinaItems);
    }
  } catch (e) {
    console.warn('[news-fetcher] 新浪财经失败:', e.message);
  }

  // 2. 水果行业 RSS
  const rssResults = await Promise.allSettled(FRUIT_RSS.map(f => fetchRssFeed(f)));
  for (const r of rssResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      console.log(`[news-fetcher] RSS: ${r.value.length} 条`);
      items.push(...r.value);
    }
  }

  // 3. 搜索引擎备选
  const engineResults = await Promise.allSettled([
    fetchFromEngine('sogou', 'https://news.sogou.com/news?query={kw}&mode=1&sort=0&page=1', {
      titleRegex: /<h3[^>]*>[^<]*<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<p[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
      fallbackRegex: /<p[^>]*class="[^"]*star-wiki[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    }),
    fetchFromEngine('toutiao', 'https://so.toutiao.com/search?dvpf=pc&source=input&keyword={kw}', {
      titleRegex: /<a[^>]*class="[^"]*title[^"]*"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<span[^>]*class="[^"]*abstract[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
      fallbackRegex: /<div[^>]*class="[^"]*s-abstract[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
    }),
  ]);
  for (const r of engineResults) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      items.push(...r.value);
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
  console.log(`[news-fetcher] 刷新完成: ${cachedNews.length} 条 (${JSON.stringify(bySource)})`);

  return cachedNews;
}

// ================================================================
//  公开 API
// ================================================================

function getAutoNews() { return cachedNews; }
function getLastFetchedTime() { return lastFetchedAt; }
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

module.exports = { initNewsFetcher, stopNewsFetcher, getAutoNews, getLastFetchedTime, refreshNow };
