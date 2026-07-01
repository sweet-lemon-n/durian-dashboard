import type { AggregateData } from '@/hooks/useAggregate';

interface AggItem {
  v: number | string;
  u: string;
  cls?: string;
}

export function GlobalAgg({
  data,
  _source,
  generatedAt,
}: {
  data: AggregateData['global'];
  _source?: string;
  generatedAt?: string;
}) {
  if (!data) return null;

  const items: AggItem[] = [
    { v: data.totalOrders, u: '合计订单 / 单' },
    { v: data.totalBoxes, u: '合计箱量 / 柜' },
    { v: data.totalArrived || 0, u: '已到岸 / 柜' },
    { v: data.totalDone, u: '已签收 / 柜', cls: 'green' },
    { v: data.totalMoving, u: '国外在途 / 柜' },
    { v: data.totalPending, u: '待发 / 柜' },
  ];

  const srcTag =
    _source === 'wecom'
      ? ' · 📡企微'
      : _source === 'manual'
        ? ' · ✏️手动'
        : '';

  const timeText = generatedAt
    ? new Date(generatedAt).toLocaleTimeString('zh-CN')
    : '';

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'baseline',
        gap: '1.1vw',
        overflow: 'hidden',
        padding: '.3vh 0',
        minHeight: 0,
        flexShrink: 0,
        borderBottom: '1px solid var(--line)',
        paddingBottom: '.6vh',
        marginBottom: '.2vh',
      }}
    >
      {items.map((item, i) => (
        <div
          key={i}
          style={{
            display: 'flex',
            flexDirection: 'column',
            lineHeight: 1.05,
            flexShrink: 0,
          }}
        >
          <span
            className={`num${item.cls ? ' ' + item.cls : ''}`}
            style={{
              fontSize: '2.7vh',
              color: item.cls === 'green' ? 'var(--signed)' : 'var(--accent)',
            }}
          >
            {item.v}
          </span>
          <span
            style={{
              fontSize: '1.05vh',
              color: 'var(--txt3)',
              letterSpacing: '.04em',
              marginTop: '.2vh',
              whiteSpace: 'nowrap',
            }}
          >
            {item.u}
          </span>
        </div>
      ))}
      <div style={{ flex: 1 }} />
      {(timeText || srcTag) && (
        <div
          style={{
            fontSize: '1.05vh',
            color: 'var(--txt3)',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}
        >
          最后更新 {timeText}
          {srcTag}
        </div>
      )}
    </div>
  );
}
