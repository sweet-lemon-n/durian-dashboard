/**
 * 榴莲运输温度监控看板 — 前端逻辑
 */

// === 配置（从 localStorage 读取用户偏好，或使用默认值） ===

const DEFAULTS = {
  tempMin: parseFloat(getEnvMeta('TEMP_MIN')) || 2,
  tempMax: parseFloat(getEnvMeta('TEMP_MAX')) || 8,
  refreshInterval: parseInt(getEnvMeta('REFRESH_INTERVAL')) || 30,
};

let config = {
  tempMin: loadSetting('tempMin', DEFAULTS.tempMin),
  tempMax: loadSetting('tempMax', DEFAULTS.tempMax),
  refreshInterval: loadSetting('refreshInterval', DEFAULTS.refreshInterval),
};

// 从 <meta> 读取后端传递的默认值
function getEnvMeta(key) {
  // 后端可通过在响应中返回 env 来传递，这里先用 localStorage fallback
  return null;
}

function loadSetting(key, fallback) {
  try {
    const val = localStorage.getItem(`dashboard_${key}`);
    if (val !== null) return JSON.parse(val);
  } catch (_) { /* ignore */ }
  return fallback;
}

function saveSetting(key, value) {
  localStorage.setItem(`dashboard_${key}`, JSON.stringify(value));
}

// === 认证工具 ===

/**
 * 带认证的 fetch 包装
 * 401 → 跳转登录页
 * 403 → 提示权限不足
 */
async function apiFetch(url, options = {}) {
  const resp = await fetch(url, options);

  if (resp.status === 401) {
    window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
    throw new Error('Unauthorized');
  }

  if (resp.status === 403) {
    alert('权限不足');
    throw new Error('Forbidden');
  }

  return resp;
}

// === 状态 ===
let refreshTimer = null;
let allRecords = [];
let allContainers = [];

// === DOM 引用 ===
const $ = (sel) => document.querySelector(sel);

const dom = {
  lastUpdate: $('#lastUpdate'),
  btnRefresh: $('#btnRefresh'),
  btnSettings: $('#btnSettings'),
  btnLogout: $('#btnLogout'),
  userInfo: $('#userInfo'),
  statContainers: $('#statContainers'),
  statTotal: $('#statTotal'),
  statAvgTemp: $('#statAvgTemp'),
  statAbnormal: $('#statAbnormal'),
  statAlertsCard: $('#statAlertsCard'),
  statDetained: $('#statDetained'),
  statDetentionCard: $('#statDetentionCard'),
  alertBanner: $('#alertBanner'),
  alertCount: $('#alertCount'),
  alertList: $('#alertList'),
  detentionBanner: $('#detentionBanner'),
  detentionCount: $('#detentionCount'),
  detentionList: $('#detentionList'),
  containerFilter: $('#containerFilter'),
  recordsBody: $('#recordsBody'),
  tableRecordCount: $('#tableRecordCount'),
  refreshIntervalDisplay: $('#refreshIntervalDisplay'),
  ganttContainer: $('#ganttContainer'),
  tempTypeFilter: $('#tempTypeFilter'),
  settingsOverlay: $('#settingsOverlay'),
  settingTempMin: $('#settingTempMin'),
  settingTempMax: $('#settingTempMax'),
  settingRefresh: $('#settingRefresh'),
  btnSaveSettings: $('#btnSaveSettings'),
  btnSettingsClose: $('#btnSettingsClose'),
};

// === 核心：数据加载 ===

