/**
 * 企业微信智能表格 API 封装
 *
 * 使用前需设置环境变量:
 *   CORPID      - 企业ID
 *   CORPSECRET  - 应用密钥
 *   DOCID       - 智能表格文档ID
 */

const axios = require('axios');

const BASE_URL = 'https://qyapi.weixin.qq.com/cgi-bin';

// ---- token 管理 ----

let tokenCache = {
  token: null,
  expiresAt: 0, // 毫秒时间戳
};

/**
 * 获取有效的 access_token（自动缓存与刷新）
 */
async function getAccessToken() {
  const now = Date.now();
  // 提前 5 分钟刷新，避免边界情况
  if (tokenCache.token && tokenCache.expiresAt > now + 5 * 60 * 1000) {
    return tokenCache.token;
  }

  const corpid = process.env.CORPID;
  const corpsecret = process.env.CORPSECRET;
  if (!corpid || !corpsecret) {
    throw new Error('缺少 CORPID 或 CORPSECRET 环境变量配置');
  }

  const url = `${BASE_URL}/gettoken`;
  const resp = await axios.get(url, {
    params: { corpid, corpsecret },
  });

  const { errcode, errmsg, access_token, expires_in } = resp.data;

  if (errcode !== 0) {
    throw new Error(`获取 access_token 失败: [${errcode}] ${errmsg}`);
  }

  tokenCache.token = access_token;
  tokenCache.expiresAt = now + (expires_in || 7200) * 1000;

  console.log(`[wecom] access_token 已刷新，有效期至 ${new Date(tokenCache.expiresAt).toLocaleString()}`);
  return access_token;
}

/**
 * 清除 token 缓存（强制下次请求时重新获取）
 */
function clearTokenCache() {
  tokenCache.token = null;
  tokenCache.expiresAt = 0;
}

// ---- 通用请求封装 ----

/**
 * 发送 POST 请求到企微 API，自动附带 access_token
 * 遇到 token 错误时自动重试一次
 */
async function apiPost(path, body = {}) {
  let token = await getAccessToken();
  const url = `${BASE_URL}${path}?access_token=${token}`;

  try {
    const resp = await axios.post(url, body, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000,
    });
    const data = resp.data;

    // token 失效，清除缓存后重试一次
    if (data.errcode === 40014 || data.errcode === 42001) {
      console.log('[wecom] token 已失效，重新获取后重试...');
      clearTokenCache();
      token = await getAccessToken();
      const retryUrl = `${BASE_URL}${path}?access_token=${token}`;
      const retryResp = await axios.post(retryUrl, body, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000,
      });
      return retryResp.data;
    }

    return data;
  } catch (err) {
    if (err.response) {
      // 企微返回了错误响应
      const msg = `企微 API 错误 [${path}]: ${JSON.stringify(err.response.data)}`;
      console.error(msg);
      throw new Error(msg);
    }
    throw err;
  }
}

// ---- 智能表格 API ----

/**
 * 获取文档下所有子表
 * @param {string} docid - 文档ID
 * @param {object} [options]
 * @param {string} [options.sheetId] - 指定子表ID
 * @param {boolean} [options.needAllTypeSheet] - 是否包含仪表盘和说明页
 * @returns {Promise<{sheet_list: Array}>}
 */
async function getSheets(docid, options = {}) {
  const body = { docid };
  if (options.sheetId) body.sheet_id = options.sheetId;
  if (options.needAllTypeSheet) body.need_all_type_sheet = true;

  return apiPost('/wedoc/smartsheet/get_sheet', body);
}

/**
 * 获取子表的字段定义
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {object} [options]
 * @param {string[]} [options.fieldIds] - 按字段ID筛选
 * @param {string[]} [options.fieldTitles] - 按字段标题筛选
 * @param {number} [options.offset] - 偏移量
 * @param {number} [options.limit] - 每页数量
 * @returns {Promise<{total: number, fields: Array}>}
 */
async function getFields(docid, sheetId, options = {}) {
  const body = { docid, sheet_id: sheetId };
  if (options.fieldIds) body.field_ids = options.fieldIds;
  if (options.fieldTitles) body.field_titles = options.fieldTitles;
  if (options.offset !== undefined) body.offset = options.offset;
  if (options.limit !== undefined) body.limit = options.limit;

  return apiPost('/wedoc/smartsheet/get_fields', body);
}

