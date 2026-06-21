/**
 * 智能表格管理 — 后台「🗄 智能表格管理」tab 的逻辑
 * 连接企业微信真实数据：记录 / 字段 / 视图 / 编组 / 文档 CRUD。
 * 函数保持全局（供 HTML 内联 onclick 调用）。认证与用户显示由 admin.html 的主脚本统一处理，
 * 本文件只在首次切到该 tab 时由 initSmartsheet() 触发加载。
 * 注意：本文件不要定义 closeModal（主脚本用 closeModalById），避免命名冲突。
 */

// ============ 全局状态 ============
let cachedSheets = [];
let cachedFields = [];
let loadedRecords = [];
let currentEditRecordId = null;
let _smartsheetInited = false;
let aiImportPreview = null;

// ============ 认证 fetch 包装 ============
async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options);
  if (resp.status === 401) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    throw new Error('Unauthorized');
  }
  if (resp.status === 403) {
    alert('权限不足，需要管理员权限');
    throw new Error('Forbidden');
  }
  return resp;
}

// 首次切到「智能表格管理」tab 时调用
async function initSmartsheet() {
  if (_smartsheetInited) return;
  _smartsheetInited = true;
  refreshStatus();
  await populateSheetSelects();
}

async function refreshStatus() {
  try {
    const resp = await apiFetch('/api/config/info');
    const json = await resp.json();
    if (json.success && json.data) {
      document.getElementById('statusDocid').textContent = json.data.docid || '-';
      document.getElementById('statusSheets').textContent = json.data.sheets ? json.data.sheets.length : '0';
      document.getElementById('statusApi').textContent = '已连接';
      document.getElementById('statusApi').className = 'value status-ok';
    } else {
      document.getElementById('statusApi').textContent = '连接失败';
      document.getElementById('statusApi').className = 'value status-err';
      document.getElementById('statusDocid').textContent = '-';
      document.getElementById('statusSheets').textContent = '-';
    }
  } catch (e) {
    document.getElementById('statusApi').textContent = '连接失败';
    document.getElementById('statusApi').className = 'value status-err';
  }
}

// ============ 子表下拉框 ============
async function ensureSheetsLoaded() {
  if (cachedSheets.length > 0) return cachedSheets;
  try {
    const resp = await apiFetch('/api/config/info');
    const json = await resp.json();
    if (json.success && json.data) {
      cachedSheets = json.data.sheets || [];
      cachedFields = [];
      cachedSheets.forEach(s => {
        (s.fields || []).forEach(f => { cachedFields.push(f); });
      });
    }
  } catch (e) { console.error(e); }
  return cachedSheets;
}

async function populateSheetSelects() {
  const sheets = await ensureSheetsLoaded();
  ['recSheetId', 'fldSheetId', 'viewSheetId', 'grpSheetId'].forEach(selId => {
    const sel = document.getElementById(selId);
    if (!sel) return;
    const currentVal = sel.value;
    sel.innerHTML = '<option value="">-- 选择子表 --</option>';
    sheets.forEach(s => {
      sel.innerHTML += `<option value="${s.sheet_id}">${s.title} (${s.sheet_id})</option>`;
    });
    if (sheets.length === 1 && (!currentVal || currentVal === '')) {
      sel.value = sheets[0].sheet_id;
      sel.dispatchEvent(new Event('change'));
    } else if (currentVal && sheets.find(s => s.sheet_id === currentVal)) {
      sel.value = currentVal;
    }
  });
}

// ============ 一键创建 ============
async function runSetup() {
  const btn = document.getElementById('btnSetup');
  const out = document.getElementById('setupOutput');
  btn.disabled = true;
  btn.textContent = '⏳ 创建中...';
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在创建智能表格文档，请稍候...\n';

  try {
    const docName = document.getElementById('docName').value || '榴莲温度监控数据';
    const sheetTitle = document.getElementById('sheetTitle').value || '温度记录';
    const resp = await apiFetch('/api/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ docName, sheetTitle }),
    });
    const json = await resp.json();
    if (json.success) {
      out.className = 'output success';
      out.textContent = [
        '✅ 创建成功！', '',
        `📄 文档ID: ${json.data.docid}`,
        `🔗 文档链接: ${json.data.url}`,
        `📋 子表ID: ${json.data.sheetId}`,
        `📝 子表名: ${json.data.sheetTitle}`,
        '', '字段列表:',
        ...json.data.fields.map(f => `  • ${f.field_title} (${f.field_type}) - ${f.field_id}`),
        '', json.data.message,
      ].join('\n');
      refreshStatus();
      cachedSheets = [];
      await populateSheetSelects();
    } else {
      out.className = 'output error';
      out.textContent = '❌ 创建失败: ' + (json.error || '未知错误');
    }
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  } finally {
    btn.disabled = false;
    btn.textContent = '🚀 一键创建';
  }
}

function stopSetup() {}