async function fetchDashboard() {
  const container = dom.containerFilter ? dom.containerFilter.value : '';

  // 甘特图固定拉取 7 天数据
  let url = `/api/dashboard?hours=168&limit=500`;
  if (container) url += `&container=${encodeURIComponent(container)}`;

  try {
    const resp = await apiFetch(url);
    const json = await resp.json();

    if (!json.success) {
      console.error('[dashboard] 接口错误:', json.error);
      showError(json.error || '获取数据失败');
      return;
    }

    const data = json.data;
    allRecords = data.records || [];
    allContainers = data.containers || [];

    updateStats(data.stats);
    updateAlerts(data.alerts);
    updateDetention(data.detention);
    updateContainerFilter();
    updateGantt(data.records);
    updateTable(data.records);
    updateLastUpdate();

    console.log(`[dashboard] 已刷新: ${allRecords.length} 条记录, 统计:`, data.stats);
  } catch (err) {
    console.error('[dashboard] 请求异常:', err);
  }
}

// === 更新统计卡片 ===

function updateStats(stats) {
  if (!stats) return;

  dom.statContainers.textContent = stats.containerCount ?? '--';
  dom.statTotal.textContent = stats.total ?? '--';
  dom.statAvgTemp.textContent = stats.avgReturnTemp !== null && stats.avgReturnTemp !== undefined
    ? stats.avgReturnTemp.toFixed(1) : '--';

  const abnormalCount = stats.abnormalCount ?? 0;
  dom.statAbnormal.textContent = abnormalCount;

  // 异常时闪烁红色
  if (abnormalCount > 0) {
    dom.statAlertsCard.classList.add('active');
  } else {
    dom.statAlertsCard.classList.remove('active');
  }
}

// === 更新滞留数据 ===

function updateDetention(detention) {
  if (!detention) {
    if (dom.detentionBanner) dom.detentionBanner.style.display = 'none';
    if (dom.statDetained) dom.statDetained.textContent = '--';
    if (dom.statDetentionCard) dom.statDetentionCard.classList.remove('active');
    return;
  }

  const { containers, detainedCount, avgDays } = detention;

  // 滞留统计卡片
  if (dom.statDetained) dom.statDetained.textContent = detainedCount;

  // 滞留卡片高亮
  if (dom.statDetentionCard) {
    if (detainedCount > 0) {
      dom.statDetentionCard.classList.add('active');
    } else {
      dom.statDetentionCard.classList.remove('active');
    }
  }

  // 滞留横幅
  if (!containers || containers.length === 0) {
    if (dom.detentionBanner) dom.detentionBanner.style.display = 'none';
    return;
  }

  if (dom.detentionBanner) dom.detentionBanner.style.display = 'block';
  if (dom.detentionCount) dom.detentionCount.textContent = containers.length;

  if (dom.detentionList) {
    dom.detentionList.innerHTML = containers.slice(0, 10).map(c => {
      const daysClass = c.days > 5 ? 'detention-severe' : (c.days > 2 ? 'detention-warn' : '');
      const transportLabel = c.transportType === '海运' ? '🚢' : '🚛';
      return `
        <div class="alert-item">
          <span class="alert-container">${transportLabel} ${escHtml(c.containerNo)}</span>
          <span class="detention-port">📍 ${escHtml(c.port || '未知关口')}</span>
          <span class="detention-days ${daysClass}">⏳ ${c.days} 天</span>
          ${c.inspection && c.inspection !== '直放' ? `<span class="detention-inspect">🔍 ${escHtml(c.inspection)}</span>` : ''}
        </div>
      `;
    }).join('');
  }
}

// === 更新告警横幅 ===

function updateAlerts(alerts) {
  if (!alerts || alerts.length === 0) {
    dom.alertBanner.style.display = 'none';
    return;
  }

  dom.alertBanner.style.display = 'block';
  dom.alertCount.textContent = alerts.length;

  dom.alertList.innerHTML = alerts.slice(0, 10).map(a => `
    <div class="alert-item">
      <span class="alert-container">${escHtml(a.containerNo)}</span>
      ${a.setTemp !== null && a.setTemp !== undefined ? `<span class="alert-temp">设定${a.setTemp}°C</span>` : ''}
      ${a.returnTemp !== null && a.returnTemp !== undefined ? `<span class="alert-temp">回风${a.returnTemp}°C</span>` : ''}
      <span class="alert-reason">${escHtml(a.reason)}</span>
      ${a.time ? `<span style="color:var(--text-muted);margin-left:auto">${formatTime(a.time)}</span>` : ''}
    </div>
  `).join('');
}