/**
 * 查询子表记录
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {object} [options]
 * @param {string} [options.viewId] - 视图ID
 * @param {string[]} [options.recordIds] - 按记录ID筛选
 * @param {string} [options.keyType] - key类型: 'CELL_VALUE_KEY_TYPE_FIELD_TITLE' 或 'CELL_VALUE_KEY_TYPE_FIELD_ID'
 * @param {string[]} [options.fieldTitles] - 返回指定列（按标题）
 * @param {string[]} [options.fieldIds] - 返回指定列（按ID）
 * @param {Array} [options.sort] - 排序规则 [{field_title, desc}]
 * @param {number} [options.offset] - 偏移量
 * @param {number} [options.limit] - 每页数量，最大1000
 * @param {object} [options.filterSpec] - 过滤条件
 * @returns {Promise<{total: number, has_more: boolean, next: number, records: Array}>}
 */
async function getRecords(docid, sheetId, options = {}) {
  const body = {
    docid,
    sheet_id: sheetId,
    key_type: options.keyType || 'CELL_VALUE_KEY_TYPE_FIELD_TITLE',
  };

  if (options.viewId) body.view_id = options.viewId;
  if (options.recordIds) body.record_ids = options.recordIds;
  if (options.fieldTitles) body.field_titles = options.fieldTitles;
  if (options.fieldIds) body.field_ids = options.fieldIds;
  if (options.sort) body.sort = options.sort;
  if (options.offset !== undefined) body.offset = options.offset;
  if (options.limit !== undefined) body.limit = options.limit;
  if (options.filterSpec) body.filter_spec = options.filterSpec;

  return apiPost('/wedoc/smartsheet/get_records', body);
}

/**
 * 获取所有记录（自动处理分页）
 * @param {string} docid
 * @param {string} sheetId
 * @param {object} [options] - 同 getRecords（不需要传 offset/limit）
 * @returns {Promise<Array>} 所有记录数组
 */
async function getAllRecords(docid, sheetId, options = {}) {
  const allRecords = [];
  let offset = 0;
  const limit = 1000;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const result = await getRecords(docid, sheetId, {
      ...options,
      offset,
      limit,
    });

    if (result.errcode !== 0) {
      throw new Error(`查询记录失败: [${result.errcode}] ${result.errmsg}`);
    }

    if (result.records && result.records.length > 0) {
      allRecords.push(...result.records);
    }

    if (!result.has_more) break;
    offset = result.next || offset + limit;
  }

  return allRecords;
}

// ---- 文档/子表/字段的写操作 ----

/**
 * 创建文档（文档/表格/智能表格）
 * @param {object} options
 * @param {number} options.docType - 3:文档 4:表格 10:智能表格
 * @param {string} options.docName - 文档名称
 * @param {string} [options.spaceId] - 空间ID
 * @param {string} [options.fatherId] - 父目录ID
 * @param {string[]} [options.adminUsers] - 管理员userid
 * @returns {Promise<{url: string, docid: string}>}
 */
async function createDoc(options = {}) {
  const body = {
    doc_type: options.docType || 10, // 默认智能表格
    doc_name: options.docName || '温度监控数据',
  };
  if (options.spaceId) body.spaceid = options.spaceId;
  if (options.fatherId) body.fatherid = options.fatherId;
  if (options.adminUsers) body.admin_users = options.adminUsers;

  return apiPost('/wedoc/create_doc', body);
}

/**
 * 在文档中添加子表
 * @param {string} docid - 文档ID
 * @param {object} options
 * @param {string} [options.title] - 子表标题
 * @param {number} [options.index] - 子表下标
 * @returns {Promise<{properties: {sheet_id: string, title: string, index: number}}>}
 */
async function addSheet(docid, options = {}) {
  const body = { docid, properties: {} };
  if (options.title) body.properties.title = options.title;
  if (options.index !== undefined) body.properties.index = options.index;

  return apiPost('/wedoc/smartsheet/add_sheet', body);
}

/**
 * 在子表中添加字段
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {Array} fields - 字段定义数组，每个元素包含 field_title, field_type 及对应的 property_xxx
 * @returns {Promise<{fields: Array}>}
 */
async function addFields(docid, sheetId, fields) {
  const body = { docid, sheet_id: sheetId, fields };
  return apiPost('/wedoc/smartsheet/add_fields', body);
}

// ---- 文档管理 ----

/**
 * 重命名文档
 * @param {string} docid - 文档ID
 * @param {string} newName - 新名称（最多255字符）
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function renameDoc(docid, newName) {
  return apiPost('/wedoc/rename_doc', { docid, new_name: newName });
}

/**
 * 删除文档（仅可删除应用自己创建的文档）
 * @param {string} docid - 文档ID
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteDoc(docid) {
  return apiPost('/wedoc/del_doc', { docid });
}

/**
 * 获取文档基础信息
 * @param {string} docid - 文档ID
 * @returns {Promise<{errcode: number, errmsg: string, doc_base_info: {docid, doc_name, create_time, modify_time, doc_type}}>}
 */