// ============ 快捷操作 ============
async function doAction(path, method) {
  const wrap = document.getElementById('actionOutputWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = `<div class="output">正在请求 ${method} /api/${path} ...</div>`;
  try {
    const opts = { method };
    if (method === 'POST') opts.headers = { 'Content-Type': 'application/json' };
    const resp = await apiFetch(`/api/${path}`, opts);
    const json = await resp.json();
    showWithToggle(wrap, json);
  } catch (e) {
    wrap.innerHTML = `<div class="output error">❌ 请求异常: ${e.message}</div>`;
  }
}

async function viewTableStructure() {
  const wrap = document.getElementById('actionOutputWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = `<div class="output">正在加载表格结构...</div>`;
  try {
    const resp = await apiFetch('/api/config/info');
    const json = await resp.json();
    if (!json.success) throw new Error(json.error);
    const rows = [];
    (json.data.sheets || []).forEach(sheet => {
      (sheet.fields || []).forEach(f => {
        let props = '-';
        if (f.property_number) props = `NUMBER(decimals:${f.property_number.decimal_places})`;
        else if (f.property_date_time) props = `DATE_TIME(${f.property_date_time.format})`;
        else if (f.property_single_select) props = `SELECT(options:${f.property_single_select.options?.length||0})`;
        else if (f.field_type) props = f.field_type.replace('FIELD_TYPE_','');
        rows.push({
          '子表': sheet.title,
          '子表ID': sheet.sheet_id,
          '字段ID': f.field_id,
          '字段标题': f.field_title,
          '字段类型': f.field_type ? f.field_type.replace('FIELD_TYPE_','') : '-',
          '属性': props,
        });
      });
    });
    showWithToggle(wrap, rows);
  } catch (e) {
    wrap.innerHTML = `<div class="output error">❌ ${e.message}</div>`;
  }
}

async function viewDashboardData() {
  const wrap = document.getElementById('actionOutputWrap');
  wrap.style.display = 'block';
  wrap.innerHTML = `<div class="output">正在加载看板数据...</div>`;
  try {
    const resp = await apiFetch('/api/dashboard?hours=720&limit=500');
    const json = await resp.json();
    if (!json.success) throw new Error(json.error);
    const result = {
      stats: json.data.stats,
      alerts: json.data.alerts,
      records: json.data.records,
    };
    showWithToggle(wrap, result);
  } catch (e) {
    wrap.innerHTML = `<div class="output error">❌ ${e.message}</div>`;
  }
}

async function testCallback() {
  const wrap = document.getElementById('actionOutputWrap');
  wrap.style.display = 'block';
  try {
    const resp = await apiFetch('/callback?msg_signature=test&timestamp=1&nonce=2&echostr=hello');
    const text = await resp.text();
    wrap.innerHTML = `<div class="output">HTTP 状态: ${resp.status}\n响应内容: ${text}\n\n（签名验证失败是正常的，说明接口在正常工作）</div>`;
  } catch (e) {
    wrap.innerHTML = `<div class="output error">❌ 请求异常: ${e.message}</div>`;
  }
}

// ============ JSON ↔ 表格 通用组件 ============
function showWithToggle(container, data) {
  const jsonStr = JSON.stringify(data, null, 2);
  const idBase = 'tv_' + Math.random().toString(36).slice(2, 8);

  container.innerHTML = `
    <div class="view-bar">
      <button class="btn-toggle active" id="${idBase}_btnTable" onclick="switchView('${idBase}','table')">📋 表格</button>
      <button class="btn-toggle" id="${idBase}_btnJson" onclick="switchView('${idBase}','json')">{ } JSON</button>
      <span class="view-label"></span>
    </div>
    <div id="${idBase}_table"></div>
    <div class="output" id="${idBase}_json" style="display:none">${escHtml(jsonStr)}</div>
  `;

  container._toggleData = data;
  container._toggleId = idBase;
  renderTableView(idBase, data);
}

function switchView(idBase, mode) {
  const btnTable = document.getElementById(idBase + '_btnTable');
  const btnJson = document.getElementById(idBase + '_btnJson');
  const divTable = document.getElementById(idBase + '_table');
  const divJson = document.getElementById(idBase + '_json');

  if (mode === 'table') {
    btnTable.classList.add('active');
    btnJson.classList.remove('active');
    divTable.style.display = 'block';
    divJson.style.display = 'none';
  } else {
    btnTable.classList.remove('active');
    btnJson.classList.add('active');
    divTable.style.display = 'none';
    divJson.style.display = 'block';
  }
}

function renderTableView(idBase, data) {
  const container = document.getElementById(idBase + '_table');
  if (!container) return;

  try {
    let rows = normalizeToRows(data);
    if (!rows || rows.length === 0) {
      container.innerHTML = '<p class="empty-hint">无数据</p>';
      return;
    }

    const keys = Object.keys(rows[0]);
    if (keys.length === 0) {
      container.innerHTML = '<p class="empty-hint">无列</p>';
      return;
    }

    const maxH = rows.length > 20 ? 'max-height:420px;' : '';
    let html = `<div class="data-table-wrap" style="${maxH}"><table class="data-table"><thead><tr>`;
    keys.forEach(k => { html += `<th>${escHtml(k)}</th>`; });
    html += '</tr></thead><tbody>';

    rows.forEach(row => {
      html += '<tr>';
      keys.forEach(k => {
        const v = row[k];
        let display = '';
        let cls = '';
        if (v === null || v === undefined) {
          display = '-';
          cls = 'cell-mono';
        } else if (typeof v === 'number') {
          display = String(v);
          cls = 'cell-num';
        } else if (typeof v === 'boolean') {
          display = v ? '✅' : '❌';
        } else if (typeof v === 'object') {
          display = escHtml(JSON.stringify(v));
          cls = 'cell-json';
        } else {
          display = escHtml(String(v));
        }
        html += `<td class="${cls}">${display}</td>`;
      });
      html += '</tr>';
    });

    html += '</tbody></table></div>';
    html += `<div class="view-label" style="margin-top:4px;font-size:0.75rem;color:var(--text-muted)">共 ${rows.length} 行 × ${keys.length} 列</div>`;
    container.innerHTML = html;
  } catch (e) {
    container.innerHTML = `<div class="output error">表格渲染失败: ${escHtml(e.message)}</div>`;
  }
}

function normalizeToRows(data) {
  if (Array.isArray(data)) {
    if (data.length === 0) return [];
    if (typeof data[0] === 'object' && data[0] !== null) return data;
    return data.map((v, i) => ({ '索引': i, '值': v }));
  }
  if (data && typeof data === 'object') {
    if (Array.isArray(data.records)) return data.records;
    const rows = [];
    Object.entries(data).forEach(([k, v]) => {
      if (Array.isArray(v)) {
        v.forEach((item, i) => {
          if (typeof item === 'object' && item !== null) {
            rows.push({ _key: k, _idx: i, ...item });
          } else {
            rows.push({ '键': k, '索引': i, '值': item });
          }
        });
      } else if (typeof v === 'object' && v !== null) {
        rows.push({ '键': k, ...flattenObj(v) });
      } else {
        rows.push({ '键': k, '值': v });
      }
    });
    if (rows.length > 0) return rows;
    return [flattenObj(data)];
  }
  return [{ '值': data }];
}

function flattenObj(obj, prefix = '') {
  const result = {};
  Object.entries(obj).forEach(([k, v]) => {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      Object.assign(result, flattenObj(v, key));
    } else {
      result[key] = v;
    }
  });
  return result;
}

// ============ 记录管理 ============
const RECORD_FIELDS = [
  { key: 'containerNo', label: '柜号', type: 'text', placeholder: '如 YMLU5320778' },
  { key: 'brand', label: '品牌', type: 'text', placeholder: '如 烨荣' },
  { key: 'placementTime', label: '放柜时间', type: 'datetime', placeholder: '' },
  { key: 'setTemp', label: '设定温度 (°C)', type: 'number', placeholder: '如 13' },
  { key: 'supplyTemp', label: '送风温度 (°C)', type: 'number', placeholder: '如 13' },
  { key: 'returnTemp', label: '回风温度 (°C)', type: 'number', placeholder: '如 15.2' },
  { key: 'vent', label: '风口设定', type: 'text', placeholder: '如 30%' },
  { key: 'location', label: '当前位置', type: 'text', placeholder: '如 越南LANG SON' },
  { key: 'aroma', label: '味道', type: 'text', placeholder: '如 淡香' },
  { key: 'port', label: '关口', type: 'text', placeholder: '如 友谊关' },
  { key: 'updateTime', label: '更新时间', type: 'datetime', placeholder: '' },
];

const FIELD_TITLE_MAP = {
  containerNo: '柜号',
  brand: '品牌',
  placementTime: '放柜时间',
  setTemp: '设定温度',
  supplyTemp: '送风温度',
  returnTemp: '回风温度',
  vent: '风口设定',
  location: '当前位置',
  aroma: '味道',
  port: '关口',
  updateTime: '更新时间',
};

function getAiImportEls() {
  return {
    text: document.getElementById('aiImportText'),
    out: document.getElementById('aiImportOutput'),
    preview: document.getElementById('aiImportPreview'),
    commit: document.getElementById('aiImportCommitBtn'),
  };
}

function setAiImportOutput(message, isError = false) {
  const { out } = getAiImportEls();
  if (!out) return;
  out.style.display = message ? 'block' : 'none';
  out.className = 'output' + (isError ? ' error' : '');
  out.textContent = message || '';
}

function renderAiImportPreview(data) {
  const { preview, commit } = getAiImportEls();
  if (!preview) return;
  aiImportPreview = data;
  if (!data || !data.sheet) {
    preview.innerHTML = '';
    if (commit) commit.disabled = true;
    return;
  }
  const rows = (data.fields || []).map(f => `
    <tr>
      <td>${escHtml(f.title)}</td>
      <td><input data-ai-field="${escAttr(f.title)}" value="${escAttr(f.value)}"></td>
      <td>${escHtml(f.fieldType || '-')}</td>
      <td>${Math.round((f.confidence || 0) * 100)}%</td>
    </tr>
  `).join('');
  const warnings = data.warnings && data.warnings.length
    ? `<div style="color:var(--warning);margin-top:8px">${data.warnings.map(escHtml).join('<br>')}</div>`
    : '';
  preview.innerHTML = `
    <div class="ai-preview">
      <h3>待确认写入信息</h3>
      <div>目标子表：<b>${escHtml(data.sheet.title)}</b> <span style="color:var(--text-muted)">(${escHtml(data.sheet.sheetId)})</span></div>
      <table>
        <thead><tr><th>字段</th><th>识别值（可修改）</th><th>字段类型</th><th>置信度</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="4">暂无可写入字段</td></tr>'}</tbody>
      </table>
      ${warnings}
    </div>
  `;
  if (commit) commit.disabled = !(data.fields && data.fields.length);
}

async function parseAiImport() {
  const { text, commit } = getAiImportEls();
  if (!text || !text.value.trim()) {
    setAiImportOutput('请先粘贴自然语言文本或截图 OCR 后的文字', true);
    return;
  }
  if (commit) commit.disabled = true;
  renderAiImportPreview(null);
  setAiImportOutput('正在智能解析，暂不写入智能表...');
  try {
    const resp = await apiFetch('/api/ai-import/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: text.value }),
    });
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || '解析失败');
    renderAiImportPreview(json.data);
    setAiImportOutput('解析完成，请核对目标子表和字段值，确认后再写入。');
  } catch (e) {
    setAiImportOutput('解析失败: ' + e.message, true);
  }
}

