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

// === 状态 ===
let chart = null;
let refreshTimer = null;
let allRecords = [];
let allContainers = [];

// === DOM 引用 ===
const $ = (sel) => document.querySelector(sel);

const dom = {
  lastUpdate: $('#lastUpdate'),
  btnRefresh: $('#btnRefresh'),
  btnSettings: $('#btnSettings'),
  statContainers: $('#statContainers'),
  statTotal: $('#statTotal'),
  statAvgTemp: $('#statAvgTemp'),
  statAbnormal: $('#statAbnormal'),
  statAlertsCard: $('#statAlertsCard'),
  alertBanner: $('#alertBanner'),
  alertCount: $('#alertCount'),
  alertList: $('#alertList'),
  containerFilter: $('#containerFilter'),
  hoursFilter: $('#hoursFilter'),
  tempChart: $('#tempChart'),
  chartEmpty: $('#chartEmpty'),
  recordsBody: $('#recordsBody'),
  tableRecordCount: $('#tableRecordCount'),
  refreshIntervalDisplay: $('#refreshIntervalDisplay'),
  settingsOverlay: $('#settingsOverlay'),
  settingTempMin: $('#settingTempMin'),
  settingTempMax: $('#settingTempMax'),
  settingRefresh: $('#settingRefresh'),
  btnSaveSettings: $('#btnSaveSettings'),
  btnSettingsClose: $('#btnSettingsClose'),
};

// === 核心：数据加载 ===