async function getDocInfo(docid) {
  return apiPost('/wedoc/get_doc_base_info', { docid });
}

// ---- 子表管理 ----

/**
 * 删除子表
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteSheet(docid, sheetId) {
  return apiPost('/wedoc/smartsheet/delete_sheet', { docid, sheet_id: sheetId });
}

/**
 * 更新子表（目前仅支持修改标题）
 * @param {string} docid - 文档ID
 * @param {object} properties - 子表属性 {sheet_id, title}
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function updateSheet(docid, properties) {
  return apiPost('/wedoc/smartsheet/update_sheet', { docid, properties });
}

// ---- 记录管理 ----

/**
 * 添加记录
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {Array} records - 记录数组 [{values: {字段标题/ID: 值}}]
 * @param {string} [keyType] - key类型，默认 'CELL_VALUE_KEY_TYPE_FIELD_TITLE'
 * @returns {Promise<{errcode: number, errmsg: string, records: Array}>}
 */
async function addRecords(docid, sheetId, records, keyType) {
  const body = {
    docid,
    sheet_id: sheetId,
    key_type: keyType || 'CELL_VALUE_KEY_TYPE_FIELD_TITLE',
    records,
  };
  return apiPost('/wedoc/smartsheet/add_records', body);
}

/**
 * 删除记录
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string[]} recordIds - 要删除的记录ID列表（建议单次不超过500条）
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteRecords(docid, sheetId, recordIds) {
  return apiPost('/wedoc/smartsheet/delete_records', {
    docid,
    sheet_id: sheetId,
    record_ids: recordIds,
  });
}

/**
 * 更新记录
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {Array} records - 记录数组 [{record_id: 'xxx', values: {字段标题/ID: 值}}]
 * @param {string} [keyType] - key类型，默认 'CELL_VALUE_KEY_TYPE_FIELD_TITLE'
 * @returns {Promise<{errcode: number, errmsg: string, records: Array}>}
 */
async function updateRecords(docid, sheetId, records, keyType) {
  const body = {
    docid,
    sheet_id: sheetId,
    key_type: keyType || 'CELL_VALUE_KEY_TYPE_FIELD_TITLE',
    records,
  };
  return apiPost('/wedoc/smartsheet/update_records', body);
}

// ---- 字段管理（写操作） ----

/**
 * 删除字段
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string[]} fieldIds - 要删除的字段ID列表
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteFields(docid, sheetId, fieldIds) {
  return apiPost('/wedoc/smartsheet/delete_fields', {
    docid,
    sheet_id: sheetId,
    field_ids: fieldIds,
  });
}

/**
 * 更新字段（只能更新字段名和属性，不能更新字段类型）
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {Array} fields - 字段数组 [{field_id, field_title?, field_type, property_xxx?}]
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function updateFields(docid, sheetId, fields) {
  return apiPost('/wedoc/smartsheet/update_fields', {
    docid,
    sheet_id: sheetId,
    fields,
  });
}

// ---- 视图管理 ----

/**
 * 查询视图
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {object} [options]
 * @param {string[]} [options.viewIds] - 按视图ID筛选
 * @param {string[]} [options.viewTitles] - 按视图标题筛选
 * @param {number} [options.offset] - 偏移量
 * @param {number} [options.limit] - 每页数量
 * @returns {Promise<{errcode: number, errmsg: string, views: Array}>}
 */
async function getViews(docid, sheetId, options = {}) {
  const body = { docid, sheet_id: sheetId };
  if (options.viewIds) body.view_ids = options.viewIds;
  if (options.viewTitles) body.view_titles = options.viewTitles;
  if (options.offset !== undefined) body.offset = options.offset;
  if (options.limit !== undefined) body.limit = options.limit;
  return apiPost('/wedoc/smartsheet/get_views', body);
}

/**
 * 添加视图
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {object} options
 * @param {string} options.viewTitle - 视图标题
 * @param {string} options.viewType - 视图类型: VIEW_TYPE_GRID/KANBAN/GALLERY/GANTT/CALENDAR
 * @param {object} [options.propertyGantt] - 甘特图属性 {start_date_field_id, end_date_field_id}
 * @param {object} [options.propertyCalendar] - 日历视图属性 {start_date_field_id, end_date_field_id}
 * @returns {Promise<{errcode: number, errmsg: string, view: {view_id, view_title, view_type}}>}
 */
async function addView(docid, sheetId, options = {}) {
  const body = {
    docid,
    sheet_id: sheetId,
    view_title: options.viewTitle,
    view_type: options.viewType || 'VIEW_TYPE_GRID',
  };
  if (options.propertyGantt) body.property_gantt = options.propertyGantt;
  if (options.propertyCalendar) body.property_calendar = options.propertyCalendar;
  return apiPost('/wedoc/smartsheet/add_view', body);
}

