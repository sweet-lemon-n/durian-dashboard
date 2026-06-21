/**
 * 温度甘特图 — 独立模块（看板底部）
 * 从企微真实温度数据 /api/dashboard 读取，按「柜号 × 最近7天」渲染热力网格。
 * 与上方看板（/api/aggregate）互不干扰，各自独立取数与轮询。
 */
(function () {
  const $ = (id) => document.getElementById(id);
  const escHtml = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  async function ganttFetch(url) {
    const resp = await fetch(url, { cache: 'no-store' });
    if (resp.status === 401) {
      window.location.href = '/login?redirect=' + encodeURIComponent(window.location.pathname);
      throw new Error('Unauthorized');
    }
    if (resp.status === 403) {
      const section = document.querySelector('.gantt-section');
      if (section) section.hidden = true;
      throw new Error('Forbidden');
    }
    return resp;
  }

  // 温度 → 颜色（蓝冷 → 绿 → 黄 → 橙 → 红热）
  function tempColor(val) {
    const stops = [
      { t: 6, r: 21, g: 101, b: 192 },
      { t: 10, r: 66, g: 165, b: 245 },
      { t: 12, r: 102, g: 187, b: 106 },
      { t: 14, r: 255, g: 235, b: 59 },
      { t: 16, r: 255, g: 152, b: 0 },
      { t: 20, r: 244, g: 67, b: 54 },
    ];
    if (val <= stops[0].t) return `rgb(${stops[0].r},${stops[0].g},${stops[0].b})`;
    const last = stops[stops.length - 1];
    if (val >= last.t) return `rgb(${last.r},${last.g},${last.b})`;
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
  function textColor(rgb) {
    const m = rgb.match(/(\d+)/g);
    if (!m) return '#fff';
    const brightness = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
    return brightness > 150 ? '#111' : '#fff';
  }

  function render(records) {
    const wrap = $('ganttContainer');
    if (!wrap) return;
    if (!records || records.length === 0) {
      wrap.innerHTML = '<p class="gantt-empty">暂无温度数据</p>';
      return;
    }

    const tempType = $('tempTypeFilter') ? $('tempTypeFilter').value : 'returnTemp';
    const now = new Date();
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      days.push({
        label: `${d.getMonth() + 1}/${d.getDate()}`,
        key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
        dayOfWeek: ['日', '一', '二', '三', '四', '五', '六'][d.getDay()],
      });
    }

    const ganttData = {};
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
      if (!ganttData[cNo][dateKey] || t.getTime() > ganttData[cNo][dateKey]._ts) {
        ganttData[cNo][dateKey] = { value: Math.round(val * 10) / 10, _ts: t.getTime() };
      }
    });

    const sortedContainers = Array.from(containerSet).sort();
    if (sortedContainers.length === 0) {
      wrap.innerHTML = '<p class="gantt-empty">暂无温度数据</p>';
      return;
    }

    let html = '<table class="gantt-table"><thead><tr><th class="gantt-row-label">柜号</th>';
    days.forEach(d => { html += `<th>${d.label}<br><small>周${d.dayOfWeek}</small></th>`; });
    html += '</tr></thead><tbody>';
    sortedContainers.forEach(cNo => {
      html += `<tr><td class="gantt-row-label">${escHtml(cNo)}</td>`;
      days.forEach(d => {
        const cell = ganttData[cNo] && ganttData[cNo][d.key];
        if (cell && cell.value !== undefined) {
          const bg = tempColor(cell.value);
          html += `<td style="background:${bg};color:${textColor(bg)}">${cell.value}°</td>`;
        } else {
          html += '<td class="gantt-empty-cell">-</td>';
        }
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    wrap.innerHTML = html;
  }

  async function load() {
    try {
      const resp = await ganttFetch('/api/dashboard?hours=168&limit=500');
      const json = await resp.json();
      if (json && json.success && json.data) render(json.data.records || []);
    } catch (e) {
      console.warn('甘特图数据加载失败：', e.message);
    }
  }

  function boot() {
    const filter = $('tempTypeFilter');
    if (filter) filter.addEventListener('change', load);
    load();
    setInterval(load, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
