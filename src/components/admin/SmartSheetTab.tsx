import { useState } from 'react';
import { SheetList } from './SheetList';
import { FieldManager } from './FieldManager';
import { RecordTable } from './RecordTable';
import { useSheets } from '@/hooks/useSmartsheet';
import { useSetupDoc, useRefreshSchema } from '@/hooks/useSmartSheetAdmin';

interface Sheet {
  sheet_id: string;
  title: string;
}

export function SmartSheetTab() {
  const { data } = useSheets();
  const setupDoc = useSetupDoc();
  const refreshSchema = useRefreshSchema();
  const [selectedSheetId, setSelectedSheetId] = useState('');

  const rawData = data as { data?: { sheets?: Sheet[] } } | undefined;
  const sheets = rawData?.data?.sheets ?? [];
  const hasDoc = sheets.length > 0;

  return (
    <div className="panel active">
      {/* Header toolbar */}
      <div
        style={{
          display: 'flex', alignItems: 'center', gap: '10px',
          marginBottom: '20px', flexWrap: 'wrap',
        }}
      >
        <h2 style={{ fontSize: '16px', marginRight: 'auto' }}>
          🗄 智能表格管理
        </h2>

        {!hasDoc && (
          <button
            onClick={() => {
              if (confirm('将创建新的智能表格文档，包含温度记录子表')) setupDoc.mutate();
            }}
            style={{
              padding: '7px 14px', fontSize: '13px', background: '#f5c451', color: '#000',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            🏗 初始化文档
          </button>
        )}

        {hasDoc && (
          <button
            onClick={() => refreshSchema.mutate()}
            style={{
              padding: '7px 14px', fontSize: '13px', background: '#2c3654', color: '#e8edf7',
              border: '1px solid #3c4664', borderRadius: '6px', cursor: 'pointer', fontWeight: 500,
            }}
          >
            🔄 刷新缓存
          </button>
        )}
      </div>

      {/* Two-column layout: sheet list + detail panels */}
      <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
        {/* Left sidebar: sheet list */}
        <div
          style={{
            width: '220px', minWidth: '220px',
            background: '#161d2e', borderRadius: '8px',
            border: '1px solid #2c3654', padding: '12px',
          }}
        >
          <SheetList selectedId={selectedSheetId} onSelect={setSelectedSheetId} />
        </div>

        {/* Right content: fields + records */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedSheetId ? (
            <div
              style={{
                color: '#6b7896', fontSize: '14px', padding: '60px 20px',
                textAlign: 'center',
                background: '#161d2e', borderRadius: '8px',
                border: '1px solid #2c3654',
              }}
            >
              请从左侧选择一个子表以查看字段和记录
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {/* Fields section */}
              <div
                style={{
                  background: '#161d2e', borderRadius: '8px',
                  border: '1px solid #2c3654', padding: '14px',
                }}
              >
                <FieldManager sheetId={selectedSheetId} />
              </div>

              {/* Records section */}
              <div
                style={{
                  background: '#161d2e', borderRadius: '8px',
                  border: '1px solid #2c3654', padding: '14px',
                }}
              >
                <RecordTable sheetId={selectedSheetId} />
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