/**
 * 删除视图
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string | string[]} viewIds - 要删除的视图ID（支持单个或数组）
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteView(docid, sheetId, viewIds) {
  const ids = Array.isArray(viewIds) ? viewIds : [viewIds];
  return apiPost('/wedoc/smartsheet/delete_views', { docid, sheet_id: sheetId, view_ids: ids });
}

/**
 * 更新视图
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string} viewId - 视图ID
 * @param {object} options - 更新选项（viewTitle, property 等）
 * @returns {Promise<{errcode: number, errmsg: string, view: object}>}
 */
async function updateView(docid, sheetId, viewId, options = {}) {
  const body = { docid, sheet_id: sheetId, view_id: viewId };
  if (options.viewTitle) body.view_title = options.viewTitle;
  if (options.property) body.property = options.property;
  return apiPost('/wedoc/smartsheet/update_view', body);
}

// ---- 编组管理 ----

/**
 * 获取字段编组
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {object} [options]
 * @param {number} [options.offset] - 偏移量
 * @param {number} [options.limit] - 每页数量
 * @returns {Promise<{errcode: number, errmsg: string, field_groups: Array}>}
 */
async function getGroups(docid, sheetId, options = {}) {
  const body = { docid, sheet_id: sheetId };
  if (options.offset !== undefined) body.offset = options.offset;
  if (options.limit !== undefined) body.limit = options.limit;
  return apiPost('/wedoc/smartsheet/get_field_groups', body);
}

/**
 * 添加字段编组
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string} name - 编组名称（不可重复）
 * @param {Array<{field_id: string}>} [children] - 编组内的字段ID列表
 * @returns {Promise<{errcode: number, errmsg: string, field_group: {field_group_id, name, children}}>}
 */
async function addGroup(docid, sheetId, name, children) {
  const body = { docid, sheet_id: sheetId, name };
  if (children) body.children = children;
  return apiPost('/wedoc/smartsheet/add_field_group', body);
}

/**
 * 删除字段编组
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string} fieldGroupId - 编组ID
 * @returns {Promise<{errcode: number, errmsg: string}>}
 */
async function deleteGroup(docid, sheetId, fieldGroupId) {
  return apiPost('/wedoc/smartsheet/delete_field_groups', {
    docid,
    sheet_id: sheetId,
    field_group_ids: [fieldGroupId],
  });
}

/**
 * 更新字段编组
 * @param {string} docid - 文档ID
 * @param {string} sheetId - 子表ID
 * @param {string} fieldGroupId - 编组ID
 * @param {object} options - 更新选项 {name?, children?}
 * @returns {Promise<{errcode: number, errmsg: string, field_group: object}>}
 */
async function updateGroup(docid, sheetId, fieldGroupId, options = {}) {
  const body = { docid, sheet_id: sheetId, field_group_id: fieldGroupId };
  if (options.name) body.name = options.name;
  if (options.children) body.children = options.children;
  return apiPost('/wedoc/smartsheet/update_field_group', body);
}

// ---- 工具方法 ----

/**
 * 从记录中提取字段值（简化访问）
 * @param {object} record - 企微返回的 record 对象
 * @param {string} fieldTitle - 字段标题
 * @returns {*} 字段值
 */
function getRecordValue(record, fieldTitle) {
  if (!record.values || !record.values[fieldTitle]) return null;

  const val = record.values[fieldTitle];

  // 文本类型字段: [{type: 'text', text: '...'}]
  if (Array.isArray(val) && val.length > 0 && val[0].type === 'text') {
    return val[0].text;
  }

  // 链接类型字段
  if (Array.isArray(val) && val.length > 0 && val[0].type === 'url') {
    return val[0].link || val[0].text;
  }

  // 单选/多选
  if (Array.isArray(val) && val.length > 0 && val[0].text !== undefined) {
    return val.map(v => v.text).join(', ');
  }

  // 数字、日期字符串、布尔等直接返回
  return val;
}

module.exports = {
  getAccessToken,
  clearTokenCache,
  getSheets,
  getFields,
  getRecords,
  getAllRecords,
  getRecordValue,
  createDoc,
  addSheet,
  addFields,
  // 文档管理
  renameDoc,
  deleteDoc,
  getDocInfo,
  // 子表管理
  deleteSheet,
  updateSheet,
  // 记录管理
  addRecords,
  deleteRecords,
  updateRecords,
  // 字段管理（写操作）
  deleteFields,
  updateFields,
  // 视图管理
  getViews,
  addView,
  deleteView,
  updateView,
  // 编组管理
  getGroups,
  addGroup,
  deleteGroup,
  updateGroup,
};
