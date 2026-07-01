interface PortDelay {
  container?: string;
  route?: string;
  category?: string;
  delayDays?: number;
  reason?: string;
}

interface InTransitContainer {
  container?: string;
  brand?: string;
  setTemp?: number;
  returnTemp?: number;
  location?: string;
  status?: string;
  note?: string;
}

interface LogisticsData {
  kpis?: {
    inTransit?: number;
    tempRecords?: number;
    avgReturnTemp?: number;
    tempAlarms?: number;
    portDelayed?: number;
  };
  portDelays?: PortDelay[];
  inTransitContainers?: InTransitContainer[];
}

function StatusPill(status?: string, note?: string) {
  if (status === 'ALARM') {
    return (
      <span
        className="pill alarm"
        style={{
          display: 'inline-block',
          fontSize: '.98vh',
          fontWeight: 700,
          padding: '.12vh .5vw',
          borderRadius: '.4vh',
          lineHeight: 1.4,
          background: 'rgba(248,113,113,.2)',
          color: '#ffb4b4',
        }}
      >
        {'▲' + (note || '异常')}
      </span>
    );
  }
  if (status === 'WARN') {
    return (
      <span
        className="pill warn"
        style={{
          display: 'inline-block',
          fontSize: '.98vh',
          fontWeight: 700,
          padding: '.12vh .5vw',
          borderRadius: '.4vh',
          lineHeight: 1.4,
          background: 'rgba(251,191,36,.18)',
          color: '#ffe08a',
        }}
      >
        {note || '注意'}
      </span>
    );
  }
  return (
    <span
      className="pill ok"
      style={{
        display: 'inline-block',
        fontSize: '.98vh',
        fontWeight: 700,
        padding: '.12vh .5vw',
        borderRadius: '.4vh',
        lineHeight: 1.4,
        background: 'rgba(52,211,153,.16)',
        color: '#86efac',
      }}
    >
      {note || '正常'}
    </span>
  );
}

function devStyle(deviation: number): React.CSSProperties {
  const color =
    deviation >= 3
      ? 'var(--danger)'
      : deviation >= 2
        ? 'var(--warn)'
        : 'var(--ok)';
  return { color, fontWeight: 700 };
}