// === 更新柜号筛选下拉 ===

function updateContainerFilter() {
  if (!dom.containerFilter) return;
  const currentVal = dom.containerFilter.value;
  const containers = allContainers.map(c => c.containerNo);

  dom.containerFilter.innerHTML = '<option value="">全部柜号</option>' +
    containers.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  if (containers.includes(currentVal)) {
    dom.containerFilter.value = currentVal;
  }
}

// === 图表 (Chart.js) ===

// === 甘特图 ===

function updateGantt(records) {
  if (!records || records.length === 0) {
    dom.ganttContainer.innerHTML = '<p class="gantt-empty">暂无温度数据</p>';
    return;
  }

  const tempType = dom.tempTypeFilter.value; // 'returnTemp' | 'setTemp' | 'supplyTemp'
  const now = new Date();

  // 生成最近 7 天的日期列表（从 6 天前到今天）
  const days = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    days.push({
      date: d,
      label: `${d.getMonth() + 1}/${d.getDate()}`,
      key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
      dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
    });
  }

  // 按柜号分组，每天取最后一条记录
  const ganttData = {}; // { containerNo: { dateKey: tempValue } }
  const containerSet = new Set();

  records.forEach(r => {
    const cNo = r.containerNo || '未知';
    containerSet.add(cNo);
    if (!ganttData[cNo]) ganttData[cNo] = {};

    const t = r.updateTime ? new Date(r.updateTime) : null;
    if (!t || isNaN(t.getTime())) return;
    const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;

    const val = r[tempType];
    if (val === null || val === undefined || isNaN(val)) return;

    // 同一天多条记录：取时间更晚的
    if (!ganttData[cNo][dateKey] || t.getTime() > ganttData[cNo][dateKey]._ts) {
      ganttData[cNo][dateKey] = { value: Math.round(val * 10) / 10, _ts: t.getTime() };
    }
  });

  // 按柜号排序
  const sortedContainers = Array.from(containerSet).sort();

  if (sortedContainers.length === 0) {
    dom.ganttContainer.innerHTML = '<p class="gantt-empty">暂无温度数据</p>';
    return;
  }

  // 温度→颜色映射
  function tempColor(val) {
    // 蓝(冷) → 绿(正常) → 黄 → 橙 → 红(热)
    const stops = [
      { t: 6, r: 21, g: 101, b: 192 },   // 蓝
      { t: 10, r: 66, g: 165, b: 245 },   // 浅蓝
      { t: 12, r: 102, g: 187, b: 106 },  // 绿
      { t: 14, r: 255, g: 235, b: 59 },   // 黄
      { t: 16, r: 255, g: 152, b: 0 },    // 橙
      { t: 20, r: 244, g: 67, b: 54 },    // 红
    ];

    if (val <= stops[0].t) return `rgb(${stops[0].r},${stops[0].g},${stops[0].b})`;
    if (val >= stops[stops.length - 1].t) return `rgb(${stops[stops.length - 1].r},${stops[stops.length - 1].g},${stops[stops.length - 1].b})`;

    // 线性插值
    for (let i = 0; i < stops.length - 1; i++) {
      if (val >= stops[i].t && val <= stops[i + 1].t) {
        const ratio = (val - stops[i].t) / (stops[i + 1].t - stops[i].t);
        const r = Math.round(stops[i].r + (stops[i + 1].r - stops[i].r) * ratio);
        const g = Math.round(stops[i].g + (stops[i + 1].g - stops[i].g) * ratio);
        const b = Math.round(stops[i].b + (stops[i + 1].b - stops[i].b) * ratio);
        return `rgb(${r},${g},${b})`;
      }
    }
    return '#888';
  }

  // 判断文字颜色（深色背景用白色，浅色背景用黑色）
  function textColor(rgb) {
    const m = rgb.match(/(\d+)/g);
    if (!m) return '#fff';
    const brightness = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
    return brightness > 150 ? '#111' : '#fff';
  }

  // 构建表格
  let html = '<table><thead><tr><th class="gantt-row-label">柜号</th>';
  days.forEach(d => {
    html += `<th>${d.label}<br><small>周${d.dayOfWeek}</small></th>`;
  });
  html += '</tr></thead><tbody>';

  sortedContainers.forEach(cNo => {
    html += `<tr><td class="gantt-row-label">${escHtml(cNo)}</td>`;
    days.forEach(d => {
      const cell = ganttData[cNo]?.[d.key];
      if (cell && cell.value !== undefined) {
        const bg = tempColor(cell.value);
        const fg = textColor(bg);
        html += `<td style="background:${bg};color:${fg}">${cell.value}°</td>`;
      } else {
        html += `<td class="gantt-empty-cell">-</td>`;
      }
    });
    html += '</tr>';
  });

  html += '</tbody></table>';
  dom.ganttContainer.innerHTML = html;
}

