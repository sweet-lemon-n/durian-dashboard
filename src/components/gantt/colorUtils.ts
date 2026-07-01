export function tempColor(val: number): string {
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

export function textColor(rgb: string): string {
  const m = rgb.match(/(\d+)/g);
  if (!m) return '#fff';
  const brightness = (parseInt(m[0]) * 299 + parseInt(m[1]) * 587 + parseInt(m[2]) * 114) / 1000;
  return brightness > 150 ? '#111' : '#fff';
}

export function getLast7Days(now: Date) {
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
  return days;
}