async function fetchDashboard() {
  const container = dom.containerFilter.value;
  const hours = dom.hoursFilter.value;

  let url = `/api/dashboard?hours=${hours}&limit=500`;
  if (container) url += `&container=${encodeURIComponent(container)}`;

  try {
    const resp = await fetch(url);
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
    updateContainerFilter();
    updateChart(data.records);
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
  const currentVal = dom.containerFilter.value;
  const containers = allContainers.map(c => c.containerNo);

  dom.containerFilter.innerHTML = '<option value="">全部柜号</option>' +
    containers.map(c => `<option value="${escHtml(c)}">${escHtml(c)}</option>`).join('');

  if (containers.includes(currentVal)) {
    dom.containerFilter.value = currentVal;
  }
}

// === 图表 (Chart.js) ===

function updateChart(records) {
  if (!records || records.length === 0) {
    dom.tempChart.style.display = 'none';
    dom.chartEmpty.style.display = 'flex';
    return;
  }

  dom.tempChart.style.display = 'block';
  dom.chartEmpty.style.display = 'none';

  // 按柜号 + 温度类型分组
  const grouped = {};
  records.forEach(r => {
    if (r.returnTemp === null || r.returnTemp === undefined) return;
    const key = r.containerNo || '未知';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(r);
  });

  // 每组按时间排序（升序）
  Object.values(grouped).forEach(group => {
    group.sort((a, b) => {
      const ta = a.updateTime ? new Date(a.updateTime).getTime() : 0;
      const tb = b.updateTime ? new Date(b.updateTime).getTime() : 0;
      return ta - tb;
    });
  });

  // 构建数据集（每个柜号一条回风温度线 + 一条设定温度虚线）
  const colors = [
    '#4caf50', '#2196f3', '#ff9800', '#e91e63', '#9c27b0',
    '#00bcd4', '#ff5722', '#8bc34a', '#3f51b5', '#ffc107',
  ];

  const datasets = [];
  let colorIdx = 0;
  const containerKeys = Object.keys(grouped);

  // 如果太多柜号，只显示有数据的最多6条线
  const displayKeys = containerKeys.length > 6
    ? containerKeys.slice(0, 6)
    : containerKeys;

  displayKeys.forEach(key => {
    const group = grouped[key];
    const color = colors[colorIdx % colors.length];
    colorIdx++;

    // 回风温度（实线）
    datasets.push({
      label: `${key} 回风`,
      data: group.map(r => ({
        x: r.updateTime ? new Date(r.updateTime) : null,
        y: r.returnTemp,
        containerNo: r.containerNo,
        type: '回风',
      })),
      borderColor: color,
      backgroundColor: color + '30',
      borderWidth: 2,
      pointRadius: 2,
      pointHoverRadius: 5,
      tension: 0.3,
      fill: false,
    });

    // 设定温度（虚线）—— 只有有设定温度的数据才画
    const setTempPoints = group.filter(r => r.setTemp !== null && r.setTemp !== undefined);
    if (setTempPoints.length > 0) {
      datasets.push({
        label: `${key} 设定`,
        data: setTempPoints.map(r => ({
          x: r.updateTime ? new Date(r.updateTime) : null,
          y: r.setTemp,
          containerNo: r.containerNo,
          type: '设定',
        })),
        borderColor: color,
        backgroundColor: 'transparent',
        borderWidth: 1.5,
        borderDash: [5, 3],
        pointRadius: 1,
        pointHoverRadius: 4,
        tension: 0.3,
        fill: false,
      });
    }
  });

  // 温度阈值线
  const thresholdDatasets = [
    {
      label: `上限 ${config.tempMax}°C`,
      data: [],
      borderColor: '#f44336',
      borderWidth: 1,
      borderDash: [6, 3],
      pointRadius: 0,
      fill: false,
    },
    {
      label: `下限 ${config.tempMin}°C`,
      data: [],
      borderColor: '#ff9800',
      borderWidth: 1,
      borderDash: [6, 3],
      pointRadius: 0,
      fill: false,
    },
  ];

  // 为阈值线生成虚拟数据点（基于时间范围）
  const allTimes = records
    .filter(r => r.updateTime)
    .map(r => new Date(r.updateTime).getTime());

  if (allTimes.length > 0) {
    const minTime = Math.min(...allTimes);
    const maxTime = Math.max(...allTimes);
    const padding = (maxTime - minTime) * 0.1 || 60000;

    const startTime = new Date(minTime - padding);
    const endTime = new Date(maxTime + padding);

    thresholdDatasets[0].data = [
      { x: startTime, y: config.tempMax },
      { x: endTime, y: config.tempMax },
    ];
    thresholdDatasets[1].data = [
      { x: startTime, y: config.tempMin },
      { x: endTime, y: config.tempMin },
    ];
  }

  const allDatasets = [...datasets, ...thresholdDatasets];

  // 销毁旧图表
  if (chart) {
    chart.destroy();
    chart = null;
  }

  const ctx = dom.tempChart.getContext('2d');

  chart = new Chart(ctx, {
    type: 'line',
    data: { datasets: allDatasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: 'index',
        intersect: false,
      },
      plugins: {
        legend: {
          labels: {
            color: '#8ba4bc',
            usePointStyle: true,
            pointStyleWidth: 10,
            padding: 20,
            font: { size: 11 },
            filter: (item) => {
              return item.dataset.data.length > 0;
            },
          },
        },
        tooltip: {
          callbacks: {
            title: (items) => {
              const item = items[0];
              if (item.raw.x) {
                return formatTime(item.raw.x);
              }
              return '';
            },
            label: (ctx) => {
              const d = ctx.raw;
              const typeStr = d.type ? `[${d.type}]` : '';
              if (d.containerNo) {
                return `${d.containerNo} ${typeStr}: ${d.y}°C`;
              }
              return `${ctx.dataset.label}: ${d.y}°C`;
            },
          },
        },
      },
      scales: {
        x: {
          type: 'time',
          time: {
            tooltipFormat: 'MM-dd HH:mm',
            displayFormats: {
              minute: 'HH:mm',
              hour: 'MM-dd HH:mm',
              day: 'MM-dd',
            },
          },
          ticks: {
            color: '#5a7a94',
            maxTicksLimit: 12,
          },
          grid: {
            color: '#2a405540',
          },
        },
        y: {
          title: {
            display: true,
            text: '温度 (°C)',
            color: '#8ba4bc',
          },
          ticks: {
            color: '#5a7a94',
            callback: (v) => v + '°C',
          },
          grid: {
            color: '#2a405540',
          },
        },
      },
    },
  });
}

// === 数据明细表格 ===

function updateTable(records) {
  dom.tableRecordCount.textContent = `${records.length} 条记录`;

  if (records.length === 0) {
    dom.recordsBody.innerHTML = `<tr class="empty-row"><td colspan="7">暂无数据</td></tr>`;
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

    return `
      <tr>
        <td>${escHtml(r.containerNo)}</td>
        <td>${r.setTempDisplay}</td>
        <td class="${returnTempClass}">${r.returnTempDisplay}${diffHtml}</td>
        <td>${escHtml(r.vent)}</td>
        <td>${escHtml(r.location)}</td>
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
  dom.recordsBody.innerHTML = `<tr class="empty-row"><td colspan="7" style="color:var(--danger)">⚠ ${escHtml(msg)}</td></tr>`;
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
dom.containerFilter.addEventListener('change', () => fetchDashboard());
dom.hoursFilter.addEventListener('change', () => fetchDashboard());
dom.btnSettings.addEventListener('click', openSettings);
dom.btnSettingsClose.addEventListener('click', closeSettings);
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

// === 启动 ===

async function init() {
  console.log('[app] 榴莲温度看板启动');
  await fetchDashboard();
  startRefreshTimer();
}

init();
