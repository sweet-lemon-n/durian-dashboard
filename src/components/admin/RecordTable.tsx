import { useState, useCallback } from 'react';
import { useRecords, useDeleteRecord } from '@/hooks/useSmartsheet';
import { useSheets } from '@/hooks/useSmartsheet';

interface Field {
  field_id: string;
  field_title: string;
  field_type: string;
}

interface RecordValue {
  type?: string;
  text?: string;
}

interface RecordItem {
  record_id: string;
  values: Record<string, unknown>;
}

interface Props {
  sheetId: string;
}

function renderCellValue(value: unknown): string {
  if (value === null || value === undefined) return '-';
  if (typeof value === 'number') {
    // Check if it's a millisecond timestamp (too large for a typical number value)
    if (value > 4102444800000) {
      try {
        return new Date(value).toLocaleString('zh-CN');
      } catch {
        return String(value);
      }
    }
    return String(value);
  }
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) {
    return value
      .map((item: RecordValue) => item.text ?? item.type ?? JSON.stringify(item))
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value);
    } catch {
      return '[Object]';
    }
  }
  return String(value);
}

export function RecordTable({ sheetId }: Props) {
  const { data: recordsData, isLoading } = useRecords(sheetId);
  const { data: sheetsData } = useSheets();
  const deleteRecord = useDeleteRecord();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rawRecords = recordsData as { data?: { records?: RecordItem[] } } | undefined;
  const records = rawRecords?.data?.records ?? [];

  const rawSheets = sheetsData as { data?: { sheets?: Array<{ sheet_id: string; fields?: Field[]; title?: string }> } } | undefined;
  const sheets = rawSheets?.data?.sheets ?? [];
  const currentSheet = sheets.find((s: { sheet_id: string }) => s.sheet_id === sheetId);
  const fields = currentSheet?.fields ?? [];

  // Limit displayed fields to first 8 for readability
  const displayFields = fields.slice(0, 8);

  const isTempSheet = currentSheet?.title ? /温度|temp/i.test(currentSheet.title) : false;

  const toggleSelect = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSelectAll = useCallback(() => {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.map((r: RecordItem) => r.record_id)));
    }
  }, [records, selected]);

  if (!sheetId) {
    return (
      <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
        请先选择一个子表
      </div>
    );
  }

  if (isLoading) {
    return (
      <div style={{ color: '#9aa8c4', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
        加载记录...
      </div>
    );
  }

  if (records.length === 0) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <h3 style={{ fontSize: '14px', color: '#9aa8c4' }}>
            记录列表 <span style={{ color: '#6b7896' }}>(0)</span>
          </h3>
          {!isTempSheet && (
            <span style={{ color: '#f5c451', fontSize: '11px' }}>
              ⚠ 非温度子表，仅可查看/删除
            </span>
          )}
        </div>
        <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px', textAlign: 'center' }}>
          暂无记录
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px', flexWrap: 'wrap' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4', marginRight: 'auto' }}>
          记录列表 <span style={{ color: '#6b7896' }}>({records.length})</span>
        </h3>
        {!isTempSheet && (
          <span style={{ color: '#f5c451', fontSize: '11px' }}>
            ⚠ 非温度子表，仅可查看/删除
          </span>
        )}
        {selected.size > 0 && (
          <button
            onClick={() => {
              if (confirm(`确定删除选中的 ${selected.size} 条记录吗？此操作不可撤销！`)) {
                deleteRecord.mutate(
                  { sheetId, recordIds: Array.from(selected) },
                  { onSuccess: () => setSelected(new Set()) },
                );
              }
            }}
            style={{
              padding: '4px 10px', fontSize: '11px', background: '#f87171', color: '#fff',
              border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
            }}
          >
            删除选中 ({selected.size})
          </button>
        )}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
          <thead>
            <tr>
              <th style={{ width: '32px', padding: '6px 6px', borderBottom: '1px solid #2c3654' }}>
                <input
                  type="checkbox"
                  checked={records.length > 0 && selected.size === records.length}
                  onChange={toggleSelectAll}
                  style={{ cursor: 'pointer' }}
                />
              </th>
              {displayFields.map((f: Field) => (
                <th
                  key={f.field_id}
                  style={{
                    padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654',
                    color: '#6b7896', whiteSpace: 'nowrap',
                  }}
                >
                  {f.field_title}
                </th>
              ))}
              <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
                操作
              </th>
            </tr>
          </thead>
          <tbody>
            {records.map((record: RecordItem) => (
              <tr
                key={record.record_id}
                style={{
                  borderBottom: '1px solid #2c3654',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.background = '#1a2236';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.background = 'transparent';
                }}
              >
                <td style={{ padding: '6px 6px' }}>
                  <input
                    type="checkbox"
                    checked={selected.has(record.record_id)}
                    onChange={() => toggleSelect(record.record_id)}
                    style={{ cursor: 'pointer' }}
                  />
                </td>
                {displayFields.map((f: Field) => (
                  <td
                    key={f.field_id}
                    style={{
                      padding: '6px 10px', color: '#e8edf7',
                      maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                    title={renderCellValue(record.values[f.field_id])}
                  >
                    {renderCellValue(record.values[f.field_id])}
                  </td>
                ))}
                <td style={{ padding: '6px 10px' }}>
                  <button
                    onClick={() => {
                      if (confirm('确定删除此记录？')) {
                        deleteRecord.mutate({ sheetId, recordIds: [record.record_id] });
                      }
                    }}
                    style={{
                      padding: '3px 8px', fontSize: '11px', background: 'transparent',
                      color: '#f87171', border: '1px solid #f87171', borderRadius: '4px',
                      cursor: 'pointer',
                    }}
                  >
                    删除
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
