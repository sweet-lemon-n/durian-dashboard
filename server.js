/**
 * 榴莲运输温度监控看板 — 后端服务
 *
 * 启动: node server.js
 * 依赖: .env 文件中配置 CORPID, CORPSECRET, DOCID
 */

require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const axios = require('axios');
const wecom = require('./lib/wecom');
const wecomCrypto = require('./lib/crypto');
const {
  initDatabase,
  getDb,
  createUser,
  updateUser,
  listUsers,
  incrementTokenVersion,
  normalizePermissions,
  stringifyPermissions,
  normalizeDashboardPermissions,
  stringifyDashboardPermissions,
} = require('./lib/db');
const {
  generateToken,
  setAuthCookie,
  clearAuthCookie,
  requireAuth,
  requireRole,
  requirePermission,
} = require('./lib/auth');
const { router: boardRouter } = require('./lib/board-routes');
const { initNewsFetcher } = require('./lib/news-fetcher');
const wecomCache = require('./lib/wecom-cache');
const { getAiImportConfig, getPublicAiImportConfig, updateAiImportConfig } = require('./lib/runtime-config');

const app = express();
const PORT = process.env.PORT || 3000;
const DOCID = process.env.DOCID;

// 初始化 SQLite 数据库
const DB_PATH = path.join(__dirname, 'data', 'auth.db');
initDatabase(DB_PATH);

// ---- 缓存：表格结构（避免每次请求都查企微API） ----

let schemaCache = {
  data: null,         // { sheets: [...], detected: { tempSheet, infoSheet } }
  expiresAt: 0,
};

const SCHEMA_CACHE_TTL = 5 * 60 * 1000; // 5 分钟
const COUNTRY_NAME_MAP = { TH: '泰国', VN: '越南' };
const CATEGORY_LABEL_MAP = { FRESH: ['鲜果', '鲜'], FROZEN: ['冻果', '冻肉', '冻'] };
const DRILL_CONTAINER_SHEETS = ['温度记录', '陆运明细', '海运明细', '分柜明细表', '国内段明细', '海运国内', '订单主表'];

