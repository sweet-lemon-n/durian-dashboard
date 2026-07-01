import { type ReactNode } from 'react';
import { useAuth } from '@/stores/AuthContext';

interface Tab {
  key: string;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

interface Props {
  children: ReactNode;
  tabs: Tab[];
  activeTab: string;
  onTabChange: (key: string) => void;
  title?: string;
}

export function AdminShell({
  children,
  tabs,
  activeTab,
  onTabChange,
  title,
}: Props) {
  const { user, logout } = useAuth();
  const isAdmin = user?.role === 'admin';

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'var(--bg)',
        color: 'var(--txt)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '12px 24px',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '24px' }}>🍈</span>
          <span
            style={{
              fontWeight: 700,
              fontSize: '18px',
              color: 'var(--accent)',
            }}
          >
            {title || '管理后台'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              fontSize: '14px',
              color: 'var(--txt2)',
            }}
          >
            {user?.displayName || user?.username}
            <span
              style={{
                marginLeft: '8px',
                fontSize: '12px',
                color: 'var(--txt3)',
                fontStyle: 'italic',
              }}
            >
              ({user?.role === 'admin' ? '管理员' : '查看者'})
            </span>
          </span>
          <a
            href="/"
            style={{
              color: 'var(--accent)',
              textDecoration: 'none',
              fontSize: '13px',
              border: '1px solid var(--line)',
              padding: '4px 12px',
              borderRadius: '6px',
            }}
          >
            看板
          </a>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              logout();
            }}
            style={{
              color: 'var(--txt2)',
              textDecoration: 'none',
              fontSize: '13px',
              border: '1px solid var(--line)',
              padding: '4px 12px',
              borderRadius: '6px',
            }}
          >
            退出
          </a>
        </div>
      </header>

      {/* Tabs */}
      <nav
        style={{
          display: 'flex',
          gap: '4px',
          padding: '8px 24px 0',
          background: 'var(--bg2)',
          borderBottom: '1px solid var(--line)',
          overflowX: 'auto',
        }}
      >
        {tabs
          .filter((tab) => !tab.adminOnly || isAdmin)
          .map((tab) => (
            <button
              key={tab.key}
              onClick={() => onTabChange(tab.key)}
              style={{
                padding: '10px 20px',
                border: 'none',
                background:
                  activeTab === tab.key ? 'var(--bg)' : 'transparent',
                color:
                  activeTab === tab.key
                    ? 'var(--accent)'
                    : 'var(--txt2)',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab.key ? 700 : 400,
                borderTopLeftRadius: '8px',
                borderTopRightRadius: '8px',
                borderBottom:
                  activeTab === tab.key
                    ? '2px solid var(--accent)'
                    : '2px solid transparent',
                transition: 'all 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
      </nav>

      {/* Content */}
      <main
        style={{
          flex: 1,
          padding: '24px',
          overflow: 'auto',
        }}
      >
        {children}
      </main>
    </div>
  );
}
