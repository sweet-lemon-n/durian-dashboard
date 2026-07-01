interface NewsItem {
  icon?: string;
  title: string;
  url?: string;
  detail?: string;
  source?: string;
}

interface NewsData {
  auto?: NewsItem[];
  th?: NewsItem[];
  vn?: NewsItem[];
  fetchedAt?: string;
}

function newsTimeText(fetchedAt?: string): string {
  if (!fetchedAt) return '等待自动更新';
  return (
    '最后更新 ' +
    new Date(fetchedAt).toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  );
}

function NewsItemRow({ item }: { item: NewsItem }) {
  return (
    <div
      style={{
        display: 'flex',
        gap: '.5vw',
        alignItems: 'flex-start',
      }}
    >
      <span style={{ fontSize: '1.2vh', lineHeight: 1.22, flexShrink: 0 }}>
        {item.icon || '📌'}
      </span>
      <div style={{ lineHeight: 1.22, minWidth: 0 }}>
        <div
          style={{
            fontSize: '1.08vh',
            fontWeight: 700,
            color: 'var(--txt)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {item.url ? (
            <a
              href={item.url}
              target="_blank"
              rel="noopener noreferrer"
              style={{ color: 'inherit', textDecoration: 'none' }}
              title="点击查看原文"
            >
              {item.title}
            </a>
          ) : (
            item.title
          )}
          {item.source ? (
            <small style={{ color: 'var(--accent)', marginLeft: '.3vw' }}>
              自动
            </small>
          ) : null}
        </div>
        <div
          style={{
            fontSize: '.92vh',
            color: 'var(--txt2)',
            display: '-webkit-box',
            WebkitLineClamp: 1,
            WebkitBoxOrient: 'vertical',
            overflow: 'hidden',
          }}
        >
          {item.detail || ''}
        </div>
      </div>
    </div>
  );
}

export function NewsPanel({ data }: { data: NewsData | undefined }) {
  const autoItems = (data?.auto ?? []).slice(0, 12);

  return (
    <div
      style={{
        background: 'var(--panel)',
        border: '1px solid var(--line)',
        borderRadius: '1.3vh',
        borderTop: '.35vh solid var(--accent)',
        padding: '1.2vh 1.1vw',
        display: 'flex',
        flexDirection: 'column',
        gap: '.7vh',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '.4vw',
          fontSize: '1.5vh',
          fontWeight: 900,
          letterSpacing: '.04em',
        }}
      >
        📢 自动新闻 · INDUSTRY NEWS
        <span
          style={{
            marginLeft: 'auto',
            fontSize: '.95vh',
            color: 'var(--txt3)',
            fontWeight: 500,
          }}
        >
          {newsTimeText(data?.fetchedAt)}
        </span>
      </div>

      {/* Body */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '.65vh',
          flex: 1,
          minHeight: 0,
          overflow: 'hidden',
          paddingRight: '.1vw',
        }}
      >
        {/* Global / default section */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: '.42vh',
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          <div
            className="n-section-head global"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '.4vw',
              fontSize: '1.2vh',
              fontWeight: 700,
              letterSpacing: '.04em',
              padding: '.25vh .55vw',
              borderRadius: '.5vh',
              alignSelf: 'flex-start',
              background: 'rgba(234,179,8,.16)',
              color: '#fde68a',
              border: '1px solid rgba(234,179,8,.32)',
            }}
          >
            🌏 榴莲与东南亚影响
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: '.42vh',
              minHeight: 0,
              overflow: 'hidden',
            }}
          >
            {autoItems.length > 0
              ? autoItems.map((item, i) => <NewsItemRow key={i} item={item} />)
              : (
                <div style={{ color: 'var(--txt3)', fontSize: '1.1vh' }}>
                  暂无自动新闻
                </div>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}