async function commitAiImport() {
  if (!aiImportPreview || !aiImportPreview.sheet) {
    setAiImportOutput('请先解析并确认信息', true);
    return;
  }
  const values = {};
  document.querySelectorAll('[data-ai-field]').forEach(input => {
    const key = input.getAttribute('data-ai-field');
    const val = input.value.trim();
    if (key && val) values[key] = val;
  });
  if (!Object.keys(values).length) {
    setAiImportOutput('没有可写入字段', true);
    return;
  }
  const ok = confirm(`确认写入「${aiImportPreview.sheet.title}」？\n字段：${Object.keys(values).join('、')}`);
  if (!ok) return;
  const committedSheetId = aiImportPreview.sheet.sheetId;
  setAiImportOutput('正在写入智能表...');
  try {
    const resp = await apiFetch('/api/ai-import/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId: aiImportPreview.sheet.sheetId, values }),
    });
    const json = await resp.json();
    if (!json.success) throw new Error(json.error || '写入失败');
    setAiImportOutput(`写入成功：${json.data.sheet.title}\n字段：${json.data.fields.join('、')}`);
    renderAiImportPreview(null);
    await clearCacheAndReload();
    const currentSheet = document.getElementById('recSheetId');
    if (currentSheet && currentSheet.value === committedSheetId) loadRecords();
  } catch (e) {
    setAiImportOutput('写入失败: ' + e.message, true);
  }
}

