import type { OverallData } from '@/hooks/useAggregate';

interface SegmentDef {
  v: number;
  bg: string;
  label: string;
  cls: string;
}

const SEGMENTS: (keyof Required<OverallData>)[] = ['signed', 'delivered', 'transit', 'port', 'pending'];
const SEGMENT_CONFIG: Record<string, SegmentDef> = {
  signed:   { v: 0, bg: 'var(--signed)',   label: '已签', cls: 's-signed' },
  delivered: { v: 0, bg: 'var(--delivered)', label: '已交', cls: 's-dlv' },
  transit:  { v: 0, bg: 'var(--transit)',  label: '在途', cls: 's-transit' },
  port:     { v: 0, bg: 'var(--port)',     label: '到港', cls: 's-port' },
  pending:  { v: 0, bg: 'var(--pending)',  label: '待发', cls: 's-pending' },
};

export function ProgressBar({ data }: { data: OverallData }) {
  const segments = SEGMENTS.map((k) => ({
    ...SEGMENT_CONFIG[k],
    v: data[k] ?? 0,
  }));

  const total = segments.reduce((s, seg) => s + seg.v, 0);
  if (total === 0) return null;

  const active = segments.filter((s) => s.v > 0);

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: '.8vw',
    }}>
      <span style={{
        fontSize: '1.25vh',
        color: 'var(--txt2)',
        fontWeight: 700,
        whiteSpace: 'nowrap',
        letterSpacing: '.05em',
      }}>
        总体进度
      </span>
      <div style={{
        flex: 1,
        height: '2.3vh',
        background: 'rgba(255,255,255,.05)',
        borderRadius: '.55vh',
        display: 'flex',
        overflow: 'hidden',
        border: '1px solid var(--line2)',
      }}>
        {active.map((seg, i) => (
          <div
            key={i}
            style={{
              flex: seg.v,
              background: seg.bg,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.25vh',
              fontWeight: 700,
              color: '#06121f',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {seg.v > 0.03 * total ? `${seg.label}${seg.v}` : ''}
          </div>
        ))}
      </div>
    </div>
  );
}
