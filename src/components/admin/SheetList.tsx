import { useState } from 'react';
import { useSheets, useAddSheet, useDeleteSheet } from '@/hooks/useSmartsheet';

interface Sheet {
  sheet_id: string;
  title: string;
}

interface Props {
  selectedId: string;
  onSelect: (id: string) => void;
}

export function SheetList({ selectedId, onSelect }: Props) {
  const { data, isLoading } = useSheets();
  const addSheet = useAddSheet();
  const deleteSheet = useDeleteSheet();
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const rawData = data as { data?: { sheets?: Sheet[] } } | undefined;
  const sheets = rawData?.data?.sheets ?? [];

  if (isLoading) {
    return (
      <div style={{ color: '#6b7896', fontSize: '13px', padding: '10px 0' }}>
        加载子表列表...
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4', marginRight: 'auto' }}>
          子表列表 <span style={{ color: '#6b7896' }}>({sheets.length})</span>
        </h3>
        <button
          onClick={() => setShowAdd(!showAdd)}
          style={{
            padding: '4px 10px', fontSize: '12px', background: '#f5c451', color: '#000',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {showAdd ? '取消' : '+ 新增子表'}
        </button>
      </div>

      {showAdd && (
        <div style={{ display: 'flex', gap: '6px', marginBottom: '10px' }}>
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="子表名称"
            style={{
              flex: 1, background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
              padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
            }}
          />
          <button
            onClick={() => {
              if (newTitle.trim()) {
                addSheet.mutate({ title: newTitle.trim() });
                setNewTitle('');
                setShowAdd(false);
              }
            }}
            style={{
              padding: '4px 12px', background: '#22c55e', color: '#fff', border: 'none',
              borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
            }}
          >
            确认
          </button>
        </div>
      )}

      {sheets.length === 0 ? (
        <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
          暂无子表
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {sheets.map((sheet: Sheet) => (
            <button
              key={sheet.sheet_id}
              onClick={() => onSelect(sheet.sheet_id)}
              style={{
                padding: '8px 12px', fontSize: '12px', borderRadius: '6px', cursor: 'pointer',
                background: selectedId === sheet.sheet_id ? '#f5c451' : '#232c44',
                color: selectedId === sheet.sheet_id ? '#000' : '#e8edf7',
                border: `1px solid ${selectedId === sheet.sheet_id ? '#f5c451' : '#2c3654'}`,
                display: 'flex', alignItems: 'center', gap: '6px',
                textAlign: 'left', width: '100%',
                transition: 'all 0.15s ease',
              }}
            >
              <span style={{ flex: 1 }}>{sheet.title}</span>
              <span
                onClick={(e) => {
                  e.stopPropagation();
                  if (confirm(`确定删除子表「${sheet.title}」？此操作不可撤销！`)) {
                    deleteSheet.mutate({ sheetId: sheet.sheet_id });
                    if (selectedId === sheet.sheet_id) onSelect('');
                  }
                }}
                style={{
                  color: '#f87171', fontSize: '14px', fontWeight: 700, cursor: 'pointer',
                  padding: '0 4px',
                }}
              >
                ×
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
