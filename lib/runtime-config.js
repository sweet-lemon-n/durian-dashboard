const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'runtime-config.json');
const DEFAULT_NEWS_KEYWORDS = [
  '榴莲进口',
  '榴莲价格',
  '东南亚 榴莲',
  '泰国 越南 榴莲 出口 中国',
  '马来西亚 榴莲 中国',
  '菲律宾 榴莲 中国',
  '冷冻榴莲',
  '榴莲 通关 口岸',
  '榴莲 海关 查验',
  '榴莲 关税 政策',
  '榴莲 冷链 物流',
  '东盟 水果 口岸',
  '磨憨 榴莲',
  '凭祥 榴莲',
];

const DEFAULT_DASHBOARD_STATS_CONFIG = {
  deliveryNumerator: 'arrived',
  deliveryDenominator: 'orderBoxes',
  detailDedup: 'categoryContainer',
  hideZeroBoxRows: true,
};

const VALID_DASHBOARD_STATS_OPTIONS = {
  deliveryNumerator: ['arrived', 'signed', 'shipped', 'detailed'],
  deliveryDenominator: ['orderBoxes', 'detailRows'],
  detailDedup: ['categoryContainer', 'record'],
};

function readRuntimeConfig() {
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch (_) {
    return {};
  }
}

function writeRuntimeConfig(config) {
  const dir = path.dirname(FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const tmp = FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), 'utf-8');
  fs.renameSync(tmp, FILE);
}

function maskSecret(value) {
  if (!value) return '';
  const s = String(value);
  if (s.length <= 8) return '********';
  return `${s.slice(0, 4)}****${s.slice(-4)}`;
}

function getNewsSourceConfig() {
  const cfg = readRuntimeConfig();
  const news = cfg.newsSource || {};
  const envKeywords = process.env.NEWS_SEARCH_KEYWORDS
    ? process.env.NEWS_SEARCH_KEYWORDS.split(/[,，\n]/).map(s => s.trim()).filter(Boolean)
    : null;
  return {
    metasoMcpUrl: news.metasoMcpUrl || process.env.METASO_MCP_URL || '',
    metasoMcpApiKey: news.metasoMcpApiKey || process.env.METASO_MCP_API_KEY || '',
    metasoApiKey: news.metasoApiKey || process.env.METASO_API_KEY || '',
    metasoApiUrl: news.metasoApiUrl || process.env.METASO_API_URL || '',
    metasoEnabled: news.metasoEnabled === true || process.env.METASO_ENABLED === 'true',
    metasoDailyLimit: Number(news.metasoDailyLimit ?? process.env.METASO_DAILY_LIMIT ?? 0),
    metasoCooldownMinutes: Number(news.metasoCooldownMinutes ?? process.env.METASO_COOLDOWN_MINUTES ?? 60),
    keywords: Array.isArray(news.keywords) && news.keywords.length ? news.keywords : (envKeywords || DEFAULT_NEWS_KEYWORDS),
  };
}

function getPublicNewsSourceConfig() {
  const cfg = getNewsSourceConfig();
  return {
    metasoMcpUrl: cfg.metasoMcpUrl,
    metasoMcpApiKeyMasked: maskSecret(cfg.metasoMcpApiKey),
    metasoApiKeyMasked: maskSecret(cfg.metasoApiKey),
    metasoApiUrl: cfg.metasoApiUrl,
    metasoEnabled: cfg.metasoEnabled,
    metasoDailyLimit: cfg.metasoDailyLimit,
    metasoCooldownMinutes: cfg.metasoCooldownMinutes,
    keywords: cfg.keywords,
    hasMetasoMcpApiKey: !!cfg.metasoMcpApiKey,
    hasMetasoApiKey: !!cfg.metasoApiKey,
  };
}

function getAiImportConfig() {
  const cfg = readRuntimeConfig();
  const ai = cfg.aiImport || {};
  return {
    provider: ai.provider || process.env.AI_IMPORT_PROVIDER || 'deepseek',
    baseUrl: ai.baseUrl || process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com',
    apiKey: ai.apiKey || process.env.DEEPSEEK_API_KEY || '',
    model: ai.model || process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash',
    temperature: Number(ai.temperature ?? process.env.DEEPSEEK_TEMPERATURE ?? 0.1),
  };
}

function getPublicAiImportConfig() {
  const cfg = getAiImportConfig();
  return {
    provider: cfg.provider,
    baseUrl: cfg.baseUrl,
    model: cfg.model,
    temperature: cfg.temperature,
    apiKeyMasked: maskSecret(cfg.apiKey),
    hasApiKey: !!cfg.apiKey,
  };
}

