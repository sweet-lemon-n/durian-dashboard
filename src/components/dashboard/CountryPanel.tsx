import type { CountryData, BrandData } from '@/hooks/useAggregate';
import { KpiCards } from './KpiCards';
import { ProgressBar } from './ProgressBar';

const CAT_LABELS: Record<string, string> = {
  FRESH: '🍒 鲜果 FRESH',
  FROZEN: '❄️ 冻肉 FROZEN',
};

const CAT_CLS: Record<string, string> = {
  FRESH: 'fresh',
  FROZEN: 'frozen',
};

function BrandRow({ brand }: { brand: BrandData }) {
  const total = brand.boxes || 1;
  const done = brand.delivered || 0;
  const transit = brand.transit || 0;
  const pending = brand.pending || 0;

  const doneW = (done / total) * 100;
  const transitW = (transit / total) * 100;

  const segs: { w: number; cls: string; v: number }[] = [];
  if (done > 0) segs.push({ w: doneW, cls: 's-signed', v: done });
  if (transit > 0) segs.push({ w: transitW, cls: 's-transit', v: transit });
  if (pending > 0 || segs.length === 0) {
    segs.push({
      w: segs.length === 0 ? 100 : ((pending || total) / total) * 100,
      cls: 's-pending',
      v: pending || total,
    });
  }

  const brandRate = brand.rate ?? 0;

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '12.5vw 1fr 5.8vw',
        alignItems: 'center',
        gap: '.65vw',
      }}
    >
      <div
        style={{
          fontSize: '1.08vh',
          fontWeight: 700,
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        <span style={{ color: 'var(--txt)', cursor: 'pointer' }}>
          {brand.brand}
        </span>
        <small style={{ fontSize: '.9vh', color: 'var(--txt3)', fontWeight: 500, marginLeft: '.25vw' }}>
          {brand.orders ?? 0} 单 / {brand.boxes ?? 0} 柜
        </small>
      </div>
      <div
        style={{
          flex: 1,
          height: '1.34vh',
          background: 'rgba(255,255,255,.05)',
          borderRadius: '.55vh',
          display: 'flex',
          overflow: 'hidden',
          border: '1px solid var(--line2)',
        }}
      >
        {segs.map((s, i) => (
          <span
            key={i}
            className={s.cls}
            style={{
              width: `${s.w}%`,
              background:
                s.cls === 's-signed'
                  ? 'var(--signed)'
                  : s.cls === 's-transit'
                    ? 'var(--transit)'
                    : 'var(--pending)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '.86vh',
              fontWeight: 700,
              color: s.cls === 's-pending' ? '#dbe4f2' : '#06121f',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              minWidth: 0,
            }}
          >
            {s.w > 10 ? s.v : ''}
          </span>
        ))}
      </div>
      <div
        style={{
          fontSize: '.84vh',
          color: 'var(--txt3)',
          textAlign: 'right',
          whiteSpace: 'nowrap',
          lineHeight: 1.05,
        }}
      >
        签收率{' '}
        <b
          style={{
            color: brandRate >= 50 ? 'var(--warn)' : 'var(--danger)',
            fontWeight: 700,
          }}
        >
          {brandRate.toFixed(1)}%
        </b>
      </div>
    </div>
  );
}

