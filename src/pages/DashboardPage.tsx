import { useState } from 'react';
import { DashboardShell } from '@/components/layout/DashboardShell';
import { GlobalAgg } from '@/components/dashboard/GlobalAgg';
import { CountryPanel } from '@/components/dashboard/CountryPanel';
import { LogisticsPanel } from '@/components/dashboard/LogisticsPanel';
import { NewsPanel } from '@/components/dashboard/NewsPanel';
import { GanttChart } from '@/components/gantt/GanttChart';
import { useAggregate } from '@/hooks/useAggregate';
import './DashboardPage.css';

const TEMP_TYPES = [
  { value: 'returnTemp', label: '回风温度' },
  { value: 'setTemp', label: '设定温度' },
  { value: 'supplyTemp', label: '送风温度' },
] as const;

type TempType = (typeof TEMP_TYPES)[number]['value'];

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

export default function DashboardPage() {
  const { data, isLoading, isError } = useAggregate();
  const [tempType, setTempType] = useState<TempType>('returnTemp');

  if (isLoading) {
    return (
      <DashboardShell>
        <LoadingScreen />
      </DashboardShell>
    );
  }

  if (isError || !data) {
    return (
      <DashboardShell>
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

  const visibility = data.visibility ?? {};
  const showSummary = visibility.summary !== false;
  const hasTH = visibility.th !== false;
  const hasVN = visibility.vn !== false;
  const hasLogistics = visibility.logistics !== false;
  const hasNews = visibility.news !== false;
  const showGantt = visibility.gantt !== false;

  const showOneCountry = hasTH !== hasVN;
  const showNoCountries = !hasTH && !hasVN;

  return (
    <DashboardShell
      title={data.meta?.title}
      subtitle={data.meta?.subtitle}
    >
      {/* Row 2 (41.5vh): GlobalAgg + Country panels */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '.4vh',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {showSummary && data.global && (
          <GlobalAgg
            data={data.global}
            _source={data._source}
            generatedAt={data.generatedAt}
          />
        )}

        <div
          className={`main-grid${showOneCountry ? ' one-col' : ''}${showNoCountries ? ' empty' : ''}`}
          style={{ flex: 1, minHeight: 0 }}
        >
          {hasTH && data.th && <CountryPanel side="TH" data={data.th} />}
          {hasVN && data.vn && <CountryPanel side="VN" data={data.vn} />}
          {showNoCountries && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'var(--txt3)',
                fontSize: '1.4vh',
                height: '100%',
              }}
            >
              暂无看板内容
            </div>
          )}
        </div>
      </div>

      {/* Row 3 (1fr): Bottom sections + Gantt */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '1.1vh',
          minHeight: 0,
          overflow: 'hidden',
        }}
      >
        {/* Bottom grid: logistics + news */}
        {(hasLogistics || hasNews) && (
          <div
            className="bottom-grid"
            style={{
              flexShrink: 0,
              minHeight: hasLogistics && hasNews ? '30vh' : 'auto',
            }}
          >
            {hasLogistics && <LogisticsPanel data={data.logistics as never} />}
            {hasNews && <NewsPanel data={data.news as never} />}
          </div>
        )}

        {/* Gantt chart */}
        {showGantt && (
          <div className="gantt-section-dash" style={{ flexShrink: 0 }}>
            <div className="g-head">
              <h2>📅 温度甘特图</h2>
              <span className="g-sub">最近 7 天 · 柜号 × 日期 · 企业微信实时温度</span>
              <div className="g-ctrl">
                <span>显示温度：</span>
                <select
                  value={tempType}
                  onChange={(e) => setTempType(e.target.value as TempType)}
                >
                  {TEMP_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="gantt-legend">
              <span>冷</span>
              <span className="legend-bar" />
              <span>热</span>
            </div>
            <div id="ganttContainer">
              <GanttChart tempType={tempType} />
            </div>
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
