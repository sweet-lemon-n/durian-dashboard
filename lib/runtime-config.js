const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', 'data', 'runtime-config.json');
const DEFAULT_NEWS_KEYWORDS = [
  '榴莲进口',
  '榴莲价格',
  '泰国榴莲',
  '越南榴莲',
  '冷冻榴莲',
  '榴莲 通关 口岸',
  '磨憨 榴莲',
  '凭祥 榴莲',
];

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
    keywords: cfg.keywords,
    hasMetasoMcpApiKey: !!cfg.metasoMcpApiKey,
    hasMetasoApiKey: !!cfg.metasoApiKey,
  };
}

function updateNewsSourceConfig(input) {
  const cfg = readRuntimeConfig();
  const prev = cfg.newsSource || {};
  cfg.newsSource = {
    ...prev,
    metasoMcpUrl: String(input.metasoMcpUrl || '').trim(),
    metasoApiUrl: String(input.metasoApiUrl || '').trim(),
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

module.exports = {
  FILE,
  DEFAULT_NEWS_KEYWORDS,
  getNewsSourceConfig,
  getPublicNewsSourceConfig,
  updateNewsSourceConfig,
};