function normalizeImportText(text) {
  return String(text || '')
    .replace(/\r/g, '\n')
    .replace(/[：﹕]/g, ':')
    .replace(/[℃]/g, '°C')
    .replace(/[‘’']/g, '')
    .replace(/\u00a0/g, ' ')
    .trim();
}

function parseImportDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const now = new Date();
  let m = raw.match(/(\d{4})[\/\-.年](\d{1,2})[\/\-.月](\d{1,2})日?\s*(\d{1,2})(?::|\.|点|时)(\d{1,2})?/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(m[4]), Number(m[5] || 0));
  m = raw.match(/(\d{1,2})[\/\-.月](\d{1,2})日?\s*(\d{1,2})(?::|\.|点|时)(\d{1,2})?/);
  if (m) return new Date(now.getFullYear(), Number(m[1]) - 1, Number(m[2]), Number(m[3]), Number(m[4] || 0));
  m = raw.match(/(\d{1,2})(?::|\.|点|时)(\d{1,2})/);
  if (m) return new Date(now.getFullYear(), now.getMonth(), now.getDate(), Number(m[1]), Number(m[2]));
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

function formatImportDate(d) {
  if (!d || Number.isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function isKnownWritableField(field, rawValue) {
  const type = String(field?.field_type || field?.type || '').toUpperCase();
  const title = field?.field_title || field?.title || '';
  if (!type) return ['设定温度', '送风温度', '回风温度', '放柜时间', '更新时间'].includes(title) || rawValue !== '';
  return type.includes('TEXT') || type.includes('NUMBER') || type.includes('DATE') || type.includes('SELECT') || type.includes('REFERENCE') || type.includes('RECORD') || type.includes('RELATION');
}

function makeCellValue(field, rawValue) {
  const type = String(field?.field_type || field?.type || '').toUpperCase();
  const title = field?.field_title || field?.title || '';
  if (rawValue === null || rawValue === undefined || rawValue === '') return undefined;
  if (!isKnownWritableField(field, rawValue)) return undefined;
  if (type.includes('REFERENCE') || type.includes('RECORD') || type.includes('RELATION')) {
    const ids = String(rawValue).split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
    return ids.length ? ids.map(record_id => ({ record_id })) : undefined;
  }
  if (type.includes('NUMBER') || (!type && ['设定温度', '送风温度', '回风温度'].includes(title))) {
    const n = Number(rawValue);
    return Number.isFinite(n) ? n : undefined;
  }
  if (type.includes('DATE') || (!type && ['放柜时间', '更新时间'].includes(title))) {
    const d = rawValue instanceof Date ? rawValue : parseImportDate(rawValue);
    return d && !Number.isNaN(d.getTime()) ? String(d.getTime()) : undefined;
  }
  if (type.includes('SELECT')) return [{ text: String(rawValue).trim() }];
  return [{ type: 'text', text: String(rawValue).trim() }];
}

function makeEmptyCellValue(field) {
  const type = String(field?.field_type || field?.type || '').toUpperCase();
  if (type.includes('NUMBER')) return null;
  if (type.includes('REFERENCE') || type.includes('RECORD') || type.includes('RELATION') || type.includes('SELECT')) return [];
  return '';
}

function buildAiImportSchema(schema) {
  return (schema.sheets || []).map(sheet => ({
    sheetId: sheet.sheet_id,
    title: sheet.title,
    fields: (sheet.fields || []).map(f => ({
      title: f.field_title,
      fieldId: f.field_id,
      fieldType: f.field_type,
    })),
  }));
}

function extractJsonObject(text) {
  const raw = String(text || '').trim();
  if (!raw) throw new Error('DeepSeek 未返回内容');
  try { return JSON.parse(raw); } catch (_) {}
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) throw new Error('DeepSeek 返回内容不是 JSON');
  return JSON.parse(m[0]);
}

async function callDeepSeekImport(text, schema, options = {}) {
  const cfg = getAiImportConfig();
  if (!cfg.apiKey) throw new Error('请先在后台配置 DeepSeek API Key');
  const sheets = buildAiImportSchema(schema);
  if (!sheets.length) throw new Error('没有可用于判断的智能表结构');
  const systemPrompt = [
    '你是榴莲运输温度监控看板的数据录入助手。',
    '请根据用户提供的自然语言或截图文字，判断应该写入哪张智能表子表，以及应填写哪些字段。',
    '同时判断这是新增记录还是修改已有记录：如果用户明确说修改、更新、更正、补充某条记录，则建议 update，否则建议 add。',
    '只能从提供的 sheets[].fields[].title 中选择字段，不能编造字段；只能从 sheets[].sheetId 中选择目标子表。',
    '如果用户提到“第10柜/南部第10柜”但没有标准海运柜号，也可以把它作为“柜号”的值。',
    '如果字段类型是 FIELD_TYPE_REFERENCE，只能填写被引用记录的 record_id；如果原文只有显示文本而没有 record_id，请留空并在 warnings 说明需要人工选择引用记录。',
    '相对日期要结合 currentDate 解析，例如“昨天傍晚”可推断为昨天 18:00。',
    '温度字段返回数字，日期时间返回 yyyy-MM-dd HH:mm，文本字段返回字符串。',
    '必须只返回 json，不要返回 markdown。',
  ].join('\n');
  const userPayload = {
    currentDate: new Date().toISOString(),
    preferredSheetId: options.sheetId || '',
    preferredMode: options.mode || '',
    sheets,
    text: normalizeImportText(text),
    outputJsonShape: {
      sheetId: '目标子表ID',
      sheetTitle: '目标子表标题',
      mode: 'add 或 update',
      recordHint: '若能从文本看出要修改哪条记录，写简短提示；否则空字符串',
      fields: [
        { title: '字段标题', value: '字段值', confidence: 0.9, reason: '简短依据' },
      ],
      warnings: ['无法确定的信息'],
    },
  };
  const resp = await axios.post(`${cfg.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    model: cfg.model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `请返回 json。输入如下：\n${JSON.stringify(userPayload, null, 2)}` },
    ],
    response_format: { type: 'json_object' },
    temperature: cfg.temperature,
  }, {
    timeout: 45000,
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
    },
  });
  return extractJsonObject(resp.data?.choices?.[0]?.message?.content);
}

async function parseImportWithAi(text, schema, options = {}) {
  const ai = await callDeepSeekImport(text, schema, options);
  const sheets = buildAiImportSchema(schema);
  const sheet = (schema.sheets || []).find(s => s.sheet_id === ai.sheetId)
    || (schema.sheets || []).find(s => s.title === ai.sheetTitle)
    || (schema.sheets || []).find(s => s.sheet_id === options.sheetId)
    || schema.detected?.tempSheet
    || (schema.sheets || [])[0];
  if (!sheet) throw new Error('DeepSeek 未能选择有效子表');
  const fieldMap = {};
  (sheet.fields || []).forEach(f => { fieldMap[f.field_title] = f; });
  const values = {};
  const aiFieldMap = {};
  const aiFields = Array.isArray(ai.fields) ? ai.fields : [];
  aiFields.forEach(item => {
    const title = String(item.title || '').trim();
    const field = fieldMap[title];
    if (!field || item.value === undefined || item.value === null || item.value === '') return;
    aiFieldMap[title] = item;
  });
  const previewFields = (sheet.fields || []).map(field => {
    const title = field.field_title;
    const item = aiFieldMap[title];
    const value = item ? item.value : (title === '更新时间' ? formatImportDate(new Date()) : '');
    const cellValue = makeCellValue(field, value);
    const writable = value === '' || cellValue !== undefined;
    if (cellValue !== undefined) values[title] = cellValue;
    return {
      title,
      value,
      fieldId: field.field_id,
      fieldType: field.field_type,
      confidence: item ? (Number(item.confidence) || 0.75) : (title === '更新时间' ? 0.5 : 0),
      reason: item ? String(item.reason || '') : (title === '更新时间' ? '未提供更新时间，默认当前时间，可手动修改' : '未识别，可手动补充'),
      inferred: !item && title === '更新时间',
      missing: !item && title !== '更新时间',
      writable,
    };
  });
  return {
    sheet: { sheetId: sheet.sheet_id, title: sheet.title },
    mode: ai.mode === 'update' ? 'update' : 'add',
    recordHint: String(ai.recordHint || ''),
    fields: previewFields,
    values,
    rawText: normalizeImportText(text),
    warnings: [
      ...(Array.isArray(ai.warnings) ? ai.warnings.map(String) : []),
      ...(previewFields.length ? [] : ['DeepSeek 没有返回可写入字段，或返回字段不在目标子表中']),
    ],
    parser: 'deepseek',
    availableSheets: sheets.map(s => ({ sheetId: s.sheetId, title: s.title })),
  };
}

/**
 * 获取文档结构（带缓存），自动识别温度子表和基础信息子表
 *
 * 识别策略：
 *   - 温度子表：字段标题含「温度」「temp」等关键词
 *   - 信息子表：第一个非温度子表的 smartsheet
 *   - 如果只有一个子表，则兼作温度子表
 */
async function getDocumentSchema() {
  const now = Date.now();
  if (schemaCache.data && schemaCache.expiresAt > now) {
    return schemaCache.data;
  }

  if (!DOCID) {
    throw new Error('缺少 DOCID 环境变量配置');
  }

  console.log('[schema] 开始获取文档结构...');

  // 1. 获取所有子表
  const sheetResp = await wecom.getSheets(DOCID);
  if (sheetResp.errcode !== 0) {
    throw new Error(`获取子表失败: [${sheetResp.errcode}] ${sheetResp.errmsg}`);
  }

  const sheets = sheetResp.sheet_list || [];
  console.log(`[schema] 找到 ${sheets.length} 个子表:`, sheets.map(s => s.title).join(', '));

  // 2. 获取每个智能表的字段
  const sheetDetails = [];
  const tempKeywords = ['温度', 'temp', '℃', '柜号', '回风', '设定温度', '风口'];
  const infoKeywords = ['订单', '客户', '目的地', '出发地', '批次', '国家'];

  for (const sheet of sheets) {
    if (sheet.type !== 'smartsheet') continue;

    try {
      const fieldsResp = await wecom.getFields(DOCID, sheet.sheet_id);
      if (fieldsResp.errcode !== 0) {
        console.warn(`[schema] 获取子表「${sheet.title}」字段失败: ${fieldsResp.errmsg}`);
        continue;
      }

      const fields = fieldsResp.fields || [];
      const fieldTitles = fields.map(f => f.field_title);
      const fieldMap = {};
      fields.forEach(f => { fieldMap[f.field_title] = f; });

      sheetDetails.push({
        ...sheet,
        fields,
        fieldTitles,
        fieldMap,
      });

      console.log(`[schema] 子表「${sheet.title}」字段:`, fieldTitles.join(', '));
    } catch (err) {
      console.warn(`[schema] 获取子表「${sheet.title}」字段异常:`, err.message);
    }
  }

  // 3. 自动识别温度子表与信息子表
  let tempSheet = null;
  let infoSheet = null;

  // 温度子表标题关键词（标题含「温度」优先判定为温度表）
  const tempTitleKeywords = ['温度', 'temp'];

  // 第一步：按子表标题识别温度子表（标题含「温度」优先判定为温度表）
  for (const sheet of sheetDetails) {
    const lowerTitle = sheet.title.toLowerCase();
    if (tempTitleKeywords.some(k => lowerTitle.includes(k.toLowerCase()))) {
      tempSheet = sheet;
      break;
    }
  }

  // 第二步：按字段关键词匹配（标题无法识别时兜底）
  if (!tempSheet) {
    for (const sheet of sheetDetails) {
      if (sheet === tempSheet) continue;
      const titles = sheet.fieldTitles.join(' ');
      const lowerTitles = titles.toLowerCase();
      const tempScore = tempKeywords.filter(k => lowerTitles.includes(k.toLowerCase())).length;

      if (tempScore > 0) {
        tempSheet = sheet;
        break;
      }
    }
  }

  // 第三步：识别信息子表（第一个非温度子表的 smartsheet）
  for (const sheet of sheetDetails) {
    if (sheet === tempSheet) continue;
    infoSheet = sheet;
    break;
  }

  // 如果只有一个子表，它既是信息表也是温度表
  if (sheetDetails.length === 1) {
    tempSheet = sheetDetails[0];
    infoSheet = sheetDetails[0];
  }
  // 如果没识别到温度子表，用第一个做兜底
  if (!tempSheet && sheetDetails.length > 0) {
    tempSheet = sheetDetails[0];
  }
  // 如果没识别到信息子表，也用第一个做兜底
  if (!infoSheet && sheetDetails.length > 0) {
    infoSheet = sheetDetails[0];
  }

  const result = {
    sheets: sheetDetails,
    detected: { tempSheet, infoSheet },
  };

  schemaCache.data = result;
  schemaCache.expiresAt = now + SCHEMA_CACHE_TTL;

  console.log(`[schema] 识别结果 — 温度子表: 「${tempSheet?.title || '无'}」, 信息子表: 「${infoSheet?.title || '无'}」`);

  return result;
}

/**
 * 清除 schema 缓存
 */
function clearSchemaCache() {
  schemaCache.data = null;
  schemaCache.expiresAt = 0;
}

// ---- Express 中间件 ----

app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

// /admin 路由 → admin.html
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// /login 路由 → login.html
app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

// CORS（如果前端部署在不同端口）
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// 回调 URL 路由需要原始 body（XML 格式）
app.use('/callback', express.raw({ type: 'application/xml' }));
app.use('/callback', express.text({ type: 'text/xml' }));

// ---- 企业微信回调 URL 验证（用于配置可信IP前置条件） ----

/**
 * GET /callback — 企微回调 URL 有效性验证
 *
 * 企微后台保存回调配置时，会向该 URL 发 GET 请求验证
 * 需要在 1 秒内返回解密后的 echostr 明文
 */
app.get('/callback', (req, res) => {
  const token = process.env.WECOM_TOKEN;
  const encodingAESKey = process.env.WECOM_ENCODING_AES_KEY;

  if (!token || !encodingAESKey) {
    console.error('[callback] 缺少 WECOM_TOKEN 或 WECOM_ENCODING_AES_KEY 环境变量');
    return res.status(500).send('server config error');
  }

  const result = wecomCrypto.handleVerifyUrl(req.query, token, encodingAESKey);

  if (!result.success) {
    console.error('[callback] URL 验证失败:', result.error);
    return res.status(403).send(result.error);
  }

  console.log('[callback] URL 验证成功');
  // 直接返回明文，不能加引号、BOM、换行
  res.set('Content-Type', 'text/plain');
  res.send(result.echo);
});

/**
 * POST /callback — 接收企微推送的消息/事件（预留）
 */
app.post('/callback', (req, res) => {
  // 企微服务器 5 秒内收不到响应会重试，所以先回空包
  // 后续如需处理智能表格变更事件，可在此解析 XML + 解密
  console.log('[callback] 收到 POST 推送');
  res.send('success');
});

// ---- 认证路由（无需登录） ----

/**
 * POST /api/auth/login
 * Body: { username, password, rememberMe? }
 * 验证成功后设置 httpOnly JWT cookie
 */
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password, rememberMe } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ success: false, error: '请输入用户名和密码' });
    }

    const db = getDb();
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);

    if (!user) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    if (!user.is_active) {
      return res.status(401).json({ success: false, error: '账号已被禁用，请联系管理员' });
    }

    const bcrypt = require('bcryptjs');
    const valid = await bcrypt.compare(password, user.password_hash);

    if (!valid) {
      return res.status(401).json({ success: false, error: '用户名或密码错误' });
    }

    const token = generateToken(user, !!rememberMe);
    setAuthCookie(res, token, !!rememberMe);

    console.log(`[auth/login] 用户「${user.username}」登录成功`);

    res.json({
      success: true,
      data: {
        username: user.username,
        displayName: user.display_name,
        role: user.role,
        permissions: normalizePermissions(user.role, user.permissions),
        dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
      },
    });
  } catch (err) {
    console.error('[auth/login] 错误:', err);
    res.status(500).json({ success: false, error: '登录服务异常' });
  }
});

/**
 * POST /api/auth/logout
 * 清除认证 cookie
 */
app.post('/api/auth/logout', (req, res) => {
  clearAuthCookie(res);
  res.json({ success: true, message: '已退出登录' });
});

// ---- 认证守卫（/api/* 除 /api/auth/* 外均需登录） ----

app.use('/api', (req, res, next) => {
  // 仅登录/登出不需要鉴权；/auth/me 需要走 requireAuth
  if (req.path === '/auth/login' || req.path === '/auth/logout') return next();
  requireAuth(req, res, next);
});

// ---- 看板内容 API（/api/aggregate + orders/logistics/news CRUD）----
// 挂在鉴权 guard 之后：GET 默认登录可读，写操作在 board-routes 内各自检查模块权限
app.use('/api', boardRouter);

/**
 * GET /api/drilldown/order
 * 按看板订单行读取智能表中的订单主表 + 分柜明细表明细。
 */
app.get('/api/drilldown/order', async (req, res) => {
  try {
    const country = String(req.query.country || '').toUpperCase();
    const category = String(req.query.category || '').toUpperCase();
    const brand = String(req.query.brand || '').trim();
    const factory = extractFactoryFromBrand(brand);

    if (!country || !category || !factory) {
      return res.status(400).json({ success: false, error: '缺少 country、category 或 brand 参数' });
    }

    const snapshot = await wecomCache.getSnapshotOrRefresh(DOCID);
    const orderSheet = findSheetByTitle(snapshot.sheets, '订单主表');
    const detailSheet = findSheetByTitle(snapshot.sheets, '分柜明细表');
    if (!orderSheet || !detailSheet) {
      return res.json({
        success: true,
        data: {
          type: 'order',
          source: 'smart_sheet',
          query: { country, category, brand, factory },
          orders: [],
          containers: [],
          summary: { orders: 0, boxes: 0, containers: 0 },
          message: '未找到订单主表或分柜明细表',
        },
      });
    }

    const orderRecords = orderSheet.records || [];
    const detailRecords = detailSheet.records || [];

    const wantedCountry = COUNTRY_NAME_MAP[country] || country;
    const orderNoField = findFieldStrict(orderSheet.fieldTitles, ['订单编号', '订单号', 'order']);
    const countryField = findFieldStrict(orderSheet.fieldTitles, ['国家', '产地', 'country']);
    const freshField = findFieldStrict(orderSheet.fieldTitles, ['鲜果(柜数)', '鲜果', 'fresh']);
    const frozenField = findFieldStrict(orderSheet.fieldTitles, ['冻果(柜数)', '冻果', '冻肉', 'frozen']);
    const countField = category === 'FROZEN' ? frozenField : freshField;
    if (!orderNoField || !countryField || !countField) {
      throw new Error('订单主表缺少订单编号、国家或对应品类柜数字段');
    }

    const matchedOrdersRaw = orderRecords.filter(record => {
      const orderNo = String(wecom.getRecordValue(record, orderNoField) || '');
      const recordCountry = String(wecom.getRecordValue(record, countryField) || '');
      const boxes = Number(wecom.getRecordValue(record, countField) || 0);
      return orderNo.startsWith(`${factory}-`) && recordCountry.includes(wantedCountry) && boxes > 0;
    });
    const matchedOrderNos = new Set(matchedOrdersRaw.map(r => String(wecom.getRecordValue(r, orderNoField) || '')).filter(Boolean));

    const detailOrderNoField = findFieldStrict(detailSheet.fieldTitles, ['订单编号', '订单号', 'order']);
    const detailCategoryField = findFieldStrict(detailSheet.fieldTitles, ['产品品类', '品类', 'category']);
    if (!detailOrderNoField || !detailCategoryField) {
      throw new Error('分柜明细表缺少订单编号或产品品类字段');
    }
    const labels = CATEGORY_LABEL_MAP[category] || [];
    const matchedDetailsRaw = detailRecords.filter(record => {
      const orderNo = String(wecom.getRecordValue(record, detailOrderNoField) || '');
      const catText = String(wecom.getRecordValue(record, detailCategoryField) || '');
      return matchedOrderNos.has(orderNo) && labels.some(label => catText.includes(label));
    });

    const boxTotal = matchedOrdersRaw.reduce((sum, record) => sum + Number(wecom.getRecordValue(record, countField) || 0), 0);

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        type: 'order',
        source: 'smart_sheet',
        cache: { fetchedAt: snapshot.fetchedAt, ageMs: Date.now() - new Date(snapshot.fetchedAt).getTime() },
        query: { country, category, brand, factory },
        sheets: [
          sheetMetaForDrilldown(orderSheet),
          sheetMetaForDrilldown(detailSheet),
        ],
        orders: matchedOrdersRaw.map(r => flattenRecordForDrilldown(r, orderSheet.fields)),
        containers: matchedDetailsRaw.map(r => flattenRecordForDrilldown(r, detailSheet.fields)),
        summary: {
          orders: matchedOrdersRaw.length,
          boxes: boxTotal,
          containers: matchedDetailsRaw.length,
        },
      },
    });
  } catch (err) {
    console.error('[drilldown/order] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/drilldown/container
 * 按柜号读取温度、物流、分柜等智能表明细。
 */
app.get('/api/drilldown/container', async (req, res) => {
  try {
    const container = String(req.query.container || '').trim();
    if (!container || container === '-') {
      return res.status(400).json({ success: false, error: '缺少 container 参数' });
    }

    const snapshot = await wecomCache.getSnapshotOrRefresh(DOCID);
    const targetSheets = snapshot.sheets.filter(sheet => DRILL_CONTAINER_SHEETS.includes(sheet.title));

    const sections = [];
    for (const sheet of targetSheets) {
      const containerField = findFieldStrict(sheet.fieldTitles, ['柜号', '柜编号', '箱号', 'container']);
      if (!containerField) continue;

      try {
        const records = sheet.records || [];
        const matched = records
          .filter(record => drillValueMatches(wecom.getRecordValue(record, containerField), container))
          .slice(0, 100);
        if (matched.length) {
          sections.push({
            sheetTitle: sheet.title,
            sheetId: sheet.sheet_id,
            fields: sheet.fields.map(fieldMetaForDrilldown),
            records: matched.map(r => flattenRecordForDrilldown(r, sheet.fields)),
          });
        }
      } catch (err) {
        sections.push({
          sheetTitle: sheet.title,
          sheetId: sheet.sheet_id,
          fields: sheet.fields.map(fieldMetaForDrilldown),
          records: [],
          error: err.message,
        });
      }
    }

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: {
        type: 'container',
        source: 'smart_sheet',
        cache: { fetchedAt: snapshot.fetchedAt, ageMs: Date.now() - new Date(snapshot.fetchedAt).getTime() },
        container,
        sections,
        summary: {
          sheets: sections.length,
          records: sections.reduce((sum, section) => sum + (section.records || []).length, 0),
        },
      },
    });
  } catch (err) {
    console.error('[drilldown/container] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/auth/me
 * 返回当前登录用户信息（依赖 requireAuth 中间件挂载的 req.user）
 */
app.get('/api/auth/me', (req, res) => {
  res.json({
    success: true,
    data: {
      username: req.user.username,
      displayName: req.user.displayName,
      role: req.user.role,
      permissions: req.user.permissions || [],
      dashboardPermissions: req.user.dashboardPermissions || [],
    },
  });
});

app.get('/api/wecom-cache/status', (req, res) => {
  res.json({ success: true, data: wecomCache.getStatus() });
});

app.post('/api/wecom-cache/refresh', requirePermission('smartsheet'), async (req, res) => {
  try {
    const snapshot = await wecomCache.refreshNow(DOCID);
    res.json({
      success: true,
      data: {
        fetchedAt: snapshot.fetchedAt,
        durationMs: snapshot.durationMs,
        recordCounts: snapshot.recordCounts,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message, data: wecomCache.getStatus() });
  }
});


// ---- 账号管理 API ----

const canManageAccounts = requireRole('admin');

function publicUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isActive: !!user.is_active,
    tokenVersion: user.token_version,
    permissions: normalizePermissions(user.role, user.permissions),
    dashboardPermissions: normalizeDashboardPermissions(user.dashboard_permissions),
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  };
}

function getUserByIdSafe(db, id) {
  return db.prepare(
    'SELECT id, username, display_name, role, is_active, token_version, permissions, dashboard_permissions, created_at, updated_at FROM users WHERE id = ?'
  ).get(id);
}

app.get('/api/users', canManageAccounts, (req, res) => {
  const users = listUsers(getDb()).map(user => ({
    id: user.id,
    username: user.username,
    displayName: user.display_name,
    role: user.role,
    isActive: !!user.is_active,
    tokenVersion: user.token_version,
    permissions: user.permissions,
    dashboardPermissions: user.dashboardPermissions,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
  }));
  res.json({ success: true, data: users });
});

app.post('/api/users', canManageAccounts, async (req, res) => {
  try {
    const { username, password, displayName, role, permissions, dashboardPermissions } = req.body || {};
    const cleanUsername = String(username || '').trim();
    if (!cleanUsername || !password) {
      return res.status(400).json({ success: false, error: '用户名和密码不能为空' });
    }

    const db = getDb();
    const created = await createUser(db, {
      username: cleanUsername,
      password,
      displayName: String(displayName || cleanUsername).trim(),
      role: role === 'admin' ? 'admin' : 'viewer',
      permissions,
      dashboardPermissions,
    });
    res.status(201).json({ success: true, data: publicUser(getUserByIdSafe(db, created.id)) });
  } catch (err) {
    const isDuplicate = /UNIQUE constraint failed/.test(err.message);
    res.status(isDuplicate ? 409 : 500).json({
      success: false,
      error: isDuplicate ? '用户名已存在' : err.message,
    });
  }
});

app.put('/api/users/:id', canManageAccounts, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, error: '用户 ID 不正确' });
  }

  const db = getDb();
  const existing = getUserByIdSafe(db, userId);
  if (!existing) return res.status(404).json({ success: false, error: '账号不存在' });

  const role = req.body.role === 'admin' ? 'admin' : 'viewer';
  const isActive = req.body.isActive === undefined ? !!existing.is_active : !!req.body.isActive;
  if (userId === req.user.userId && role !== 'admin') {
    return res.status(400).json({ success: false, error: '不能取消当前登录账号的管理员身份' });
  }
  if (userId === req.user.userId && !isActive) {
    return res.status(400).json({ success: false, error: '不能禁用当前登录账号' });
  }

  const fields = {
    display_name: String(req.body.displayName || existing.display_name || existing.username).trim(),
    role,
    is_active: isActive ? 1 : 0,
    permissions: stringifyPermissions(role, req.body.permissions),
    dashboard_permissions: stringifyDashboardPermissions(req.body.dashboardPermissions),
  };
  updateUser(db, userId, fields);
  if (role !== existing.role || isActive !== !!existing.is_active || fields.permissions !== existing.permissions) {
    incrementTokenVersion(db, userId);
  }
  res.json({ success: true, data: publicUser(getUserByIdSafe(db, userId)) });
});

app.post('/api/users/:id/password', canManageAccounts, async (req, res) => {
  try {
    const userId = Number(req.params.id);
    const password = req.body && req.body.password;
    if (!Number.isInteger(userId) || !password) {
      return res.status(400).json({ success: false, error: '用户 ID 或新密码不能为空' });
    }

    const db = getDb();
    if (!getUserByIdSafe(db, userId)) return res.status(404).json({ success: false, error: '账号不存在' });
    const bcrypt = require('bcryptjs');
    const passwordHash = await bcrypt.hash(password, 12);
    updateUser(db, userId, { password_hash: passwordHash });
    incrementTokenVersion(db, userId);
    res.json({ success: true, message: '密码已重置' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.delete('/api/users/:id', canManageAccounts, (req, res) => {
  const userId = Number(req.params.id);
  if (!Number.isInteger(userId)) {
    return res.status(400).json({ success: false, error: '用户 ID 不正确' });
  }
  if (userId === req.user.userId) {
    return res.status(400).json({ success: false, error: '不能删除当前登录账号' });
  }

  const db = getDb();
  const result = db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  if (!result.changes) return res.status(404).json({ success: false, error: '账号不存在' });
  res.json({ success: true, message: '账号已删除' });
});

// ---- API 路由 ----

/**
 * GET /api/config/info
 * 返回文档结构信息（子表列表、字段定义、识别结果）
 */
app.get('/api/config/info', requirePermission('smartsheet'), async (req, res) => {
  try {
    const schema = await getDocumentSchema();
    res.json({
      success: true,
      data: {
        docid: DOCID,
        sheets: schema.sheets.map(s => ({
          sheet_id: s.sheet_id,
          title: s.title,
          type: s.type,
          fields: s.fields,
        })),
        detected: {
          tempSheet: schema.detected.tempSheet ? {
            sheet_id: schema.detected.tempSheet.sheet_id,
            title: schema.detected.tempSheet.title,
          } : null,
          infoSheet: schema.detected.infoSheet ? {
            sheet_id: schema.detected.infoSheet.sheet_id,
            title: schema.detected.infoSheet.title,
          } : null,
        },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/dashboard
 * 返回看板聚合数据（温度记录 + 统计信息 + 告警）
 *
 * Query params:
 *   container  - 筛选指定柜号
 *   limit      - 返回记录数上限，默认 200
 *   hours      - 时间范围（小时），默认 24
 */
app.get('/api/dashboard', async (req, res) => {
  try {
    if (!(req.user.dashboardPermissions || []).includes('gantt')) {
      return res.status(403).json({ success: false, error: '无温度甘特图查看权限' });
    }

    const snapshot = await wecomCache.getSnapshotOrRefresh(DOCID);
    const tempSheet = findSheetByTitle(snapshot.sheets, '温度记录') || snapshot.sheets.find(s => String(s.title).includes('温度'));
    const infoSheet = snapshot.sheets.find(s => s !== tempSheet) || null;
    const schema = { sheets: snapshot.sheets, detected: { tempSheet, infoSheet } };

    if (!tempSheet) {
      return res.json({
        success: true,
        data: {
          records: [],
          stats: { total: 0, abnormal: 0, avgTemp: 0, containerCount: 0 },
          containers: [],
          alerts: [],
          message: '未找到温度数据子表，请先在智能表格文档中创建温度记录子表',
        },
      });
    }

    const { container, limit = '200', hours = '24' } = req.query;
    const recordLimit = Math.min(parseInt(limit) || 200, 1000);
    const hoursNum = parseInt(hours) || 24;

    // 识别关键字段
    const fieldMap = {};
    tempSheet.fields.forEach(f => {
      fieldMap[f.field_title] = f;
    });

    // 自动匹配字段名
    const setTempField = findField(tempSheet.fieldTitles, ['设定温度', 'set temp', '目标温度']);
    const supplyTempField = findField(tempSheet.fieldTitles, ['送风温度', 'supply temp', '送风']);
    const returnTempField = findField(tempSheet.fieldTitles, ['回风温度', 'return temp', '温度', 'temp', '℃']);
    const containerField = findField(tempSheet.fieldTitles, ['柜号', '柜编号', 'container', '箱号']);
    const brandField = findField(tempSheet.fieldTitles, ['品牌', 'brand']);
    const placementTimeField = findField(tempSheet.fieldTitles, ['放柜时间', '放柜']);
    const ventField = findField(tempSheet.fieldTitles, ['风口设定', '风口', 'vent', '出风口']);
    const locationField = findField(tempSheet.fieldTitles, ['当前位置', '当前地点', '地点', '位置', 'location', 'gps', '坐标']);
    const aromaField = findField(tempSheet.fieldTitles, ['味道', '香味', '气味', 'aroma', 'smell']);
    const portField = findField(tempSheet.fieldTitles, ['关口', '口岸', 'port', 'gate']);
    const timeField = findField(tempSheet.fieldTitles, ['更新时间', '时间', '记录时间', 'date', 'time', '创建时间']);

    // 排序：按时间倒序
    const sort = [];
    if (timeField) {
      sort.push({ field_title: timeField, desc: true });
    }

    // 构建查询选项
    const queryOpts = { sort, limit: recordLimit };

    // 按柜号筛选
    if (container) {
      const cField = containerField;
      if (cField) {
        queryOpts.filterSpec = {
          conjunction: 'CONJUNCTION_AND',
          conditions: [{
            field_id: fieldMap[cField]?.field_id,
            field_type: 'FIELD_TYPE_TEXT',
            operator: 'OPERATOR_CONTAINS',
            string_value: { value: [container] },
          }],
        };
      }
    }

    // 查询温度记录：优先使用企微内存快照，只有无缓存 records 时才回退实时查询
    let records = tempSheet.records || await wecom.getAllRecords(DOCID, tempSheet.sheet_id, queryOpts);
    if (container && containerField) {
      records = records.filter(r => drillValueMatches(wecom.getRecordValue(r, containerField), container));
    }
    if (timeField) {
      records = records.slice().sort((a, b) => {
        const ta = parseLogisticsTime(wecom.getRecordValue(a, timeField))?.getTime() || 0;
        const tb = parseLogisticsTime(wecom.getRecordValue(b, timeField))?.getTime() || 0;
        return tb - ta;
      });
    }
    records = records.slice(0, recordLimit);

    // 解析记录
    const tempMin = parseFloat(process.env.TEMP_MIN || 2);
    const tempMax = parseFloat(process.env.TEMP_MAX || 8);
    // 温差告警阈值：回风温度偏离设定温度超过此值则告警
    const tempDiffWarning = parseFloat(process.env.TEMP_DIFF_WARNING || 3);

    const parsedRecords = records.map(r => {
      const setTempRaw = wecom.getRecordValue(r, setTempField);
      const returnTempRaw = wecom.getRecordValue(r, returnTempField);
      const setTemp = setTempRaw !== null ? parseFloat(setTempRaw) : null;
      const returnTemp = returnTempRaw !== null ? parseFloat(returnTempRaw) : null;

      // 异常判断：
      // 1. 如果有设定温度和回风温度 → 按差值判断
      // 2. 如果只有回风温度（旧数据） → 按 TEMP_MIN/TEMP_MAX 阈值判断
      let isAbnormal = false;
      if (setTemp !== null && returnTemp !== null && !isNaN(setTemp) && !isNaN(returnTemp)) {
        isAbnormal = Math.abs(returnTemp - setTemp) > tempDiffWarning;
      } else if (returnTemp !== null && !isNaN(returnTemp)) {
        isAbnormal = returnTemp < tempMin || returnTemp > tempMax;
      }

      return {
        recordId: r.record_id,
        containerNo: wecom.getRecordValue(r, containerField) || '-',
        brand: wecom.getRecordValue(r, brandField) || '-',
        placementTime: parseTimeValue(r, placementTimeField),
        setTemp,
        setTempDisplay: setTemp !== null ? `${setTemp}°C` : '-',
        supplyTemp: supplyTempField ? parseFloat(wecom.getRecordValue(r, supplyTempField)) : null,
        supplyTempDisplay: supplyTempField && wecom.getRecordValue(r, supplyTempField) ? `${wecom.getRecordValue(r, supplyTempField)}°C` : '-',
        returnTemp,
        returnTempDisplay: returnTemp !== null ? `${returnTemp}°C` : '-',
        tempDiff: (setTemp !== null && returnTemp !== null) ? Math.round((returnTemp - setTemp) * 10) / 10 : null,
        vent: wecom.getRecordValue(r, ventField) || '-',
        location: wecom.getRecordValue(r, locationField) || '-',
        aroma: wecom.getRecordValue(r, aromaField) || '-',
        port: wecom.getRecordValue(r, portField) || '-',
        updateTime: parseTimeValue(r, timeField),
        isAbnormal,
        creator: r.creator_name || '',
        updater: r.updater_name || '',
      };
    });

    // 过滤掉过旧的数据
    const cutoffTime = new Date(Date.now() - hoursNum * 3600 * 1000);
    const recentRecords = parsedRecords.filter(r => {
      if (!r.updateTime) return true; // 没时间的不过滤
      return new Date(r.updateTime) >= cutoffTime;
    });

    // 统计
    const validReturnTemps = recentRecords.filter(r => r.returnTemp !== null);
    const abnormalRecords = recentRecords.filter(r => r.isAbnormal);
    const avgReturnTemp = validReturnTemps.length > 0
      ? validReturnTemps.reduce((s, r) => s + r.returnTemp, 0) / validReturnTemps.length
      : 0;

    const containerSet = new Set(recentRecords.map(r => r.containerNo).filter(c => c !== '-'));
    const containerCount = containerSet.size;

    // 统计数据
    const stats = {
      total: recentRecords.length,
      containerCount,
      abnormalCount: abnormalRecords.length,
      avgReturnTemp: Math.round(avgReturnTemp * 10) / 10,
      tempMin,
      tempMax,
      tempDiffWarning,
    };

    // 告警列表
    const alerts = abnormalRecords.slice(0, 10).map(r => {
      let reason = '';
      if (r.tempDiff !== null) {
        const direction = r.tempDiff > 0 ? '偏高' : '偏低';
        reason = `回风温度${direction} | 设定${r.setTemp}°C → 回风${r.returnTemp}°C (差${Math.abs(r.tempDiff)}°C)`;
      } else if (r.returnTemp !== null) {
        reason = r.returnTemp < tempMin
          ? `温度偏低 (${r.returnTemp}°C < ${tempMin}°C)`
          : `温度偏高 (${r.returnTemp}°C > ${tempMax}°C)`;
      }
      return {
        containerNo: r.containerNo,
        setTemp: r.setTemp,
        returnTemp: r.returnTemp,
        tempDiff: r.tempDiff,
        reason,
        time: r.updateTime,
        location: r.location,
      };
    });

    // === 物流数据：从陆运/海运明细表读取全流程追踪信息 ===
    let detention = {
      containers: [],
      detainedCount: 0,
      avgDays: 0,
    };
    const containerLogistics = {}; // containerNo → logistics info

    try {
      const allSheets = schema.sheets || [];
      const landSheet = allSheets.find(s => s.title === '陆运明细');
      const seaSheet = allSheets.find(s => s.title === '海运明细');

      // 读取陆运明细
      if (landSheet) {
        console.log('[dashboard] 读取陆运明细...');
        const landRecords = landSheet.records || await wecom.getAllRecords(DOCID, landSheet.sheet_id, { limit: 500 });
        landRecords.forEach(r => {
          const cNo = wecom.getRecordValue(r, '柜号');
          if (!cNo) return;
          const entryTime = parseLogisticsTime(wecom.getRecordValue(r, '进卡时间'));
          const exitTime = parseLogisticsTime(wecom.getRecordValue(r, '出口岸时间'));
          const port = wecom.getRecordValue(r, '目的地') || '';
          const status = wecom.getRecordValue(r, '当前状况') || '';
          const inspection = wecom.getRecordValue(r, '是否中查验') || '';
          const market = wecom.getRecordValue(r, '市场') || '';

          // 计算滞留天数
          let detentionDays = null;
          let detentionPort = null;
          if (entryTime) {
            detentionPort = port;
            const endTime = exitTime || new Date();
            detentionDays = Math.round((endTime - entryTime) / (86400 * 1000) * 10) / 10;
          }

          containerLogistics[cNo] = {
            transportType: '陆运',
            port,
            status,
            inspection,
            market,
            entryTime: entryTime ? entryTime.toISOString() : null,
            exitTime: exitTime ? exitTime.toISOString() : null,
            detentionDays,
            detentionPort,
          };
        });
      }

      // 读取海运明细
      if (seaSheet) {
        console.log('[dashboard] 读取海运明细...');
        const seaRecords = seaSheet.records || await wecom.getAllRecords(DOCID, seaSheet.sheet_id, { limit: 500 });
        seaRecords.forEach(r => {
          const cNo = wecom.getRecordValue(r, '柜号');
          if (!cNo) return;
          const arrivalTime = parseLogisticsTime(wecom.getRecordValue(r, '实际到港时间'));
          const releaseTime = parseLogisticsTime(wecom.getRecordValue(r, '放行时间'));
          const port = wecom.getRecordValue(r, '目的港') || '';
          const status = wecom.getRecordValue(r, '当前状态') || '';
          const inspection = wecom.getRecordValue(r, '查验状态') || '';
          const vessel = wecom.getRecordValue(r, '船名') || '';

          let detentionDays = null;
          let detentionPort = null;
          if (arrivalTime) {
            detentionPort = port;
            const endTime = releaseTime || new Date();
            detentionDays = Math.round((endTime - arrivalTime) / (86400 * 1000) * 10) / 10;
          }

          containerLogistics[cNo] = {
            transportType: '海运',
            port,
            status,
            inspection,
            vessel,
            entryTime: arrivalTime ? arrivalTime.toISOString() : null,
            exitTime: releaseTime ? releaseTime.toISOString() : null,
            detentionDays,
            detentionPort,
          };
        });
      }

      // 将物流信息附加到温度记录
      recentRecords.forEach(r => {
        const logistics = containerLogistics[r.containerNo];
        if (logistics) {
          r.transportType = logistics.transportType;
          r.detentionDays = logistics.detentionDays;
          r.detentionPort = logistics.detentionPort;
          r.inspection = logistics.inspection;
          r.market = logistics.market;
          r.logisticsStatus = logistics.status;
        } else {
          r.transportType = null;
          r.detentionDays = null;
          r.detentionPort = null;
          r.inspection = null;
          r.market = null;
          r.logisticsStatus = null;
        }
      });

      // 汇总滞留统计
      const detainedList = [];
      const seenContainers = new Set();
      Object.entries(containerLogistics).forEach(([cNo, info]) => {
        if (info.detentionDays !== null && info.detentionDays > 0 && !seenContainers.has(cNo)) {
          seenContainers.add(cNo);
          detainedList.push({
            containerNo: cNo,
            port: info.detentionPort,
            days: info.detentionDays,
            transportType: info.transportType,
            inspection: info.inspection,
            entryTime: info.entryTime,
            status: info.status,
          });
        }
      });
      // 按滞留天数降序
      detainedList.sort((a, b) => b.days - a.days);

      detention = {
        containers: detainedList,
        detainedCount: detainedList.length,
        avgDays: detainedList.length > 0
          ? Math.round(detainedList.reduce((s, c) => s + c.days, 0) / detainedList.length * 10) / 10
          : 0,
      };

      console.log(`[dashboard] 物流数据: ${Object.keys(containerLogistics).length} 个柜, 滞留 ${detention.detainedCount} 个`);
    } catch (logisticsErr) {
      console.warn('[dashboard] 物流数据读取失败（可能新子表尚未创建）:', logisticsErr.message);
      // 容错：即使物流数据读取失败，温度数据仍正常返回
    }

    // 柜列表（用于筛选下拉）
    const containers = Array.from(containerSet).map(c => ({ containerNo: c }));

    // 可用字段信息（告知前端可展示哪些列）
    const availableFields = {
      setTemp: setTempField,
      supplyTemp: supplyTempField,
      returnTemp: returnTempField,
      containerNo: containerField,
      brand: brandField,
      placementTime: placementTimeField,
      vent: ventField,
      location: locationField,
      aroma: aromaField,
      port: portField,
      time: timeField,
    };

    res.json({
      success: true,
      data: {
        records: recentRecords,
        stats,
        containers,
        alerts,
        detention,
        availableFields,
        sheets: {
          temp: { sheet_id: tempSheet.sheet_id, title: tempSheet.title },
          info: infoSheet ? { sheet_id: infoSheet.sheet_id, title: infoSheet.title } : null,
        },
      },
    });
  } catch (err) {
    console.error('[dashboard] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/temperature/history
 * 温度历史数据（用于图表）
 *
 * Query params:
 *   container - 筛选指定柜号（必填？不填则返回所有）
 *   hours     - 时间范围（小时），默认 24
 */
app.get('/api/temperature/history', async (req, res) => {
  try {
    const schema = await getDocumentSchema();
    const { tempSheet } = schema.detected;

    if (!tempSheet) {
      return res.json({ success: true, data: [] });
    }

    const { container, hours = '168' } = req.query;
    const hoursNum = parseInt(hours) || 168;

    const setTempField = findField(tempSheet.fieldTitles, ['设定温度', 'set temp', '目标温度']);
    const supplyTempField = findField(tempSheet.fieldTitles, ['送风温度', 'supply temp', '送风']);
    const returnTempField = findField(tempSheet.fieldTitles, ['回风温度', 'return temp', '温度', 'temp', '℃']);
    const containerField = findField(tempSheet.fieldTitles, ['柜号', '柜编号', 'container']);
    const timeField = findField(tempSheet.fieldTitles, ['更新时间', '时间', '记录时间', 'date', 'time', '创建时间']);

    const sort = timeField ? [{ field_title: timeField, desc: false }] : [];

    const queryOpts = { sort, limit: 1000 };

    // 如果有柜号筛选
    if (container && containerField) {
      const fieldMap = {};
      tempSheet.fields.forEach(f => { fieldMap[f.field_title] = f; });
      queryOpts.filterSpec = {
        conjunction: 'CONJUNCTION_AND',
        conditions: [{
          field_id: fieldMap[containerField]?.field_id,
          field_type: 'FIELD_TYPE_TEXT',
          operator: 'OPERATOR_CONTAINS',
          string_value: { value: [container] },
        }],
      };
    }

    const records = await wecom.getAllRecords(DOCID, tempSheet.sheet_id, queryOpts);

    const cutoffTime = new Date(Date.now() - hoursNum * 3600 * 1000);
    const parsed = records
      .map(r => ({
        time: parseTimeValue(r, timeField),
        setTemp: parseFloat(wecom.getRecordValue(r, setTempField)),
        supplyTemp: parseFloat(wecom.getRecordValue(r, supplyTempField)),
        returnTemp: parseFloat(wecom.getRecordValue(r, returnTempField)),
        containerNo: wecom.getRecordValue(r, containerField),
      }))
      .filter(r => (r.returnTemp && !isNaN(r.returnTemp)) || (r.setTemp && !isNaN(r.setTemp)))
      .filter(r => {
        if (!r.time) return true;
        return new Date(r.time) >= cutoffTime;
      });

    res.json({ success: true, data: parsed });
  } catch (err) {
    console.error('[history] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/schema/refresh
 * 手动刷新 schema 缓存
 */
app.post('/api/schema/refresh', requirePermission('smartsheet'), (req, res) => {
  clearSchemaCache();
  res.json({ success: true, message: 'Schema 缓存已清除，下次请求将重新获取' });
});

/**
 * POST /api/setup — 一键初始化：创建智 能表格文档 + 建立温度记录子表 + 添加字段
 *
 * 当已有的智能表格不属于当前应用时，通过此接口创建新表格
 * 创建后自动更新 .env 文件中的 DOCID
 */
app.post('/api/setup', requirePermission('smartsheet'), async (req, res) => {
  try {
    const docName = (req.body && req.body.docName) || '榴莲温度监控数据';
    const sheetTitle = (req.body && req.body.sheetTitle) || '温度记录';

    console.log(`[setup] 开始创建智能表格「${docName}」...`);

    // 1. 创建智能表格文档
    const createResp = await wecom.createDoc({ docType: 10, docName });
    if (createResp.errcode !== 0) {
      throw new Error(`创建文档失败: [${createResp.errcode}] ${createResp.errmsg}`);
    }
    const newDocid = createResp.docid;
    const docUrl = createResp.url;
    console.log(`[setup] 文档已创建: ${newDocid} (${docUrl})`);

    // 2. 添加「温度记录」子表
    const sheetResp = await wecom.addSheet(newDocid, { title: sheetTitle });
    if (sheetResp.errcode !== 0) {
      throw new Error(`添加子表失败: [${sheetResp.errcode}] ${sheetResp.errmsg}`);
    }
    const newSheetId = sheetResp.properties.sheet_id;
    console.log(`[setup] 子表已创建: ${newSheetId}`);

    // 3. 添加字段（注意：企微 addFields 反序添加，这里按期望的从左到右顺序，后面会 reverse）
    const fields = [
      { field_title: '柜号', field_type: 'FIELD_TYPE_TEXT' },
      { field_title: '设定温度', field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 1 } },
      { field_title: '回风温度', field_type: 'FIELD_TYPE_NUMBER', property_number: { decimal_places: 1 } },
      { field_title: '风口', field_type: 'FIELD_TYPE_TEXT' },
      { field_title: '当前地点', field_type: 'FIELD_TYPE_TEXT' },
      { field_title: '更新时间', field_type: 'FIELD_TYPE_DATE_TIME', property_date_time: { format: 'yyyy-mm-dd hh:mm', auto_fill: false } },
    ];

    const fieldsResp = await wecom.addFields(newDocid, newSheetId, fields);
    if (fieldsResp.errcode !== 0) {
      throw new Error(`添加字段失败: [${fieldsResp.errcode}] ${fieldsResp.errmsg}`);
    }
    console.log(`[setup] 已添加 ${fieldsResp.fields.length} 个字段`);

    // 4. 更新 .env 文件中的 DOCID
    const fs = require('fs');
    const envPath = require('path').join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    // 替换或追加 DOCID
    if (envContent.match(/^DOCID=/m)) {
      envContent = envContent.replace(/^DOCID=.*/m, `DOCID=${newDocid}`);
    } else {
      envContent += `\nDOCID=${newDocid}\n`;
    }
    fs.writeFileSync(envPath, envContent);

    // 更新运行时变量
    process.env.DOCID = newDocid;
    clearSchemaCache();

    res.json({
      success: true,
      data: {
        docid: newDocid,
        url: docUrl,
        sheetId: newSheetId,
        sheetTitle,
        fields: fieldsResp.fields.map(f => ({ field_id: f.field_id, field_title: f.field_title, field_type: f.field_type })),
        message: '智能表格创建成功！已自动更新 DOCID 配置',
      },
    });
  } catch (err) {
    console.error('[setup] 错误:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 文档管理 API ----

/**
 * POST /api/doc/rename
 * Body: { docid?, newName }
 */
app.post('/api/doc/rename', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { newName } = req.body || {};
    if (!newName) throw new Error('缺少 newName 参数');
    const result = await wecom.renameDoc(DOCID, newName);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/doc/delete
 * 删除当前文档（危险操作！）
 */
app.post('/api/doc/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const result = await wecom.deleteDoc(DOCID);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    // 清除 DOCID
    process.env.DOCID = '';
    clearSchemaCache();
    res.json({ success: true, message: '文档已删除，DOCID 已清除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/doc/info
 * 获取当前文档基础信息
 */
app.get('/api/doc/info', requirePermission('smartsheet'), async (req, res) => {
  try {
    const result = await wecom.getDocInfo(DOCID);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.doc_base_info });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 子表管理 API ----

/**
 * POST /api/smartsheet/sheet/delete
 * Body: { sheetId }
 */
app.post('/api/smartsheet/sheet/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    const result = await wecom.deleteSheet(DOCID, sheetId);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    clearSchemaCache();
    res.json({ success: true, message: '子表已删除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/sheet/update
 * Body: { sheetId, title }
 */
app.post('/api/smartsheet/sheet/update', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, title } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    const result = await wecom.updateSheet(DOCID, { sheet_id: sheetId, title });
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    clearSchemaCache();
    res.json({ success: true, message: '子表已更新' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/sheet/add
 * Body: { title }
 */
app.post('/api/smartsheet/sheet/add', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { title } = req.body || {};
    if (!title) throw new Error('缺少 title 参数');
    const result = await wecom.addSheet(DOCID, { title });
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    clearSchemaCache();
    res.json({ success: true, data: { sheet_id: result.properties.sheet_id, title } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/ai-import/config', requirePermission('smartsheet'), (req, res) => {
  res.json({ success: true, data: getPublicAiImportConfig() });
});

app.put('/api/ai-import/config', requirePermission('smartsheet'), (req, res) => {
  try {
    const config = updateAiImportConfig(req.body || {});
    res.json({ success: true, data: config });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-import/parse
 * 调用 DeepSeek 将自然语言温度信息解析成待确认的智能表写入预览。只解析，不写入。
 */
app.post('/api/ai-import/parse', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { text, imageData, sheetId, mode } = req.body || {};
    if (imageData && !String(text || '').trim()) {
      throw new Error('截图识别需要先配置 OCR/视觉 AI 服务；当前请把截图文字复制到文本框后解析');
    }
    if (!String(text || '').trim()) throw new Error('请粘贴需要识别的文本');
    clearSchemaCache();
    const schema = await getDocumentSchema();
    const preview = await parseImportWithAi(text, schema, { sheetId, mode });
    res.json({ success: true, data: preview });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ai-import/record-options?sheetId=xxx
 * 返回某个子表的记录选项，用于修改模式选择 record_id。
 */
app.get('/api/ai-import/record-options', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, limit = '200' } = req.query;
    if (!sheetId) throw new Error('缺少 sheetId');
    const schema = await getDocumentSchema();
    const sheet = (schema.sheets || []).find(s => s.sheet_id === sheetId);
    if (!sheet) throw new Error('目标子表不存在或无权限访问');
    const records = await wecom.getAllRecords(DOCID, sheetId, { limit: Math.min(parseInt(limit) || 200, 500) });
    const options = records.map(record => recordOptionForUi(record, sheet.fields));
    res.json({ success: true, data: { sheet: { sheetId, title: sheet.title }, options } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/ai-import/reference-options?sheetId=xxx&fieldTitle=xxx
 * 返回引用字段可选记录。若无法从字段属性识别被引用子表，则返回所有子表候选分组。
 */
app.get('/api/ai-import/reference-options', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fieldTitle, limit = '200' } = req.query;
    if (!sheetId || !fieldTitle) throw new Error('缺少 sheetId 或 fieldTitle');
    const schema = await getDocumentSchema();
    const sheet = (schema.sheets || []).find(s => s.sheet_id === sheetId);
    if (!sheet) throw new Error('目标子表不存在或无权限访问');
    const field = (sheet.fields || []).find(f => f.field_title === fieldTitle);
    if (!field) throw new Error('字段不存在');

    const referencedIds = findReferencedSheetIds(field, schema.sheets);
    const candidateSheets = referencedIds.length
      ? schema.sheets.filter(s => referencedIds.includes(s.sheet_id))
      : schema.sheets.filter(s => s.sheet_id !== sheetId);

    const groups = [];
    for (const candidate of candidateSheets) {
      try {
        const records = await wecom.getAllRecords(DOCID, candidate.sheet_id, { limit: Math.min(parseInt(limit) || 200, 500) });
        groups.push({
          sheetId: candidate.sheet_id,
          title: candidate.title,
          options: records.map(record => recordOptionForUi(record, candidate.fields)),
        });
      } catch (err) {
        groups.push({ sheetId: candidate.sheet_id, title: candidate.title, options: [], error: err.message });
      }
    }

    res.json({
      success: true,
      data: {
        field: fieldMetaForDrilldown(field),
        resolved: referencedIds.length > 0,
        groups,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/ai-import/commit
 * 人员确认后写入智能表。values 使用字段标题作为 key，服务端会二次校验字段存在并转换单元格格式。
 */
app.post('/api/ai-import/commit', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, values, mode = 'add', recordId, clearFields } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId');
    if (!values || typeof values !== 'object' || Array.isArray(values)) throw new Error('缺少待写入字段');
    if (mode === 'update' && !recordId) throw new Error('修改模式缺少 recordId');
    clearSchemaCache();
    const schema = await getDocumentSchema();
    const sheet = (schema.sheets || []).find(s => s.sheet_id === sheetId);
    if (!sheet) throw new Error('目标子表不存在或无权限访问');
    const fieldMap = {};
    (sheet.fields || []).forEach(f => { fieldMap[f.field_title] = f; });
    const normalizedValues = {};
    Object.entries(values).forEach(([title, value]) => {
      const field = fieldMap[title];
      if (!field) return;
      const cellValue = makeCellValue(field, value);
      if (cellValue !== undefined) normalizedValues[title] = cellValue;
    });
    (Array.isArray(clearFields) ? clearFields : []).forEach(title => {
      const field = fieldMap[title];
      if (!field) return;
      normalizedValues[title] = makeEmptyCellValue(field);
    });
    if (!Object.keys(normalizedValues).length) throw new Error('没有有效字段可写入');
    const result = mode === 'update'
      ? await wecom.updateRecords(DOCID, sheetId, [{ record_id: recordId, values: normalizedValues }], 'CELL_VALUE_KEY_TYPE_FIELD_TITLE')
      : await wecom.addRecords(DOCID, sheetId, [{ values: normalizedValues }], 'CELL_VALUE_KEY_TYPE_FIELD_TITLE');
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    wecomCache.refreshNow(DOCID).catch(err => console.warn('[ai-import] 写入后刷新企微缓存失败:', err.message));
    res.json({ success: true, data: { mode, recordId: recordId || '', sheet: { sheetId, title: sheet.title }, fields: Object.keys(normalizedValues), result } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 记录管理 API ----

/**
 * GET /api/smartsheet/records?sheetId=xxx&limit=200&offset=0
 * 通用记录查询 — 可查询任意子表，返回已解析的记录（扁平化值）
 */
app.get('/api/smartsheet/records', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, limit = '200', offset } = req.query;
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    const queryLimit = Math.min(parseInt(limit) || 200, 1000);
    const opts = { limit: queryLimit };
    if (offset) opts.offset = parseInt(offset);

    // 获取该子表的字段定义
    const fieldsResult = await wecom.getFields(DOCID, sheetId);
    const fieldMap = {}; // field_title → { field_id, field_type }
    if (fieldsResult.errcode === 0) {
      (fieldsResult.fields || []).forEach(f => {
        fieldMap[f.field_title] = { field_id: f.field_id, field_type: f.field_type };
      });
    }

    // 获取原始记录
    const rawRecords = await wecom.getAllRecords(DOCID, sheetId, opts);

    // 解析：用 getRecordValue 提取每个字段的扁平值
    const records = rawRecords.map(r => {
      const flat = { recordId: r.record_id };
      Object.entries(fieldMap).forEach(([title, meta]) => {
        flat[title] = wecom.getRecordValue(r, title);
      });
      flat._creator = r.creator_name || '';
      flat._updater = r.updater_name || '';
      return flat;
    });

    res.json({ success: true, data: { records, total: records.length, fields: Object.keys(fieldMap) } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/records/add
 * Body: { sheetId, records, keyType? }
 */
app.post('/api/smartsheet/records/add', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, records, keyType } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!records || !Array.isArray(records)) throw new Error('records 必须是数组');
    const result = await wecom.addRecords(DOCID, sheetId, records, keyType);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/records/delete
 * Body: { sheetId, recordIds }
 */
app.post('/api/smartsheet/records/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, recordIds } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!recordIds || !Array.isArray(recordIds)) throw new Error('recordIds 必须是数组');
    const result = await wecom.deleteRecords(DOCID, sheetId, recordIds);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, message: `已删除 ${recordIds.length} 条记录` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/records/update
 * Body: { sheetId, records, keyType? }
 */
app.post('/api/smartsheet/records/update', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, records, keyType } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!records || !Array.isArray(records)) throw new Error('records 必须是数组');
    const result = await wecom.updateRecords(DOCID, sheetId, records, keyType);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 字段管理 API ----

/**
 * POST /api/smartsheet/fields/add
 * Body: { sheetId, fields }
 *
 * fields 数组按正常顺序传入即可，内部自动处理企微 API 的反序添加
 * 添加完成后自动删除默认的「智能表列」
 */
app.post('/api/smartsheet/fields/add', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fields } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!fields || !Array.isArray(fields) || fields.length === 0) throw new Error('fields 必须是数组');

    // 企微 addFields 以反序添加，需要 reverse 才能得到期望的从左到右顺序
    const reversedFields = [...fields].reverse();
    const result = await wecom.addFields(DOCID, sheetId, reversedFields);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);

    console.log(`[fields/add] 已添加 ${result.fields?.length || 0} 个字段`);

    // 删除默认的「智能表列」
    try {
      const currentFields = await wecom.getFields(DOCID, sheetId);
      if (currentFields.errcode === 0) {
        const defaultCol = (currentFields.fields || []).find(f => f.field_title === '智能表列');
        if (defaultCol) {
          const delResult = await wecom.deleteFields(DOCID, sheetId, [defaultCol.field_id]);
          if (delResult.errcode === 0) {
            console.log('[fields/add] 已删除默认「智能表列」');
          }
        }
      }
    } catch (e) {
      console.warn('[fields/add] 删除默认列失败（可忽略）:', e.message);
    }

    clearSchemaCache();
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/fields/delete
 * Body: { sheetId, fieldIds }
 */
app.post('/api/smartsheet/fields/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fieldIds } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!fieldIds || !Array.isArray(fieldIds)) throw new Error('fieldIds 必须是数组');
    const result = await wecom.deleteFields(DOCID, sheetId, fieldIds);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    clearSchemaCache();
    res.json({ success: true, message: `已删除 ${fieldIds.length} 个字段` });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/fields/update
 * Body: { sheetId, fields }
 */
app.post('/api/smartsheet/fields/update', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fields } = req.body || {};
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    if (!fields || !Array.isArray(fields)) throw new Error('fields 必须是数组');
    const result = await wecom.updateFields(DOCID, sheetId, fields);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    clearSchemaCache();
    res.json({ success: true, message: '字段已更新' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 视图管理 API ----

/**
 * GET /api/smartsheet/views?sheetId=xxx
 */
app.get('/api/smartsheet/views', requirePermission('smartsheet'), async (req, res) => {
  try {
    const sheetId = req.query.sheetId;
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    const result = await wecom.getViews(DOCID, sheetId);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.views || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/views/add
 * Body: { sheetId, viewTitle, viewType?, propertyGantt?, propertyCalendar? }
 */
app.post('/api/smartsheet/views/add', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, viewTitle, viewType, propertyGantt, propertyCalendar } = req.body || {};
    if (!sheetId || !viewTitle) throw new Error('缺少 sheetId 或 viewTitle 参数');
    const result = await wecom.addView(DOCID, sheetId, { viewTitle, viewType, propertyGantt, propertyCalendar });
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.view });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/views/delete
 * Body: { sheetId, viewIds }
 */
app.post('/api/smartsheet/views/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, viewIds } = req.body || {};
    if (!sheetId || !viewIds) throw new Error('缺少 sheetId 或 viewIds 参数');
    const result = await wecom.deleteView(DOCID, sheetId, viewIds);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, message: '视图已删除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/views/update
 * Body: { sheetId, viewId, viewTitle?, property? }
 */
app.post('/api/smartsheet/views/update', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, viewId, viewTitle, property } = req.body || {};
    if (!sheetId || !viewId) throw new Error('缺少 sheetId 或 viewId 参数');
    const result = await wecom.updateView(DOCID, sheetId, viewId, { viewTitle, property });
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.view });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 编组管理 API ----

/**
 * GET /api/smartsheet/groups?sheetId=xxx
 */
app.get('/api/smartsheet/groups', requirePermission('smartsheet'), async (req, res) => {
  try {
    const sheetId = req.query.sheetId;
    if (!sheetId) throw new Error('缺少 sheetId 参数');
    const result = await wecom.getGroups(DOCID, sheetId);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.field_groups || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/groups/add
 * Body: { sheetId, name, children? }
 */
app.post('/api/smartsheet/groups/add', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, name, children } = req.body || {};
    if (!sheetId || !name) throw new Error('缺少 sheetId 或 name 参数');
    const result = await wecom.addGroup(DOCID, sheetId, name, children);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.field_group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/groups/delete
 * Body: { sheetId, fieldGroupId }
 */
app.post('/api/smartsheet/groups/delete', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fieldGroupId } = req.body || {};
    if (!sheetId || !fieldGroupId) throw new Error('缺少 sheetId 或 fieldGroupId 参数');
    const result = await wecom.deleteGroup(DOCID, sheetId, fieldGroupId);
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, message: '编组已删除' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/smartsheet/groups/update
 * Body: { sheetId, fieldGroupId, name?, children? }
 */
app.post('/api/smartsheet/groups/update', requirePermission('smartsheet'), async (req, res) => {
  try {
    const { sheetId, fieldGroupId, name, children } = req.body || {};
    if (!sheetId || !fieldGroupId) throw new Error('缺少 sheetId 或 fieldGroupId 参数');
    const result = await wecom.updateGroup(DOCID, sheetId, fieldGroupId, { name, children });
    if (result.errcode !== 0) throw new Error(`[${result.errcode}] ${result.errmsg}`);
    res.json({ success: true, data: result.field_group });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ---- 辅助函数 ----

function findSheetByTitle(sheets, title) {
  return (sheets || []).find(s => s.title === title) || null;
}

function findFieldStrict(fieldTitles, keywords) {
  const titles = fieldTitles || [];
  for (const kw of keywords) {
    const match = titles.find(t => String(t).toLowerCase().includes(String(kw).toLowerCase()));
    if (match) return match;
  }
  return null;
}

function extractFactoryFromBrand(brand) {
  const first = String(brand || '').trim().split(/\s+/)[0] || '';
  const cleaned = first.replace(/[^\w-]/g, '').toUpperCase();
  return cleaned || null;
}

function fieldMetaForDrilldown(field) {
  return {
    fieldId: field.field_id,
    title: field.field_title,
    type: field.field_type,
  };
}

function sheetMetaForDrilldown(sheet) {
  return {
    sheetId: sheet.sheet_id,
    title: sheet.title,
    fields: (sheet.fields || []).map(fieldMetaForDrilldown),
  };
}

function flattenRecordForDrilldown(record, fields) {
  const values = {};
  (fields || []).forEach(field => {
    const title = field.field_title;
    values[title] = wecom.getRecordValue(record, title);
  });
  return {
    recordId: record.record_id,
    values,
  };
}

function recordOptionForUi(record, fields) {
  const values = {};
  (fields || []).forEach(field => {
    values[field.field_title] = wecom.getRecordValue(record, field.field_title);
  });
  const priority = ['柜号', '订单编号', '品牌', '产品品类', '国家', '当前位置', '更新时间', '放柜时间', '客户', '目的地'];
  const labelParts = priority
    .map(title => values[title])
    .filter(v => v !== null && v !== undefined && v !== '')
    .map(v => String(v))
    .slice(0, 5);
  const fallback = Object.values(values).filter(v => v !== null && v !== undefined && v !== '').map(v => String(v)).slice(0, 4);
  const label = (labelParts.length ? labelParts : fallback).join(' / ') || record.record_id;
  return {
    recordId: record.record_id,
    label,
    values,
  };
}

function findReferencedSheetIds(field, sheets) {
  const found = new Set();
  const sheetIds = new Set((sheets || []).map(s => s.sheet_id));
  const walk = (value) => {
    if (!value) return;
    if (typeof value === 'string') {
      if (sheetIds.has(value)) found.add(value);
      return;
    }
    if (Array.isArray(value)) return value.forEach(walk);
    if (typeof value === 'object') {
      Object.entries(value).forEach(([key, val]) => {
        const k = String(key).toLowerCase();
        if ((k.includes('sheet') || k.includes('table')) && typeof val === 'string' && sheetIds.has(val)) {
          found.add(val);
        }
        walk(val);
      });
    }
  };
  walk(field);
  return Array.from(found);
}

function drillValueMatches(value, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return false;
  if (Array.isArray(value)) {
    return value.some(v => drillValueMatches(v, query));
  }
  if (value && typeof value === 'object') {
    return Object.values(value).some(v => drillValueMatches(v, query));
  }
  return String(value == null ? '' : value).trim().toLowerCase().includes(q);
}

/**
 * 在字段标题列表中按关键词优先级查找匹配字段
 */
function findField(fieldTitles, keywords) {
  for (const kw of keywords) {
    const match = fieldTitles.find(t => t.toLowerCase().includes(kw.toLowerCase()));
    if (match) return match;
  }
  // 兜底：返回第一个字段
  return fieldTitles.length > 0 ? fieldTitles[0] : null;
}

/**
 * 从记录中解析时间值
 */
function parseTimeValue(record, timeField) {
  if (!timeField) {
    // 优先用 update_time
    if (record.update_time && record.update_time !== '0') {
      return formatTimestamp(record.update_time);
    }
    return record.create_time ? formatTimestamp(record.create_time) : null;
  }

  const raw = wecom.getRecordValue(record, timeField);
  if (!raw) return null;

  // 可能是毫秒时间戳（数字/字符串）
  const ts = parseInt(raw);
  if (!isNaN(ts) && ts > 1000000000000) {
    return formatTimestamp(ts);
  }
  return raw; // 直接返回原始字符串
}

function formatTimestamp(ts) {
  const ms = typeof ts === 'string' ? parseInt(ts) : ts;
  if (isNaN(ms)) return ts;
  const d = new Date(ms);
  return d.toISOString();
}

/**
 * 解析物流时间值（企微 DATE_TIME 字段返回毫秒时间戳字符串）
 */
function parseLogisticsTime(raw) {
  if (!raw) return null;
  // 尝试解析为数字时间戳
  const ts = parseInt(raw);
  if (!isNaN(ts) && ts > 1000000000000) {
    const d = new Date(ts);
    if (!isNaN(d.getTime())) return d;
  }
  // 尝试解析 ISO 字符串
  const d = new Date(raw);
  if (!isNaN(d.getTime())) return d;
  return null;
}

// ---- 启动 ----

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`\n🍈  榴莲温度监控看板服务已启动`);
    console.log(`   本地访问: http://localhost:${PORT}`);
    console.log(`   DOCID: ${DOCID || '（未配置）'}`);
    console.log(`   温度告警阈值: ${process.env.TEMP_MIN || 2}°C ~ ${process.env.TEMP_MAX || 8}°C\n`);

    // 启动新闻自动抓取
    initNewsFetcher();
  });
}

module.exports = app;
