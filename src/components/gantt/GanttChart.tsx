import { useMemo } from 'react';
import { useDashboard, type TempRecord } from '@/hooks/useDashboard';
import { tempColor, textColor, getLast7Days } from './colorUtils';
import './GanttChart.css';

interface Props {
  tempType?: 'returnTemp' | 'supplyTemp' | 'setTemp';
  onContainerClick?: (containerNo: string) => void;
}

export function GanttChart({ tempType = 'returnTemp', onContainerClick }: Props) {
  const { data, isLoading, isError } = useDashboard(168, 500);
  // Compute days dynamically from current time so headers update when new data arrives
  const days = useMemo(() => getLast7Days(new Date()), [data]);

  const ganttData = useMemo(() => {
    const map: Record<string, Record<string, { value: number }>> = {};
    const records = data?.data?.records ?? [];

    records.forEach((r: TempRecord) => {
      const cNo = r.containerNo || '未知';
      const t = r.updateTime ? new Date(r.updateTime) : null;
      if (!t || isNaN(t.getTime())) return;

      const dateKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
      const val = r[tempType] as number | undefined;
      if (val === null || val === undefined || isNaN(val)) return;

      if (!map[cNo]) map[cNo] = {};
      const existing = map[cNo][dateKey];
      if (!existing || t.getTime() > (existing as unknown as { _ts: number })._ts) {
        map[cNo][dateKey] = { value: Math.round(val * 10) / 10 };
        (map[cNo][dateKey] as unknown as { _ts: number })._ts = t.getTime();
      }
    });

    return map;
  }, [data, tempType]);

  const containers = useMemo(() => {
    const set = new Set<string>();
    (data?.data?.records ?? []).forEach((r: TempRecord) => {
      if (r.containerNo) set.add(r.containerNo);
    });
    return Array.from(set).sort();
  }, [data]);

  if (isLoading) return <div className="gantt-empty">加载温度数据...</div>;
  if (isError || !data?.success) return <div className="gantt-empty">温度数据加载失败</div>;
  if (containers.length === 0) return <div className="gantt-empty">暂无温度数据</div>;

  return (
    <div className="gantt-wrap">
      <table className="gantt-table">
        <thead>
          <tr>
            <th className="gantt-row-label">柜号</th>
            {days.map((d) => (
              <th key={d.key}>{d.label}<br /><small>周{d.dayOfWeek}</small></th>
            ))}
          </tr>
        </thead>
        <tbody>
          {containers.map((cNo) => (
            <tr key={cNo}>
              <td className="gantt-row-label">
                {onContainerClick ? (
                  <button className="drill-link" onClick={() => onContainerClick(cNo)}>
                    {cNo}
                  </button>
                ) : (
                  cNo
                )}
              </td>
              {days.map((d) => {
                const cell = ganttData[cNo]?.[d.key];
                if (cell) {
                  const bg = tempColor(cell.value);
                  return (
                    <td key={d.key} style={{ background: bg, color: textColor(bg) }}>
                      {cell.value}°
                    </td>
                  );
                }
                return <td key={d.key} className="gantt-empty-cell">-</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
