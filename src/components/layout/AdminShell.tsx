import { type ReactNode, useState } from 'react';
import { useAuth } from '@/stores/AuthContext';

interface Tab {
  key: string;
  label: string;
  icon: string;
}

const TABS: Tab[] = [
  { key: 'orders', label: '订单管理', icon: '📦' },
  { key: 'logistics', label: '物流监控', icon: '🚢' },
  { key: 'news', label: '资讯管理', icon: '📰' },
  { key: 'smartsheet', label: '智能表格', icon: '🗄' },
];

export function AdminShell({ children }: { children: (activeTab: string) => ReactNode }) {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState('orders');

  return (
    <div style={{ background: '#0f1421', color: '#e8edf7', minHeight: '100vh', fontFamily: '"Noto Sans SC", sans-serif' }}>
      {/* Header */}
      <header style={{
        display: 'flex', alignItems: 'center', gap: '16px', padding: '14px 24px',
        background: '#161d2e', borderBottom: '1px solid #2c3654', position: 'sticky', top: 0, zIndex: 10,
      }}>
        <h1 style={{ fontSize: '18px', fontWeight: 900 }}>
          管理后台 <small style={{ color: '#6b7896', fontWeight: 500, marginLeft: '8px', fontSize: '12px' }}>
            榴莲运输温度监控看板
          </small>
        </h1>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '13px', color: '#9aa8c4' }}>
          👤 <b style={{ color: '#f5c451' }}>{user?.displayName || user?.username}</b>
        </span>
        <a href="/" style={{ color: '#f5c451', textDecoration: 'none', fontSize: '13px', padding: '6px 14px', border: '1px solid #f5c451', borderRadius: '6px' }}>
          看板
        </a>
        <a href="#" onClick={(e) => { e.preventDefault(); logout(); }} style={{
          color: '#f87171', textDecoration: 'none', fontSize: '13px', padding: '6px 14px',
          border: '1px solid rgba(248,113,113,.4)', borderRadius: '6px',
        }}>
          退出
        </a>
      </header>

      <div style={{ maxWidth: '1400px', margin: '0 auto', padding: '20px' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '18px', flexWrap: 'wrap' }}>
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                padding: '9px 18px', border: '1px solid #2c3654', borderRadius: '8px 8px 0 0',
                cursor: 'pointer', fontWeight: 600, fontSize: '14px', transition: '.15s',
                background: activeTab === tab.key ? '#f5c451' : '#1b2236',
                color: activeTab === tab.key ? '#000' : '#9aa8c4',
                borderColor: activeTab === tab.key ? '#f5c451' : '#2c3654',
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        {/* Panel */}
        {children(activeTab)}
      </div>
    </div>
  );
}
