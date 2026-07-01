import { useSheets } from '@/hooks/useSmartsheet';

export function SmartSheetTab() {
  const { data, isLoading, isError } = useSheets();

  return (
    <div className="panel">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px' }}>🗄 智能表格管理</h2>
      </div>

      {isLoading && <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>加载表格信息...</div>}
      {isError && <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#f87171' }}>连接失败，请检查企业微信配置</div>}
      {data ? (
        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
          <div style={{ background: '#232c44', padding: '12px 18px', borderRadius: '8px', border: '1px solid #2c3654' }}>
            <div style={{ fontSize: '22px', color: '#f5c451' }}>
              {((data as { data?: { sheets?: unknown[] } }).data?.sheets ?? []).length}
            </div>
            <div style={{ fontSize: '12px', color: '#6b7896', marginTop: '2px' }}>子表数</div>
          </div>
        </div>
      ) : null}
      <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>
        智能表格详细管理功能 — 从 admin-smartsheet.js 迁移中...
      </div>
    </div>
  );
}