function CategorySection({
  category,
  brands,
}: {
  category: string;
  brands: BrandData[];
}) {
  const filtered = brands.filter((b) => b.category === category);
  if (filtered.length === 0) return null;

  const sum = filtered.reduce(
    (acc, b) => ({
      orders: acc.orders + (b.orders ?? 0),
      boxes: acc.boxes + (b.boxes ?? 0),
      delivered: acc.delivered + (b.delivered ?? 0),
      transit: (acc.transit ?? 0) + (b.transit ?? 0),
      pending: (acc.pending ?? 0) + (b.pending ?? 0),
      signed: (acc.signed ?? 0) + (b.signed ?? 0),
    }),
    { orders: 0, boxes: 0, delivered: 0, transit: 0, pending: 0, signed: 0 }
  );

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '.28vh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6vw', flexWrap: 'wrap' }}>
        <span
          className={`cat-tag ${CAT_CLS[category] || category.toLowerCase()}`}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '.3vw',
            padding: '.18vh .55vw',
            borderRadius: '.5vh',
            fontSize: '1.08vh',
            fontWeight: 700,
            letterSpacing: '.04em',
            background:
              category === 'FRESH'
                ? 'rgba(239,68,68,.16)'
                : 'rgba(56,189,248,.15)',
            color:
              category === 'FRESH' ? '#ffb4b4' : '#9fdcff',
            border:
              category === 'FRESH'
                ? '1px solid rgba(239,68,68,.35)'
                : '1px solid rgba(56,189,248,.32)',
          }}
        >
          {CAT_LABELS[category] || category}
        </span>
        <span
          style={{
            fontSize: '1.02vh',
            color: 'var(--txt2)',
            fontWeight: 600,
          }}
        >
          <b style={{ color: 'var(--txt)' }}>{sum.orders} 单 / {sum.boxes} 柜</b>
          {' · '}到岸 0 · 签收 {sum.delivered} · 国外在途 {sum.transit} · 待发 {sum.pending}
        </span>
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '.26vh',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {filtered.map((brand) => (
          <BrandRow key={`${brand.brand}-${brand.category}`} brand={brand} />
        ))}
      </div>
    </div>
  );
}

export function CountryPanel({
  side,
  data,
}: {
  side: 'TH' | 'VN';
  data: CountryData;
}) {
  if (!data) return null;

  const isTH = side === 'TH';
  const flag = isTH ? '🇹🇭' : '🇻🇳';
  const name = isTH ? '泰国 THAILAND' : '越南 VIETNAM';

  return (
    <div
      className="country-panel"
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: '1.3vh',
        padding: '1.2vh 1.3vw 1.3vh',
        borderTop: `.42vh solid var(--${isTH ? 'th' : 'vn'})`,
        display: 'flex',
        flexDirection: 'column',
        gap: '.95vh',
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.6vw' }}>
        <span style={{ fontSize: '2.7vh' }}>{flag}</span>
        <span
          style={{
            fontSize: '2.3vh',
            fontWeight: 900,
            letterSpacing: '.07em',
            color: 'var(--txt)',
          }}
        >
          {name}
        </span>
      </div>

      {/* KPI cards */}
      {data.kpis && <KpiCards data={data.kpis} />}

      {/* Overall progress bar */}
      {data.overall && <ProgressBar data={data.overall} />}

      {/* Legend */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '.8vw',
          fontSize: '1.15vh',
          color: 'var(--txt2)',
        }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3vw' }}>
          <i
            style={{
              width: '.95vh',
              height: '.95vh',
              borderRadius: '50%',
              display: 'inline-block',
              background: 'var(--signed)',
            }}
          />
          已交付
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3vw' }}>
          <i
            style={{
              width: '.95vh',
              height: '.95vh',
              borderRadius: '50%',
              display: 'inline-block',
              background: 'var(--transit)',
            }}
          />
          在途
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '.3vw' }}>
          <i
            style={{
              width: '.95vh',
              height: '.95vh',
              borderRadius: '50%',
              display: 'inline-block',
              background: 'var(--pending)',
            }}
          />
          待发
        </span>
      </div>

      {/* Category sections */}
      <div
        style={{
          display: 'grid',
          gridTemplateRows: 'minmax(0, 1.25fr) minmax(0, .95fr)',
          gap: '.55vh',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          paddingRight: '.1vw',
        }}
      >
        <CategorySection category="FRESH" brands={data.brands ?? []} />
        <CategorySection category="FROZEN" brands={data.brands ?? []} />
      </div>
    </div>
  );
}
