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
//  数据驱动新闻生成（基于 aggregate 数据，始终可用）
// ================================================================

function generateDataDrivenNews(aggregate) {
  if (!aggregate) return [];
  const items = [];
  const now = new Date();

  const { th, vn, logistics } = aggregate;
  const L = logistics || {};
  const kpis = L.kpis || {};
  const portDelays = L.portDelays || [];
  const containers = L.inTransitContainers || [];

  // ── 泰国 ──
  if (th) {
    const thFresh = th.rows.filter(r => r.category === 'FRESH');
    const thFrozen = th.rows.filter(r => r.category === 'FROZEN');

    items.push({
      country: 'TH',
      icon: '📊',
      title: `泰国交付率 ${th.rate}%`,
      detail: `累计 **${th.boxes} 柜**，已交付 **${th.delivered} 柜**，在途 **${th.transit} 柜**，待发 **${th.pending} 柜**。${th.rate >= 50 ? '交付进度过半，势头良好。' : '仍需关注后续发运节奏。'}`,
      source: 'data',
    });

    if (thFresh.length > 0) {
      const top = thFresh.sort((a, b) => {
        const ra = (Number(a.delivered) || 0) / (Number(a.boxes) || 1);
        const rb = (Number(b.delivered) || 0) / (Number(b.boxes) || 1);
        return rb - ra;
      })[0];
      const topRate = ((Number(top.delivered) || 0) / (Number(top.boxes) || 1) * 100).toFixed(1);
      items.push({
        country: 'TH',
        icon: '🏆',
        title: `鲜果品牌「${top.brand}」交付领先`,
        detail: `已交付 **${top.delivered}/${top.boxes} 柜**（${topRate}%），在途 **${top.transit || 0} 柜**。`,
        source: 'data',
      });
    }
  }

  // ── 越南 ──
  if (vn) {
    items.push({
      country: 'VN',
      icon: '📊',
      title: `越南签收率 ${vn.rate}%`,
      detail: `累计 **${vn.boxes} 柜**，已签收 **${vn.signed} 柜**，已交付 **${vn.delivered} 柜**，口岸 **${vn.port} 柜**，在途 **${vn.transit} 柜**。${vn.port > 5 ? '口岸积压需关注。' : '通关节奏正常。'}`,
      source: 'data',
    });
  }

  // ── 温度 & 物流 ──
  const avgTemp = Number(kpis.avgReturnTemp) || 0;
  const alarms = Number(kpis.tempAlarms) || 0;
  const inTransit = Number(kpis.inTransit) || 0;

  if (alarms > 0) {
    items.push({
      country: 'TH',
      icon: '🌡️',
      title: `温度异常 ${alarms} 条`,
      detail: `在途 **${inTransit} 柜**中检测到 **${alarms} 条**温度异常记录，平均回风温度 **${avgTemp.toFixed(1)}°C**。${alarms >= 3 ? '⚠️ 建议立即核查异常柜号。' : '持续监控中。'}`,
      source: 'data',
    });
  } else if (inTransit > 0) {
    items.push({
      country: 'TH',
      icon: '✅',
      title: `在途 ${inTransit} 柜温度正常`,
      detail: `当前在途 **${inTransit} 柜**，平均回风温度 **${avgTemp.toFixed(1)}°C**，无温度异常记录。冷链运行平稳。`,
      source: 'data',
    });
  }

  // ── 关口滞留 ──
  if (portDelays.length > 0) {
    const maxDelay = portDelays.reduce((m, r) => Math.max(m, Number(r.delayDays) || 0), 0);
    items.push({
      country: 'VN',
      icon: '🚨',
      title: `关口滞留 ${portDelays.length} 柜，最长 ${maxDelay.toFixed(1)} 天`,
      detail: portDelays.map(r => `${r.container}（${r.route || '未知路线'}）${Number(r.delayDays || 0).toFixed(1)}天`).join('、'),
      source: 'data',
    });
  }

  // ── 总体摘要 ──
  if (th && vn) {
    const totalBoxes = (th.boxes || 0) + (vn.boxes || 0);
    const totalDone = (th.delivered || 0) + (th.signed || 0) + (vn.delivered || 0) + (vn.signed || 0);
    const overallRate = totalBoxes > 0 ? (totalDone / totalBoxes * 100).toFixed(1) : '0';
    items.push({
      country: 'TH',
      icon: '🌴',
      title: `泰越双国产季总览`,
      detail: `合计 **${totalBoxes} 柜**，累计完成 **${totalDone} 柜**（${overallRate}%），在途+口岸 **${(th.transit||0)+(th.port||0)+(vn.transit||0)+(vn.port||0)} 柜**，待发 **${(th.pending||0)+(vn.pending||0)} 柜**。`,
      source: 'data',
    });
  }

  // 打时间戳
  return items.map(it => ({
    ...it,
    id: `auto-${it.country}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    fetchedAt: now.toISOString(),
  }));
}

// ================================================================
//  外部新闻抓取（百度资讯搜索）
// ================================================================

/**
 * 从百度资讯搜索抓取榴莲相关新闻
 * 返回归一化的新闻条目数组，失败返回空数组
 */
async function fetchBaiduNews() {
  const keywords = ['榴莲进口', '榴莲价格', '泰国榴莲', '越南榴莲'];
  const allItems = [];

  for (const kw of keywords) {
    try {
      const url = `https://news.baidu.com/ns?word=${encodeURIComponent(kw)}&pn=0&rn=5&cl=2&ct=0&tn=news&ie=utf-8`;
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
      // 解析百度新闻搜索结果 —— 提取标题和摘要
      // 百度新闻搜索结果格式：<h3 class="news-title_1YtI1"><a>标题</a></h3>
      // 摘要通常在相邻的 <div class="news-desc_3zWK9"> 或 <span class="news-content_3EJbA">
      const titleRegex = /<h3[^>]*class="[^"]*news-title[^"]*"[^>]*>[\s\S]*?<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const descRegex = /<div[^>]*class="[^"]*news-desc[^"]*"[^>]*>([\s\S]*?)<\/div>/gi;
      const contentRegex = /<span[^>]*class="[^"]*news-content[^"]*"[^>]*>([\s\S]*?)<\/span>/gi;

      let match;
      const titles = [];
      while ((match = titleRegex.exec(html)) !== null) {
        titles.push({
          url: match[1],
          title: match[2].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim(),
        });
      }

      const descs = [];
      while ((match = descRegex.exec(html)) !== null) {
        descs.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
      }
      if (descs.length === 0) {
        while ((match = contentRegex.exec(html)) !== null) {
          descs.push(match[1].replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim());
        }
      }

      // 合并标题和摘要
      for (let i = 0; i < Math.min(titles.length, 5); i++) {
        const t = titles[i];
        if (!t.title || t.title.length < 4) continue;
        // 判断国家归属
        const isVN = /越南/i.test(t.title + (descs[i] || ''));
        allItems.push({
          country: isVN ? 'VN' : 'TH',
          icon: '📰',
          title: t.title.slice(0, 60),
          detail: (descs[i] || '点击查看详情').slice(0, 200),
          url: t.url,
          source: 'baidu',
          fetchedAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      // 单个关键词失败不影响其他
      console.warn(`[news-fetcher] 百度搜索「${kw}」失败:`, e.message);
    }
  }

  return allItems;
}

// ================================================================
//  核心：合并 & 缓存
// ================================================================

async function refreshInternal(aggregate) {
  if (aggregate) lastAggregate = aggregate;

  const now = new Date();
  const items = [];

  // 1. 数据驱动新闻（始终生成）
  const dataNews = generateDataDrivenNews(lastAggregate);
  items.push(...dataNews);

  // 2. 外部新闻（网络可达时补充）
  try {
    const external = await fetchBaiduNews();
    if (external.length > 0) {
      items.push(...external);
    }
  } catch (e) {
    console.warn('[news-fetcher] 外部新闻抓取失败，仅使用数据驱动新闻');
  }

  // 去重（按 title 相似度 > 80% 去重，保留先出现的）
  const deduped = [];
  const seen = new Set();
  for (const item of items) {
    const key = item.title.slice(0, 20);
    if (!seen.has(key)) {
      seen.add(key);
      // 为外部新闻补上 id
      if (!item.id) {
        item.id = `auto-${item.country}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      }
      deduped.push(item);
    }
  }

  cachedNews = deduped.slice(0, CONFIG.MAX_AUTO_NEWS);
  lastFetchedAt = now;

  console.log(`[news-fetcher] 刷新完成：${cachedNews.length} 条自动新闻（${dataNews.length} 条数据驱动 + ${items.length - dataNews.length} 条外部抓取）`);
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