async function handleAiImportImage(input) {
  if (input && input.files && input.files[0]) {
    const file = input.files[0];
    const imageData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('图片读取失败'));
      reader.readAsDataURL(file);
    }).catch(e => {
      setAiImportOutput('图片读取失败: ' + e.message, true);
      return '';
    });
    if (imageData) {
      setAiImportOutput('截图已读取；当前服务器尚未配置 OCR/视觉 AI 服务，请先把截图文字复制到文本框后解析。', true);
    }
    input.value = '';
  }
}

async function loadRecords() {
  const sheetId = document.getElementById('recSheetId').value;
  const wrap = document.getElementById('recViewWrap');
  const countSpan = document.getElementById('recCount');

  if (!sheetId) {
    wrap.style.display = 'block';
    wrap.innerHTML = '<div class="output error">❌ 请先选择目标子表</div>';
    return;
  }

  wrap.style.display = 'block';
  wrap.innerHTML = '<div class="output">正在加载记录...</div>';

  try {
    const sheets = await ensureSheetsLoaded();
    const selSheet = sheets.find(s => s.sheet_id === sheetId);
    const isTempSheet = selSheet && /温度|temp/i.test(selSheet.title);

    let records, tableCols, tableLabels;

    if (isTempSheet) {
      const resp = await apiFetch('/api/dashboard?hours=720&limit=500');
      const json = await resp.json();
      if (!json.success) throw new Error(json.error);
      records = json.data.records || [];
      const COL_MAP = [
        ['containerNo','柜号'], ['brand','品牌'], ['placementTime','放柜时间'],
        ['setTempDisplay','设定温度'], ['supplyTempDisplay','送风温度'], ['returnTempDisplay','回风温度'],
        ['vent','风口设定'], ['location','当前位置'], ['aroma','味道'], ['port','关口'], ['updateTime','更新时间'],
      ];
      tableCols = COL_MAP.map(c => c[0]);
      tableLabels = COL_MAP.map(c => c[1]);
    } else {
      const resp = await apiFetch(`/api/smartsheet/records?sheetId=${sheetId}&limit=500`);
      const json = await resp.json();
      if (!json.success) throw new Error(json.error);
      records = json.data.records || [];
      if (records.length > 0) {
        const allKeys = Object.keys(records[0]);
        tableCols = allKeys.filter(k => !k.startsWith('_') && k !== 'recordId');
        tableLabels = tableCols;
      } else {
        tableCols = [];
        tableLabels = [];
      }
    }

    loadedRecords = records;
    countSpan.textContent = `共 ${loadedRecords.length} 条`;
    document.getElementById('btnDelRecords').disabled = loadedRecords.length === 0 || !isTempSheet;

    window._isTempSheet = isTempSheet;

    const idBase = 'rec_' + Date.now().toString(36);
    const jsonStr = JSON.stringify(loadedRecords, null, 2);

    let tableHtml = `<div class="view-bar">
      <button class="btn-toggle active" id="${idBase}_btnTable" onclick="switchView('${idBase}','table')">📋 表格</button>
      <button class="btn-toggle" id="${idBase}_btnJson" onclick="switchView('${idBase}','json')">{ } JSON</button>
      ${!isTempSheet ? `<span style="color:var(--warning);font-size:0.75rem">⚠ 非温度子表，仅可查看/删除</span>` : ''}
    </div>`;

    tableHtml += `<div id="${idBase}_table">`;
    if (loadedRecords.length === 0) {
      tableHtml += '<p class="empty-hint">暂无记录</p>';
    } else {
      const maxH = loadedRecords.length > 15 ? 'max-height:500px;' : '';
      tableHtml += `<div class="data-table-wrap" style="${maxH}"><table class="data-table"><thead><tr>
        <th style="width:32px"><input type="checkbox" id="recCheckAll" onchange="toggleCheckAll(this)"></th>`;
      tableLabels.forEach(l => { tableHtml += `<th>${l}</th>`; });
      tableHtml += '<th>操作</th></tr></thead><tbody>';

      loadedRecords.forEach((r, i) => {
        const recId = r.recordId || r.record_id;
        const isAbnormal = r.isAbnormal ? 'style="border-left:3px solid var(--danger)"' : '';
        tableHtml += `<tr ${isAbnormal}>
          <td><input type="checkbox" class="recCheck" value="${recId}" data-idx="${i}"></td>`;
        tableCols.forEach(c => {
          let v = r[c];
          if (c === 'updateTime' || c === 'placementTime' || c === '更新时间' || c === '放柜时间') {
            v = formatTime(v);
          }
          if (v === null || v === undefined || v === '') v = '-';
          tableHtml += `<td>${escHtml(String(v))}</td>`;
        });
        tableHtml += '<td>';
        if (isTempSheet) {
          tableHtml += `<button class="btn btn-sm" onclick="openEditModal('${recId}')">✏</button> `;
        }
        tableHtml += `<button class="btn btn-sm btn-danger" onclick="deleteOneRecord('${recId}')">🗑</button></td></tr>`;
      });

      tableHtml += '</tbody></table></div>';
    }
    tableHtml += '</div>';
    tableHtml += `<div class="output" id="${idBase}_json" style="display:none">${escHtml(jsonStr)}</div>`;

    wrap.innerHTML = tableHtml;
    wrap._recIdBase = idBase;
    window._recCheckAll = document.getElementById('recCheckAll');
  } catch (e) {
    wrap.innerHTML = `<div class="output error">❌ ${e.message}</div>`;
  }
}

