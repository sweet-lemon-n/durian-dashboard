import { type ReactNode } from 'react';
import { Link } from 'react-router';
import { useAuth } from '@/stores/AuthContext';
import { useTheme } from '@/stores/ThemeContext';
import { Clock } from '@/components/ui/Clock';
import { ThemeDots } from '@/components/layout/ThemeDots';

interface Props {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  /** Whether to show theme switcher dots (true for TV page, false for regular dashboard) */
  showThemeDots?: boolean;
  /** If true, use single-viewport zero-scroll layout for TV mode */
  tv?: boolean;
}

export function DashboardShell({
  title,
  subtitle,
  children,
  showThemeDots,
  tv,
}: Props) {
  const { user, logout } = useAuth();
  useTheme();

  return (
    <div
      className={tv ? 'board-tv' : 'board'}
      style={{
        background: tv ? 'var(--bg)' : undefined,
        height: '100vh',
        width: '100vw',
        overflow: tv ? 'hidden' : 'auto',
        display: 'grid',
        gridTemplateRows: tv ? 'auto 1fr' : '6vh 41.5vh 1fr',
        gap: '1.1vh',
        padding: '1.1vh 1.1vw',
      }}
    >
      {/* Top bar */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '1.3vw',
          padding: '0 1.3vw',
          borderRadius: '1.1vh',
          background: `linear-gradient(90deg, rgba(234,179,8,.14), rgba(239,68,68,.14))`,
          border: '1px solid var(--line)',
          position: 'relative',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.8vw',
            flexShrink: 0,
          }}
        >
          <span style={{ fontSize: '3vh' }}>🍈</span>
          <div>
            <div
              style={{
                fontWeight: 900,
                fontSize: '2.2vh',
                letterSpacing: '.08em',
                color: 'var(--txt)',
              }}
            >
              {title || '榴莲交付总览'}
            </div>
            <div
              style={{
                fontSize: '1.2vh',
                color: 'var(--txt2)',
                letterSpacing: '.06em',
              }}
            >
              {subtitle || 'DURIAN DELIVERY OVERVIEW'}
            </div>
          </div>
        </div>

        <div style={{ flex: 1 }} />

        <Clock />

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '.5vw',
            fontSize: '1.2vh',
            color: 'var(--txt2)',
          }}
        >
          <span>👤</span>
          <span
            style={{
              color: 'var(--accent)',
              fontWeight: 700,
              maxWidth: '8vw',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {user?.displayName || user?.username}
          </span>
          {user?.role === 'admin' && (
            <Link
              to="/admin"
              style={{
                color: 'var(--accent)',
                textDecoration: 'none',
                border: '1px solid rgba(245,196,81,.4)',
                padding: '.2vh .55vw',
                borderRadius: '.5vh',
                fontSize: '1.15vh',
              }}
            >
              后台
            </Link>
          )}
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
            style={{
              color: 'var(--txt2)',
              textDecoration: 'none',
              border: '1px solid var(--line)',
              padding: '.2vh .55vw',
              borderRadius: '.5vh',
              fontSize: '1.15vh',
            }}
          >
            退出
          </a>
        </div>
      </header>

      {children}

      {showThemeDots && <ThemeDots />}
    </div>
  );
}