// === 数据明细表格 ===

function updateTable(records) {
  dom.tableRecordCount.textContent = `${records.length} 条记录`;

  if (records.length === 0) {
    dom.recordsBody.innerHTML = `<tr class="empty-row"><td colspan="14">暂无数据</td></tr>`;
    return;
  }

  dom.recordsBody.innerHTML = records.slice(0, 200).map(r => {
    const returnTempClass = r.isAbnormal ? 'temp-abnormal' : 'temp-normal';
    const statusClass = r.isAbnormal ? 'status-abnormal' : 'status-normal';
    const statusText = r.isAbnormal ? '⚠ 异常' : '正常';
    // 温差显示
    let diffHtml = '';
    if (r.tempDiff !== null) {
      const diffClass = r.tempDiff > 0 ? 'temp-diff-pos' : (r.tempDiff < 0 ? 'temp-diff-neg' : 'temp-diff-zero');
      const diffSign = r.tempDiff > 0 ? '+' : '';
      diffHtml = ` <span class="${diffClass}">(${diffSign}${r.tempDiff}°C)</span>`;
    }

    // 滞留显示
    let detentionHtml = '<td>-</td><td>-</td>';
    if (r.detentionPort) {
      const daysClass = r.detentionDays > 5 ? 'detention-severe' : (r.detentionDays > 2 ? 'detention-warn' : '');
      detentionHtml = `<td>${escHtml(r.detentionPort)}</td><td class="${daysClass}">${r.detentionDays !== null ? r.detentionDays + ' 天' : '-'}</td>`;
    }

    return `
      <tr>
        <td>${escHtml(r.containerNo)}</td>
        <td>${escHtml(r.brand)}</td>
        <td>${formatTime(r.placementTime)}</td>
        <td>${r.setTempDisplay}</td>
        <td>${r.supplyTempDisplay || '-'}</td>
        <td class="${returnTempClass}">${r.returnTempDisplay}${diffHtml}</td>
        <td>${escHtml(r.vent)}</td>
        <td>${escHtml(r.location)}</td>
        <td>${escHtml(r.aroma)}</td>
        <td>${escHtml(r.port)}</td>
        ${detentionHtml}
        <td>${formatTime(r.updateTime)}</td>
        <td><span class="status-badge ${statusClass}">${statusText}</span></td>
      </tr>
    `;
  }).join('');
}

// === 更新时间显示 ===

function updateLastUpdate() {
  const now = new Date();
  dom.lastUpdate.textContent = `最后更新: ${now.toLocaleTimeString('zh-CN', { hour12: false })}`;
}

// === 错误提示 ===