function toggleCheckAll(checkbox) {
  document.querySelectorAll('.recCheck').forEach(c => { c.checked = checkbox.checked; });
}

// ============ 模态框：添加/编辑记录 ============
async function isTempSheetSelected() {
  const sheetId = document.getElementById('recSheetId').value;
  if (!sheetId) return false;
  const sheets = await ensureSheetsLoaded();
  const sel = sheets.find(s => s.sheet_id === sheetId);
  return sel && /温度|temp/i.test(sel.title);
}

async function openAddModal() {
  if (!(await isTempSheetSelected())) {
    alert('仅「温度记录」子表支持添加记录。其他子表请在企微客户端中编辑。');
    return;
  }
  currentEditRecordId = null;
  showModal('➕ 添加温度记录', buildRecordForm({}), submitRecordForm);
}

async function openEditModal(recordId) {
  if (!(await isTempSheetSelected())) {
    alert('仅「温度记录」子表支持编辑。其他子表请在企微客户端中编辑。');
    return;
  }
  const r = loadedRecords.find(x => (x.recordId || x.record_id) === recordId);
  if (!r) { alert('未找到该记录'); return; }
  currentEditRecordId = recordId;
  const formData = {
    containerNo: r.containerNo || '',
    brand: r.brand || '',
    placementTime: r.placementTime || '',
    setTemp: r.setTemp ?? '',
    supplyTemp: r.supplyTemp ?? '',
    returnTemp: r.returnTemp ?? '',
    vent: (r.vent || '').replace('%', ''),
    location: r.location || '',
    aroma: r.aroma || '',
    port: r.port || '',
    updateTime: r.updateTime || '',
  };
  showModal('✏ 编辑温度记录', buildRecordForm(formData), submitRecordForm);
}

