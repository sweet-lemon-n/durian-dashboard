import { useState, useEffect } from 'react';

export function Clock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const pad = (n: number) => String(n).padStart(2, '0');
  const timeStr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const dateStr = now.toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'long',
  });

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'flex-end',
        gap: '.1vh',
        lineHeight: 1.1,
      }}
    >
      <div style={{ fontSize: '1.25vh', color: 'var(--txt2)', fontWeight: 500 }}>
        {dateStr}
      </div>
      <div
        style={{
          fontSize: '1.9vh',
          color: 'var(--txt)',
          letterSpacing: '.05em',
          fontFamily: 'Oswald, sans-serif',
          fontWeight: 700,
        }}
      >
        {timeStr}
      </div>
    </div>
  );
}