function updateAiImportConfig(input) {
  const cfg = readRuntimeConfig();
  const prev = cfg.aiImport || {};
  cfg.aiImport = {
    ...prev,
    provider: 'deepseek',
    baseUrl: String(input.baseUrl || prev.baseUrl || 'https://api.deepseek.com').trim(),
    model: String(input.model || prev.model || 'deepseek-v4-flash').trim(),
    temperature: Math.max(0, Math.min(2, Number(input.temperature ?? prev.temperature ?? 0.1))),
  };
  if (Object.prototype.hasOwnProperty.call(input, 'apiKey') && String(input.apiKey || '').trim()) {
    cfg.aiImport.apiKey = String(input.apiKey).trim();
  }
  if (input.clearApiKey) cfg.aiImport.apiKey = '';
  cfg.aiImport.updatedAt = new Date().toISOString();
  writeRuntimeConfig(cfg);
  return getPublicAiImportConfig();
}

function updateNewsSourceConfig(input) {
  const cfg = readRuntimeConfig();
  const prev = cfg.newsSource || {};
  cfg.newsSource = {
    ...prev,
    metasoMcpUrl: String(input.metasoMcpUrl || '').trim(),
    metasoApiUrl: String(input.metasoApiUrl || '').trim(),
    metasoEnabled: input.metasoEnabled === true,
    metasoDailyLimit: Math.max(0, Number(input.metasoDailyLimit) || 0),
    metasoCooldownMinutes: Math.max(0, Number(input.metasoCooldownMinutes) || 0),
  };
  if (Object.prototype.hasOwnProperty.call(input, 'keywords')) {
    const keywords = Array.isArray(input.keywords)
      ? input.keywords
      : String(input.keywords || '').split(/[,，\n]/);
    cfg.newsSource.keywords = keywords.map(s => String(s).trim()).filter(Boolean);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'metasoMcpApiKey') && String(input.metasoMcpApiKey || '').trim()) {
    cfg.newsSource.metasoMcpApiKey = String(input.metasoMcpApiKey).trim();
  }
  if (Object.prototype.hasOwnProperty.call(input, 'metasoApiKey') && String(input.metasoApiKey || '').trim()) {
    cfg.newsSource.metasoApiKey = String(input.metasoApiKey).trim();
  }
  if (input.clearMetasoMcpApiKey) cfg.newsSource.metasoMcpApiKey = '';
  if (input.clearMetasoApiKey) cfg.newsSource.metasoApiKey = '';
  cfg.newsSource.updatedAt = new Date().toISOString();
  writeRuntimeConfig(cfg);
  return getPublicNewsSourceConfig();
}

function normalizeDashboardStatsConfig(input = {}) {
  const prev = input && typeof input === 'object' ? input : {};
  const out = { ...DEFAULT_DASHBOARD_STATS_CONFIG };
  Object.keys(VALID_DASHBOARD_STATS_OPTIONS).forEach((key) => {
    if (VALID_DASHBOARD_STATS_OPTIONS[key].includes(prev[key])) out[key] = prev[key];
  });
  if (Object.prototype.hasOwnProperty.call(prev, 'hideZeroBoxRows')) {
    out.hideZeroBoxRows = prev.hideZeroBoxRows === true;
  }
  return out;
}

function getDashboardStatsConfig() {
  const cfg = readRuntimeConfig();
  return normalizeDashboardStatsConfig(cfg.dashboardStats || {});
}

function getPublicDashboardStatsConfig() {
  return getDashboardStatsConfig();
}

function updateDashboardStatsConfig(input) {
  const cfg = readRuntimeConfig();
  cfg.dashboardStats = {
    ...normalizeDashboardStatsConfig(input || {}),
    updatedAt: new Date().toISOString(),
  };
  writeRuntimeConfig(cfg);
  return getPublicDashboardStatsConfig();
}

module.exports = {
  FILE,
  DEFAULT_NEWS_KEYWORDS,
  DEFAULT_DASHBOARD_STATS_CONFIG,
  getNewsSourceConfig,
  getPublicNewsSourceConfig,
  updateNewsSourceConfig,
  getAiImportConfig,
  getPublicAiImportConfig,
  updateAiImportConfig,
  getDashboardStatsConfig,
  getPublicDashboardStatsConfig,
  updateDashboardStatsConfig,
};
