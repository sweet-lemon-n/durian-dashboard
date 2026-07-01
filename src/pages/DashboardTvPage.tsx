import { useAggregate } from '@/hooks/useAggregate';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { Clock } from '@/components/ui/Clock';
import { ThemeDots } from '@/components/layout/ThemeDots';

function LoadingScreen() {
  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--txt)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr',
        gap: '1.1vh',
        padding: '1.1vh 1.1vw',
      }}
    >
      {/* Compact top bar for TV */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1vw',
          padding: '0.6vh 1vw',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '1vh',
        }}
      >
        <span style={{ fontSize: '2.5vh' }}>🍈</span>
        <span
          style={{
            fontWeight: 900,
            fontSize: '1.8vh',
            color: 'var(--txt)',
          }}
        >
          榴莲交付总览
        </span>
        <div style={{ flex: 1 }} />
        <Clock />
      </header>

      {/* Loading spinner */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexDirection: 'column',
          gap: '1vh',
          color: 'var(--txt2)',
          fontSize: '1.6vh',
        }}
      >
        <div
          style={{
            width: '5vh',
            height: '5vh',
            border: '.4vh solid rgba(255,255,255,.1)',
            borderTopColor: 'var(--accent)',
            borderRadius: '50%',
            animation: 'dash-spin 1s linear infinite',
          }}
        />
        <div>正在加载数据...</div>
      </div>
    </div>
  );
}

export default function DashboardTvPage() {
  const { data, isLoading, isError } = useAggregate();
  const visibility = data?.visibility ?? {};
  const hasTH = visibility.th !== false;
  const hasVN = visibility.vn !== false;
  const showGantt = visibility.gantt !== false;

  if (isLoading) {
    return <LoadingScreen />;
  }

  if (isError || !data) {
    return (
      <div
        style={{
          height: '100vh',
          width: '100vw',
          overflow: 'hidden',
          background: 'var(--bg)',
          color: 'var(--txt)',
          display: 'grid',
          gridTemplateRows: 'auto 1fr',
          gap: '1.1vh',
          padding: '1.1vh 1.1vw',
        }}
      >
        <header
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1vw',
            padding: '0.6vh 1vw',
            background: 'var(--panel)',
            border: '1px solid var(--line)',
            borderRadius: '1vh',
          }}
        >
          <span style={{ fontSize: '2.5vh' }}>🍈</span>
          <span
            style={{
              fontWeight: 900,
              fontSize: '1.8vh',
              color: 'var(--txt)',
            }}
          >
            榴莲交付总览
          </span>
          <div style={{ flex: 1 }} />
          <Clock />
        </header>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'var(--txt2)',
            fontSize: '1.6vh',
          }}
        >
          数据加载失败，请刷新重试
        </div>
        <ThemeDots />
      </div>
    );
  }

  const columnCount = data.th != null && data.vn != null ? '1fr 1fr' : '1fr';

  return (
    <div
      style={{
        height: '100vh',
        width: '100vw',
        overflow: 'hidden',
        background: 'var(--bg)',
        color: 'var(--txt)',
        display: 'grid',
        gridTemplateRows: 'auto 1fr auto',
        gap: '1.1vh',
        padding: '1.1vh 1.1vw',
      }}
    >
      {/* Compact top bar for TV */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1vw',
          padding: '0.6vh 1vw',
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '1vh',
        }}
      >
        <span style={{ fontSize: '2.5vh' }}>🍈</span>
        <span
          style={{
            fontWeight: 900,
            fontSize: '1.8vh',
            color: 'var(--txt)',
          }}
        >
          {data.meta?.title || '榴莲交付总览'}
        </span>
        <div style={{ flex: 1 }} />
        {data.global && (
          <GlobalAgg
            data={data.global}
            _source={data._source}
            generatedAt={data.generatedAt}
          />
        )}
        <div style={{ flex: 1 }} />
        <Clock />
      </header>

      {/* Main grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: columnCount,
          gap: '1.1vw',
          minHeight: 0,
        }}
      >
        {hasTH && data.th != null && data.th && <CountryPanel data={data.th} side="TH" />}
        {hasVN && data.vn != null && data.vn && <CountryPanel data={data.vn} side="VN" />}
      </div>

      {/* Gantt at bottom */}
      {showGantt && (
        <div
          style={{
            maxHeight: '18vh',
            overflow: 'hidden',
          }}
        >
          <GanttChart />
        </div>
      )}

      <ThemeDots />
    </div>
  );
}
