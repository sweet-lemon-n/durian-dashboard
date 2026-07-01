import { useEffect } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { useAggregate } from '@/hooks/useAggregate';
import { useTheme } from '@/stores/ThemeContext';

function LoadingScreen() {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
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
  );
}

export default function DashboardSentryPage() {
  const { data, isLoading, isError } = useAggregate();
  const { theme: prevTheme, setTheme } = useTheme();

  useEffect(() => {
    const saved = prevTheme;
    setTheme('violet');
    return () => setTheme(saved);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const visibility = data?.visibility ?? {};
  const hasTH = visibility.th !== false;
  const hasVN = visibility.vn !== false;
  const showGantt = visibility.gantt !== false;

  if (isLoading) {
    return (
      <DashboardShell
        title="榴莲交付总览"
        subtitle="DURIAN DELIVERY · SENTRY VIEW"
      >
        <LoadingScreen />
      </DashboardShell>
    );
  }

  if (isError || !data) {
    return (
      <DashboardShell
        title="榴莲交付总览"
        subtitle="DURIAN DELIVERY · SENTRY VIEW"
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100%',
            color: 'var(--txt2)',
            fontSize: '1.6vh',
          }}
        >
          数据加载失败，请刷新重试
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell
      title={data?.meta?.title || '榴莲交付总览'}
      subtitle="DURIAN DELIVERY · SENTRY VIEW"
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.1vw',
          paddingLeft: '1.3vw',
        }}
      >
        {data?.global && (
          <GlobalAgg
            data={data.global}
            _source={data._source}
            generatedAt={data.generatedAt}
          />
        )}
      </div>

      <div
        className="dashboard-main"
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '1.1vw',
          minHeight: 0,
        }}
      >
        {hasTH && data?.th && <CountryPanel data={data.th} side="TH" />}
        {hasVN && data?.vn && <CountryPanel data={data.vn} side="VN" />}
      </div>

      {showGantt && (
        <div
          style={{
            maxHeight: '22vh',
            overflow: 'hidden',
            marginTop: '1.1vh',
          }}
        >
          <GanttChart />
        </div>
      )}
    </DashboardShell>
  );
}