function showError(msg) {
  dom.recordsBody.innerHTML = `<tr class="empty-row"><td colspan="14" style="color:var(--danger)">⚠ ${escHtml(msg)}</td></tr>`;
}

// === 设置面板 ===

function openSettings() {
  dom.settingTempMin.value = config.tempMin;
  dom.settingTempMax.value = config.tempMax;
  dom.settingRefresh.value = config.refreshInterval;
  dom.settingsOverlay.style.display = 'flex';
}

function closeSettings() {
  dom.settingsOverlay.style.display = 'none';
}

function saveSettings() {
  const newTempMin = parseFloat(dom.settingTempMin.value);
  const newTempMax = parseFloat(dom.settingTempMax.value);
  const newRefresh = parseInt(dom.settingRefresh.value);

  if (isNaN(newTempMin) || isNaN(newTempMax)) {
    alert('请输入有效的温度阈值');
    return;
  }
  if (newTempMin >= newTempMax) {
    alert('温度下限必须小于上限');
    return;
  }
  if (isNaN(newRefresh) || newRefresh < 5) {
    alert('刷新间隔至少 5 秒');
    return;
  }

  config.tempMin = newTempMin;
  config.tempMax = newTempMax;
  config.refreshInterval = newRefresh;

  saveSetting('tempMin', newTempMin);
  saveSetting('tempMax', newTempMax);
  saveSetting('refreshInterval', newRefresh);

  closeSettings();
  resetRefreshTimer();
  fetchDashboard(); // 立即刷新
}

// === 自动刷新 ===

function startRefreshTimer() {
  dom.refreshIntervalDisplay.textContent = config.refreshInterval;
  refreshTimer = setInterval(fetchDashboard, config.refreshInterval * 1000);
}

function resetRefreshTimer() {
  if (refreshTimer) clearInterval(refreshTimer);
  startRefreshTimer();
}

// === 事件绑定 ===

dom.btnRefresh.addEventListener('click', () => fetchDashboard());
if (dom.containerFilter) dom.containerFilter.addEventListener('change', () => fetchDashboard());
dom.tempTypeFilter.addEventListener('change', () => updateGantt(allRecords));
dom.btnSettings.addEventListener('click', openSettings);
dom.btnSettingsClose.addEventListener('click', closeSettings);
if (dom.btnLogout) dom.btnLogout.addEventListener('click', logout);
dom.settingsOverlay.addEventListener('click', (e) => {
  if (e.target === dom.settingsOverlay) closeSettings();
});
dom.btnSaveSettings.addEventListener('click', saveSettings);

// 键盘快捷键
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeSettings();
  if (e.key === 'r' && e.ctrlKey) {
    e.preventDefault();
    fetchDashboard();
  }
});

// === 工具函数 ===

function formatTime(t) {
  if (!t) return '-';
  try {
    const d = new Date(t);
    if (isNaN(d.getTime())) return String(t);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
  } catch (_) {
    return String(t);
  }
}

function escHtml(str) {
  if (!str) return '';
  const div = document.createElement('div');
  div.textContent = String(str);
  return div.innerHTML;
}

// === 用户信息 ===

async function loadUserInfo() {
  try {
    const resp = await apiFetch('/api/auth/me');
    const json = await resp.json();
    if (json.success && json.data) {
      if (dom.userInfo) {
        dom.userInfo.innerHTML = '👤 ' + escHtml(json.data.displayName || json.data.username);
      }
    }
  } catch (_) {
    // apiFetch 已处理 401 跳转
  }
}

// === 退出登录 ===

async function logout() {
  try {
    await apiFetch('/api/auth/logout', { method: 'POST' });
  } catch (_) {
    // 忽略错误，无论如何都跳转
  }
  window.location.href = '/login';
}

// === 启动 ===

async function init() {
  console.log('[app] 榴莲温度看板启动');
  await loadUserInfo();
  await fetchDashboard();
  startRefreshTimer();
}

init();