function buildRecordForm(data) {
  let html = '<div class="form-grid">';
  RECORD_FIELDS.forEach(f => {
    const val = data[f.key];
    let inputHtml = '';
    if (f.type === 'datetime') {
      let dtVal = '';
      if (val) {
        try {
          const d = new Date(val);
          if (!isNaN(d.getTime())) {
            dtVal = d.toISOString().slice(0, 16);
          }
        } catch(_){}
      }
      if (!dtVal && f.key === 'updateTime') {
        dtVal = new Date().toISOString().slice(0, 16);
      }
      inputHtml = `<input class="form-input" id="mf_${f.key}" type="datetime-local" value="${dtVal}" style="width:100%">`;
    } else if (f.type === 'number') {
      const numVal = (val !== null && val !== undefined) ? val : '';
      inputHtml = `<input class="form-input" id="mf_${f.key}" type="number" step="0.1" value="${numVal}" placeholder="${f.placeholder}" style="width:100%">`;
    } else {
      const txtVal = val || '';
      inputHtml = `<input class="form-input" id="mf_${f.key}" type="text" value="${escAttr(txtVal)}" placeholder="${f.placeholder}" style="width:100%">`;
    }
    html += `<div class="form-group"><label>${f.label}</label>${inputHtml}</div>`;
  });
  html += '</div>';
  return html;
}

async function submitRecordForm() {
  const sheetId = document.getElementById('recSheetId').value;
  if (!sheetId) { alert('请先选择目标子表'); return; }

  const values = {};
  RECORD_FIELDS.forEach(f => {
    const el = document.getElementById('mf_' + f.key);
    if (!el) return;
    const raw = el.value;
    if (raw === '' || raw === null || raw === undefined) return;

    const title = FIELD_TITLE_MAP[f.key];
    if (!title) return;

    if (f.type === 'number') {
      const num = parseFloat(raw);
      if (!isNaN(num)) values[title] = num;
    } else if (f.type === 'datetime') {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) values[title] = String(d.getTime());
    } else {
      if (raw.trim()) values[title] = [{ type: 'text', text: raw.trim() }];
    }
  });

  ssCloseModal();

  const isEdit = !!currentEditRecordId;
  try {
    let resp, json;
    if (isEdit) {
      resp = await apiFetch('/api/smartsheet/records/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, records: [{ record_id: currentEditRecordId, values }] }),
      });
    } else {
      resp = await apiFetch('/api/smartsheet/records/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheetId, records: [{ values }] }),
      });
    }
    json = await resp.json();
    if (json.success) {
      await clearCacheAndReload();
      loadRecords();
    } else {
      alert((isEdit ? '更新' : '添加') + '失败: ' + (json.error || json.errmsg || '未知错误'));
    }
  } catch (e) {
    alert('请求异常: ' + e.message);
  }
}

// ============ 删除记录 ============
async function deleteOneRecord(recordId) {
  const sheetId = document.getElementById('recSheetId').value;
  if (!sheetId) { alert('请选择目标子表'); return; }
  if (!confirm('确定要删除该记录吗？')) return;
  try {
    const resp = await apiFetch('/api/smartsheet/records/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, recordIds: [recordId] }),
    });
    const json = await resp.json();
    if (json.success) {
      await clearCacheAndReload();
      loadRecords();
    } else {
      alert('删除失败: ' + (json.error || ''));
    }
  } catch (e) { alert('请求异常: ' + e.message); }
}

async function deleteSelectedRecords() {
  const sheetId = document.getElementById('recSheetId').value;
  const checks = document.querySelectorAll('.recCheck:checked');
  if (checks.length === 0) { alert('请至少勾选一条记录'); return; }
  if (!confirm(`确定要删除 ${checks.length} 条记录吗？此操作不可撤销！`)) return;

  const recordIds = Array.from(checks).map(c => c.value);
  try {
    const resp = await apiFetch('/api/smartsheet/records/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, recordIds }),
    });
    const json = await resp.json();
    if (json.success) {
      await clearCacheAndReload();
      loadRecords();
    } else {
      alert('删除失败: ' + (json.error || ''));
    }
  } catch (e) { alert('请求异常: ' + e.message); }
}

// ============ 模态框通用函数 ============
function showModal(title, bodyHtml, onSubmit) {
  const container = document.getElementById('modalContainer');
  container.innerHTML = `
    <div class="modal-overlay" id="modalOverlay" onclick="overlayClick(event)">
      <div class="modal-panel">
        <div class="modal-header">
          <h3>${title}</h3>
          <button class="modal-close" onclick="ssCloseModal()">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        <div class="modal-footer">
          <button class="btn" onclick="ssCloseModal()">取消</button>
          <button class="btn btn-primary" id="modalSubmitBtn">提交</button>
        </div>
      </div>
    </div>
  `;
  document.getElementById('modalSubmitBtn').addEventListener('click', onSubmit);
  document.addEventListener('keydown', modalEscHandler);
}

function ssCloseModal() {
  document.getElementById('modalContainer').innerHTML = '';
  document.removeEventListener('keydown', modalEscHandler);
}

function overlayClick(e) {
  if (e.target.id === 'modalOverlay') ssCloseModal();
}

function modalEscHandler(e) {
  if (e.key === 'Escape') { ssCloseModal(); }
}