export function LogisticsPanel({ data }: { data: LogisticsData | undefined }) {
  if (!data) {
    return (
      <div
        style={{
          background: 'var(--panel)',
          border: '1px solid var(--line)',
          borderRadius: '1.3vh',
          borderTop: '.42vh solid var(--accent)',
          padding: '1.2vh 1.2vw',
          display: 'flex',
          flexDirection: 'column',
          gap: '1vh',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div className="l-head" style={{ display: 'flex', alignItems: 'center', gap: '.5vw', position: 'relative' }}>
          <span style={{ fontSize: '2vh' }}>🚚</span>
          <span style={{ fontSize: '1.7vh', fontWeight: 900, letterSpacing: '.05em' }}>
            物流监控 LOGISTICS
          </span>
        </div>
        <p style={{ color: 'var(--txt3)', fontSize: '1.2vh' }}>暂无数据</p>
      </div>
    );
  }

  const k = data.kpis || {};
  const pd = data.portDelays || [];
  const tc = data.inTransitContainers || [];
  const alarms = tc.filter((r) => r.status === 'ALARM').length;

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: '1.3vh',
        borderTop: '.42vh solid var(--accent)',
        padding: '1.2vh 1.2vw',
        display: 'flex',
        flexDirection: 'column',
        gap: '1vh',
        overflow: 'hidden',
        position: 'relative',
      }}
    >
      {/* Subtle radial gradient overlay */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(700px 200px at 50% 0%, rgba(245,196,81,.10), transparent 70%)',
        }}
      />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '.5vw', position: 'relative' }}>
        <span style={{ fontSize: '2vh' }}>🚚</span>
        <span style={{ fontSize: '1.7vh', fontWeight: 900, letterSpacing: '.05em' }}>
          物流监控 LOGISTICS
          <small
            style={{
              color: 'var(--txt3)',
              fontWeight: 500,
              fontSize: '1.15vh',
              marginLeft: '.4vw',
              letterSpacing: '.12em',
            }}
          >
            冷链在途 · 温度与关口实时
          </small>
        </span>
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '1.1vh',
            color: 'var(--txt3)',
          }}
        >
          实时数据
        </span>
      </div>

      {/* KPI cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: '.5vw',
          position: 'relative',
        }}
      >
        <LogisticsKpi
          value={`${k.inTransit ?? 0}`}
          unit="柜"
          label="在途批次"
          cls="c-transit"
        />
        <LogisticsKpi
          value={`${k.tempRecords ?? 0}`}
          unit="条"
          label="温度记录"
          cls="c-wht"
        />
        <LogisticsKpi
          value={`${(k.avgReturnTemp ?? 0).toFixed(1)}`}
          unit="°C"
          label="平均回风温度"
          cls="c-dlv"
        />
        <LogisticsKpi
          value={`${k.tempAlarms ?? 0}`}
          unit="条"
          label="温度异常"
          cls="c-danger"
          alarm
        />
        <LogisticsKpi
          value={`${k.portDelayed ?? 0}`}
          unit="柜"
          label="关口滞留"
          cls="c-port"
          warn
        />
      </div>

      {/* Two tables */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1.18fr',
          gap: '1vw',
          flex: 1,
          minHeight: 0,
          position: 'relative',
        }}
      >
        {/* Port delays */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45vh', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4vw', fontSize: '1.25vh', fontWeight: 700 }}>
            🚨 关口滞留预警
            <span
              className="badge red"
              style={{
                fontSize: '1vh',
                padding: '.15vh .55vw',
                borderRadius: '.45vh',
                fontWeight: 700,
                background: 'rgba(248,113,113,.2)',
                color: '#ffb4b4',
              }}
            >
              {pd.length} 批
            </span>
          </div>
          <table
            className="t"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: '30%' }} />
              <col style={{ width: '21%' }} />
              <col style={{ width: '15%' }} />
              <col style={{ width: '14%' }} />
              <col style={{ width: '20%' }} />
            </colgroup>
            <thead>
              <tr>
                {['柜号 / 路线', '客户', '品类', '滞留', '原因'].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: '1vh',
                      color: 'var(--txt3)',
                      fontWeight: 600,
                      textAlign: 'left',
                      padding: '.4vh .3vw',
                      borderBottom: '1px solid var(--line2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pd.length > 0
                ? pd.map((r, i) => (
                    <tr key={i}>
                      <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.container || '-'}
                      </td>
                      <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.route || '-'}
                      </td>
                      <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        <span
                          className={`pill ${r.category === 'FROZEN' ? 'frozen' : 'fresh'}`}
                          style={{
                            display: 'inline-block',
                            fontSize: '.98vh',
                            fontWeight: 700,
                            padding: '.12vh .5vw',
                            borderRadius: '.4vh',
                            lineHeight: 1.4,
                            background:
                              r.category === 'FROZEN'
                                ? 'rgba(56,189,248,.16)'
                                : 'rgba(239,68,68,.18)',
                            color:
                              r.category === 'FROZEN' ? '#9fdcff' : '#ffb4b4',
                          }}
                        >
                          {r.category === 'FROZEN' ? '冻果' : '鲜果'}
                        </span>
                      </td>
                      <td
                        style={{
                          padding: '.5vh .3vw',
                          borderBottom: '1px solid var(--line2)',
                          fontSize: '1.18vh',
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          ...devStyle(r.delayDays ?? 0),
                        }}
                      >
                        {(r.delayDays ?? 0).toFixed(1)}天
                      </td>
                      <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {r.reason || '-'}
                      </td>
                    </tr>
                  ))
                : (
                    <tr>
                      <td
                        colSpan={5}
                        style={{
                          color: 'var(--txt3)',
                          textAlign: 'center',
                          padding: '.5vh .3vw',
                          fontSize: '1.18vh',
                        }}
                      >
                        暂无滞留
                      </td>
                    </tr>
                  )}
            </tbody>
          </table>
        </div>

        {/* Temperature alerts */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '.45vh', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '.4vw', fontSize: '1.25vh', fontWeight: 700 }}>
            🌡️ 在途冷柜 · 温度告警
            <span
              className="badge red"
              style={{
                fontSize: '1vh',
                padding: '.15vh .55vw',
                borderRadius: '.45vh',
                fontWeight: 700,
                background: 'rgba(248,113,113,.2)',
                color: '#ffb4b4',
              }}
            >
              {alarms} 异常
            </span>
          </div>
          <table
            className="t"
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              tableLayout: 'fixed',
            }}
          >
            <colgroup>
              <col style={{ width: '27%' }} />
              <col style={{ width: '13%' }} />
              <col style={{ width: '17%' }} />
              <col style={{ width: '12%' }} />
              <col style={{ width: '20%' }} />
              <col style={{ width: '11%' }} />
            </colgroup>
            <thead>
              <tr>
                {['柜号', '品牌', '设定/回风', '偏差', '当前位置', '状态'].map((h) => (
                  <th
                    key={h}
                    style={{
                      fontSize: '1vh',
                      color: 'var(--txt3)',
                      fontWeight: 600,
                      textAlign: 'left',
                      padding: '.4vh .3vw',
                      borderBottom: '1px solid var(--line2)',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tc.length > 0
                ? tc.map((r, i) => {
                    const dev = (r.returnTemp ?? 0) - (r.setTemp ?? 0);
                    return (
                      <tr key={i}>
                        <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.container || '-'}
                        </td>
                        <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.brand || '-'}
                        </td>
                        <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {(r.setTemp ?? 0)}° / {(r.returnTemp ?? 0)}°
                        </td>
                        <td
                          style={{
                            padding: '.5vh .3vw',
                            borderBottom: '1px solid var(--line2)',
                            fontSize: '1.18vh',
                            fontWeight: 500,
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            ...devStyle(Math.abs(dev)),
                          }}
                        >
                          {dev >= 0 ? '+' : ''}{dev.toFixed(1)}°
                        </td>
                        <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {r.location || '-'}
                        </td>
                        <td style={{ padding: '.5vh .3vw', borderBottom: '1px solid var(--line2)', fontSize: '1.18vh', fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {StatusPill(r.status, r.note)}
                        </td>
                      </tr>
                    );
                  })
                : (
                    <tr>
                      <td
                        colSpan={6}
                        style={{
                          color: 'var(--txt3)',
                          textAlign: 'center',
                          padding: '.5vh .3vw',
                          fontSize: '1.18vh',
                        }}
                      >
                        暂无在途柜
                      </td>
                    </tr>
                  )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function LogisticsKpi({
  value,
  unit,
  label,
  cls,
  alarm,
  warn,
}: {
  value: string;
  unit: string;
  label: string;
  cls: string;
  alarm?: boolean;
  warn?: boolean;
}) {
  const colorMap: Record<string, string> = {
    'c-transit': 'var(--transit)',
    'c-wht': 'var(--txt)',
    'c-dlv': 'var(--delivered)',
    'c-danger': 'var(--danger)',
    'c-port': 'var(--port)',
  };

  return (
    <div
      style={{
        background: alarm
          ? 'rgba(248,113,113,.08)'
          : warn
            ? 'rgba(251,191,36,.07)'
            : 'var(--panel2)',
        border: `1px solid ${alarm ? 'rgba(248,113,113,.5)' : warn ? 'rgba(251,191,36,.45)' : 'var(--line2)'}`,
        borderRadius: '.85vh',
        padding: '.6vh .3vw',
        textAlign: 'center',
        position: 'relative',
      }}
    >
      <div
        className="num"
        style={{
          fontSize: '2.4vh',
          lineHeight: 1,
          color: colorMap[cls] || 'var(--txt)',
        }}
      >
        {value}
        <span
          style={{
            fontSize: '1.05vh',
            fontWeight: 600,
            color: 'var(--txt2)',
            marginLeft: '.12vw',
          }}
        >
          {unit}
        </span>
      </div>
      <div
        style={{
          fontSize: '1.02vh',
          color: 'var(--txt3)',
          marginTop: '.35vh',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
    </div>
  );
}
