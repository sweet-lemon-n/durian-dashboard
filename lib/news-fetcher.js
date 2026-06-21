/**
 * 新闻自动抓取 & 数据驱动新闻生成
 *
 * 两套来源：
 *   1. 数据驱动：基于 /api/aggregate 的实际数据自动生成新闻摘要（始终可用）
 *   2. 外部抓取：从百度资讯等源抓取榴莲相关热点（网络可达时补充）
 *
 * 用法：
 *   const { initNewsFetcher, getAutoNews, refreshNow } = require('./news-fetcher');
 *   initNewsFetcher();                          // 启动定时刷新
 *   const news = getAutoNews();                 // 获取当前缓存
 *   await refreshNow(aggregateData);            // 强制立即刷新（传入当前 aggregate）
 */

const axios = require('axios');
const https = require('https');

// ── 配置 ──────────────────────────────────────────────
const CONFIG = {
  REFRESH_INTERVAL_MS: 30 * 60 * 1000, // 每 30 分钟自动刷新一次
  EXTERNAL_TIMEOUT_MS: 8000,           // 外部请求超时
  MAX_AUTO_NEWS: 12,                   // 最多保留多少条自动新闻
};

// ── 缓存 ──────────────────────────────────────────────
let cachedNews = [];          // [{ id, country, icon, title, detail, source, url, fetchedAt }]
let lastFetchedAt = null;
let refreshTimer = null;
let lastAggregate = null;     // 最近一次 aggregate 引用，用于数据驱动生成

// ================================================================
//  外部新闻抓取（百度资讯搜索）
// ================================================================

/**
 * 从百度资讯搜索抓取榴莲相关新闻
 * 返回归一化的新闻条目数组，失败返回空数组
 */
/**
 * 通用 HTML 新闻抓取：从搜索结果页提取标题/摘要/URL
 * @param {string} searchUrl - 搜索页 URL（含关键词占位符 {kw}）
 * @param {object} patterns - 正则提取模式 { titleRegex, descRegex, fallbackDescRegex }
 */
async function fetchFromSearchEngine(sourceName, searchUrl, patterns) {
  const keywords = ['榴莲进口', '榴莲价格', '泰国榴莲', '越南榴莲'];
  const allItems = [];

  for (const kw of keywords) {
    try {
      const url = searchUrl.replace('{kw}', encodeURIComponent(kw));
      const resp = await axios.get(url, {
        timeout: CONFIG.EXTERNAL_TIMEOUT_MS,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml',
          'Accept-Language': 'zh-CN,zh;q=0.9',
        },
        httpsAgent: new https.Agent({ rejectUnauthorized: false }),
      });

      const html = resp.data;

      let match;
      const titles = [];
      while ((match = patterns.titleRegex.exec(html)) !== null) {
        titles.push({
          url: match[1],
          title: match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim(),
        });
      }

      const descs = [];
      while ((match = patterns.descRegex.exec(html)) !== null) {
        descs.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim());
      }
      if (descs.length === 0 && patterns.fallbackDescRegex) {
        while ((match = patterns.fallbackDescRegex.exec(html)) !== null) {
          descs.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').trim());
        }
      }

      for (let i = 0; i < Math.min(titles.length, 5); i++) {
        const t = titles[i];
        if (!t.title || t.title.length < 4) continue;
        const isVN = /越南/i.test(t.title + (descs[i] || ''));
        allItems.push({
          country: isVN ? 'VN' : 'TH',
          icon: '📰',
          title: t.title.slice(0, 60),
          detail: (descs[i] || '点击查看详情').slice(0, 200),
          url: t.url,
          source: sourceName,
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn(`[news-fetcher] ${sourceName}「${kw}」失败:`, e.message);
    }
  }

  return allItems;
}

// ── 百度资讯 ──
async function fetchBaiduNews() {
  return fetchFromSearchEngine('baidu',
    'https://news.baidu.com/ns?word={kw}&pn=0&rn=5&cl=2&ct=0&tn=news&ie=utf-8',
    {
      titleRegex: /<h3[^>]*class="[^"]*news-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<div[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/div>/gi,
      fallbackDescRegex: /<span[^>]*class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi,
    });
}

// ── 搜狗新闻（备选）──
async function fetchSogouNews() {
  return fetchFromSearchEngine('sogou',
    'https://news.sogou.com/news?query={kw}&mode=1&sort=0&page=1',
    {
      titleRegex: /<h3[^>]*class="[^"]*vr-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi,
      descRegex: /<p[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
      fallbackDescRegex: /<p[^>]*class="[^"]*star-wiki[^"]*"[^>]*>([\s\S]*?)<\/p>/gi,
    });
}

// ================================================================
//  核心：合并 & 缓存
// ================================================================

async function refreshInternal(aggregate) {
  if (aggregate) lastAggregate = aggregate;

  const now = new Date();
  const items = [];

  // 多源并行抓取
  const results = await Promise.allSettled([
    fetchBaiduNews(),
    fetchSogouNews(),
  ]);
  for (const r of results) {
    if (r.status === 'fulfilled' && r.value.length > 0) {
      items.push(...r.value);
    }
  }
  if (items.length === 0) {
    console.warn('[news-fetcher] 所有新闻源均未返回结果（百度/搜狗可能限制了服务器 IP）');
  }

  // 去重
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = item.title.slice(0, 20);
    if (!seen.has(key)) {
      seen.add(key);
      if (!item.id) {
        item.id = `auto-${item.country}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      deduped.push(item);
    }
  }

  cachedNews = deduped.slice(0, CONFIG.MAX_AUTO_NEWS);
  lastFetchedAt = now;

  console.log(`[news-fetcher] 刷新完成：${cachedNews.length} 条外部新闻`);
  return cachedNews;
}

// ================================================================
//  公开 API
// ================================================================

function getAutoNews() {
  return cachedNews;
}

function getLastFetchedTime() {
  return lastFetchedAt;
}

async function refreshNow(aggregate) {
  return refreshInternal(aggregate);
}

function initNewsFetcher(aggregate) {
  // 首次立即刷新
  refreshInternal(aggregate).catch(e => console.warn('[news-fetcher] 初始化失败:', e.message));

  // 定时刷新
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    refreshInternal(null).catch(e => console.warn('[news-fetcher] 定时刷新失败:', e.message));
  }, CONFIG.REFRESH_INTERVAL_MS);

  console.log(`[news-fetcher] 已启动，刷新间隔 ${CONFIG.REFRESH_INTERVAL_MS / 60000} 分钟`);
}

function stopNewsFetcher() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
    console.log('[news-fetcher] 已停止');
  }
}

module.exports = {
  initNewsFetcher,
  stopNewsFetcher,
  getAutoNews,
  getLastFetchedTime,
  refreshNow,
};
