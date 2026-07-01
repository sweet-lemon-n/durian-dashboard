import type { KpiData } from '@/hooks/useAggregate';

interface KpiBoxProps {
  label: string;
  value: string | number;
  color: string;
}

function KpiBox({ label, value, color }: KpiBoxProps) {
  return (
    <div
      style={{
        flex: '1 1 0',
        minWidth: 0,
        textAlign: 'center',
        background: 'var(--panel2)',
        border: '1px solid var(--line2)',
        borderRadius: '.9vh',
        padding: '.7vh .4vw',
      }}
    >
      <div
        className="num"
        style={{
          fontSize: '2.7vh',
          lineHeight: 1,
          color,
          fontFamily: 'Oswald, sans-serif',
          fontFeatureSettings: '"tnum"',
        }}
      >
        {value}
      </div>
      <div
        style={{
          fontSize: '1.05vh',
          color: 'var(--txt3)',
          marginTop: '.4vh',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
}

export function KpiCards({ data }: { data: KpiData }) {
  return (
    <div style={{ display: 'flex', gap: '.55vw' }}>
      <KpiBox label="总订单" value={data.totalOrders ?? 0} color="var(--txt)" />
      <KpiBox label="总箱量" value={data.totalBoxes ?? 0} color="var(--txt)" />
      <KpiBox label="已签收" value={data.doneBoxes ?? 0} color="var(--signed)" />
      <KpiBox label="签收率" value={`${data.doneRate ?? 0}%`} color="var(--delivered)" />
      <KpiBox label="在途" value={data.transitBoxes ?? 0} color="var(--transit)" />
      <KpiBox label="待发" value={data.pendingBoxes ?? 0} color="var(--pending)" />
    </div>
  );
}