// ============ 字段管理 ============
async function loadFields() {
  const sheetId = document.getElementById('fldSheetId').value;
  const out = document.getElementById('fieldOutput');
  const list = document.getElementById('fieldList');
  if (!sheetId) { list.innerHTML = ''; return; }

  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在加载字段...\n';
  try {
    const resp = await apiFetch('/api/config/info');
    const json = await resp.json();
    if (!json.success) throw new Error(json.error);
    const sheet = json.data.sheets.find(s => s.sheet_id === sheetId);
    if (!sheet) throw new Error('未找到该子表');

    const fields = sheet.fields || [];
    list.innerHTML = fields.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem">无字段</p>'
      : `<table style="width:100%;font-size:0.82rem;border-collapse:collapse">
        <thead><tr style="color:var(--text-muted);text-align:left">
          <th>字段ID</th><th>标题</th><th>类型</th><th>属性</th><th>操作</th>
        </tr></thead>
        <tbody>${fields.map(f => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px;font-family:monospace;font-size:0.75rem">${f.field_id}</td>
            <td>${f.field_title}</td>
            <td style="font-size:0.75rem">${f.field_type}</td>
            <td style="font-size:0.75rem">${JSON.stringify(f.property_number || f.property_date_time || '-')}</td>
            <td>
              <button class="btn btn-sm" onclick="renameField('${f.field_id}','${f.field_title.replace(/'/g, "\\'")}')">重命名</button>
              <button class="btn btn-sm btn-danger" onclick="deleteField('${f.field_id}','${f.field_title.replace(/'/g, "\\'")}')">删除</button>
            </td>
          </tr>
        `).join('')}</tbody></table>`;
    out.className = 'output success';
    out.textContent = `✅ 已加载 ${fields.length} 个字段`;
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ ' + e.message;
  }
}

async function renameField(fieldId, oldTitle) {
  const sheetId = document.getElementById('fldSheetId').value;
  const newTitle = prompt(`重命名字段「${oldTitle}」为：`, oldTitle);
  if (!newTitle || newTitle === oldTitle) return;
  const out = document.getElementById('fieldOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在更新字段...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/fields/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, fields: [{ field_id: fieldId, field_title: newTitle }] }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ 字段已重命名为「${newTitle}」` : `❌ ${json.error}`;
    if (json.success) { clearCacheAndReload(); loadFields(); }
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function deleteField(fieldId, fieldTitle) {
  const sheetId = document.getElementById('fldSheetId').value;
  if (!confirm(`确定要删除字段「${fieldTitle}」吗？此操作不可撤销！`)) return;
  const out = document.getElementById('fieldOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在删除字段...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/fields/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, fieldIds: [fieldId] }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ ${json.message}` : `❌ ${json.error}`;
    if (json.success) { clearCacheAndReload(); loadFields(); }
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

// ============ 视图管理 ============
async function loadViews() {
  const sheetId = document.getElementById('viewSheetId').value;
  const out = document.getElementById('viewOutput');
  const list = document.getElementById('viewList');
  if (!sheetId) { list.innerHTML = ''; return; }
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在加载视图...\n';
  try {
    const resp = await apiFetch(`/api/smartsheet/views?sheetId=${sheetId}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error);
    const views = json.data || [];
    list.innerHTML = views.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem">无视图</p>'
      : `<table style="width:100%;font-size:0.82rem;border-collapse:collapse">
        <thead><tr style="color:var(--text-muted);text-align:left">
          <th>视图ID</th><th>标题</th><th>类型</th><th>操作</th>
        </tr></thead>
        <tbody>${views.map(v => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px;font-family:monospace;font-size:0.75rem">${v.view_id}</td>
            <td>${v.view_title || '-'}</td>
            <td style="font-size:0.75rem">${v.view_type || '-'}</td>
            <td>
              <button class="btn btn-sm btn-danger" onclick="deleteViewById('${v.view_id}')">删除</button>
            </td>
          </tr>
        `).join('')}</tbody></table>`;
    out.className = 'output success';
    out.textContent = `✅ 已加载 ${views.length} 个视图`;
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ ' + e.message;
  }
}

async function addView() {
  const sheetId = document.getElementById('viewSheetId').value;
  const viewTitle = document.getElementById('viewTitle').value.trim();
  const viewType = document.getElementById('viewType').value;
  const out = document.getElementById('viewOutput');
  out.style.display = 'block';
  if (!sheetId || !viewTitle) {
    out.className = 'output error';
    out.textContent = '❌ 请选择子表并输入视图标题';
    return;
  }
  out.className = 'output';
  out.textContent = '正在添加视图...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/views/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, viewTitle, viewType }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ 视图已添加: ${JSON.stringify(json.data, null, 2)}` : `❌ ${json.error}`;
    if (json.success) { document.getElementById('viewTitle').value = ''; loadViews(); }
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function deleteViewById(viewId) {
  const sheetId = document.getElementById('viewSheetId').value;
  if (!confirm(`确定要删除视图 ${viewId} 吗？`)) return;
  const out = document.getElementById('viewOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在删除视图...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/views/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, viewIds: [viewId] }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ ${json.message}` : `❌ ${json.error}`;
    if (json.success) loadViews();
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

// ============ 编组管理 ============
async function loadGroups() {
  const sheetId = document.getElementById('grpSheetId').value;
  const out = document.getElementById('groupOutput');
  const list = document.getElementById('groupList');
  if (!sheetId) { list.innerHTML = ''; return; }
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在加载编组...\n';
  try {
    const resp = await apiFetch(`/api/smartsheet/groups?sheetId=${sheetId}`);
    const json = await resp.json();
    if (!json.success) throw new Error(json.error);
    const groups = json.data || [];
    list.innerHTML = groups.length === 0
      ? '<p style="color:var(--text-muted);font-size:0.85rem">无编组</p>'
      : `<table style="width:100%;font-size:0.82rem;border-collapse:collapse">
        <thead><tr style="color:var(--text-muted);text-align:left">
          <th>编组ID</th><th>名称</th><th>包含字段数</th><th>操作</th>
        </tr></thead>
        <tbody>${groups.map(g => `
          <tr style="border-top:1px solid var(--border)">
            <td style="padding:4px;font-family:monospace;font-size:0.75rem">${g.field_group_id}</td>
            <td>${g.name || '-'}</td>
            <td>${(g.children || []).length}</td>
            <td>
              <button class="btn btn-sm" onclick="renameGroup('${g.field_group_id}','${(g.name || '').replace(/'/g, "\\'")}')">重命名</button>
              <button class="btn btn-sm btn-danger" onclick="deleteGroupById('${g.field_group_id}')">删除</button>
            </td>
          </tr>
        `).join('')}</tbody></table>`;
    out.className = 'output success';
    out.textContent = `✅ 已加载 ${groups.length} 个编组`;
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ ' + e.message;
  }
}

async function addGroup() {
  const sheetId = document.getElementById('grpSheetId').value;
  const name = document.getElementById('grpName').value.trim();
  const out = document.getElementById('groupOutput');
  out.style.display = 'block';
  if (!sheetId || !name) {
    out.className = 'output error';
    out.textContent = '❌ 请选择子表并输入编组名称';
    return;
  }
  out.className = 'output';
  out.textContent = '正在添加编组...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/groups/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, name }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ 编组已添加: ${JSON.stringify(json.data, null, 2)}` : `❌ ${json.error}`;
    if (json.success) { document.getElementById('grpName').value = ''; loadGroups(); }
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function renameGroup(groupId, oldName) {
  const sheetId = document.getElementById('grpSheetId').value;
  const newName = prompt(`重命名编组「${oldName}」为：`, oldName);
  if (!newName || newName === oldName) return;
  const out = document.getElementById('groupOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在更新编组...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/groups/update', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, fieldGroupId: groupId, name: newName }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ 编组已重命名` : `❌ ${json.error}`;
    if (json.success) loadGroups();
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function deleteGroupById(groupId) {
  const sheetId = document.getElementById('grpSheetId').value;
  if (!confirm(`确定要删除编组 ${groupId} 吗？`)) return;
  const out = document.getElementById('groupOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在删除编组...\n';
  try {
    const resp = await apiFetch('/api/smartsheet/groups/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sheetId, fieldGroupId: groupId }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ ${json.message}` : `❌ ${json.error}`;
    if (json.success) loadGroups();
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

// ============ 文档操作 ============
async function renameDocument() {
  const newName = document.getElementById('newDocName').value.trim();
  const out = document.getElementById('docOutput');
  out.style.display = 'block';
  if (!newName) {
    out.className = 'output error';
    out.textContent = '❌ 请输入新文档名称';
    return;
  }
  out.className = 'output';
  out.textContent = '正在重命名文档...\n';
  try {
    const resp = await apiFetch('/api/doc/rename', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newName }),
    });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ 文档已重命名为「${newName}」` : `❌ ${json.error}`;
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function getDocumentInfo() {
  const out = document.getElementById('docOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在获取文档信息...\n';
  try {
    const resp = await apiFetch('/api/doc/info');
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? JSON.stringify(json.data, null, 2) : `❌ ${json.error}`;
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

async function deleteDocument() {
  if (!confirm('⚠️ 确定要删除当前文档吗？\n\n这将永久删除该智能表格文档及其所有数据！\n建议先备份重要数据。')) return;
  if (!confirm('再次确认：真的要删除吗？')) return;
  const out = document.getElementById('docOutput');
  out.style.display = 'block';
  out.className = 'output';
  out.textContent = '正在删除文档...\n';
  try {
    const resp = await apiFetch('/api/doc/delete', { method: 'POST' });
    const json = await resp.json();
    out.className = json.success ? 'output success' : 'output error';
    out.textContent = json.success ? `✅ ${json.message}` : `❌ ${json.error}`;
    if (json.success) refreshStatus();
  } catch (e) {
    out.className = 'output error';
    out.textContent = '❌ 请求异常: ' + e.message;
  }
}

// ============ 工具函数 ============
function escHtml(str) {
  if (!str && str !== 0) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

function escAttr(str) {
  return String(str).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/'/g, '&#39;');
}

function formatTime(t) {
  if (!t) return '-';
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    return d.toLocaleString('zh-CN', {
      month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    });
  } catch (_) { return String(t); }
}

async function clearCacheAndReload() {
  try {
    await apiFetch('/api/schema/refresh', { method: 'POST' });
    cachedSheets = [];
    await ensureSheetsLoaded();
    await populateSheetSelects();
  } catch (e) { /* ignore */ }
}
