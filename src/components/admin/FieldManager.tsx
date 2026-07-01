import { useState } from 'react';
import { useSheets, useAddField, useDeleteField } from '@/hooks/useSmartsheet';

interface Field {
  field_id: string;
  field_title: string;
  field_type: string;
  property_number?: { decimal_places?: number };
  property_single_select?: { is_multiple?: boolean; is_quick_add?: boolean; options?: unknown[] };
  property_date_time?: { format?: string };
}

interface Props {
  sheetId: string;
}

const TYPE_LABELS: Record<string, string> = {
  FIELD_TYPE_TEXT: '文本',
  FIELD_TYPE_NUMBER: '数字',
  FIELD_TYPE_DATE_TIME: '日期时间',
  FIELD_TYPE_SINGLE_SELECT: '单选',
  FIELD_TYPE_CHECKBOX: '勾选',
  FIELD_TYPE_REFERENCE: '引用/关联',
  FIELD_TYPE_USER: '人员',
  FIELD_TYPE_PHONE: '电话',
  FIELD_TYPE_URL: '链接',
  FIELD_TYPE_LINK: '链接',
  FIELD_TYPE_FILE: '附件',
};

function formatFieldType(type: string): string {
  if (!type) return '未知';
  const upper = type.toUpperCase();
  if (upper.includes('TEXT')) return '文本';
  if (upper.includes('NUMBER')) return '数字';
  if (upper.includes('DATE')) return '日期时间';
  if (upper.includes('SINGLE_SELECT')) return '单选';
  if (upper.includes('MULTI_SELECT')) return '多选';
  if (upper.includes('REFERENCE')) return '引用/关联';
  if (upper.includes('USER')) return '人员';
  if (upper.includes('CHECKBOX')) return '勾选';
  if (upper.includes('PHONE')) return '电话';
  if (upper.includes('LINK')) return '链接';
  if (upper.includes('URL')) return '链接';
  return type.replace(/^FIELD_TYPE_/, '');
}

function formatFieldProperty(field: Field): string {
  if (field.property_number) {
    return `NUMBER(decimals:${field.property_number.decimal_places ?? '-'})`;
  }
  if (field.property_date_time) {
    return `DATE_TIME(${field.property_date_time.format ?? '-'})`;
  }
  if (field.property_single_select) {
    return `SELECT(options:${field.property_single_select.options?.length ?? 0})`;
  }
  return '-';
}

function AddFieldForm({
  onSubmit,
  onCancel,
}: {
  onSubmit: (title: string, type: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState('FIELD_TYPE_TEXT');

  return (
    <div
      style={{
        display: 'flex', gap: '10px', padding: '12px', background: '#1a2236',
        borderRadius: '8px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'flex-end',
      }}
    >
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: '#6b7896', marginBottom: '4px' }}>
          字段名称
        </label>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          style={{
            background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
            padding: '6px 10px', borderRadius: '6px', fontSize: '13px', width: '160px',
          }}
          placeholder="例如：柜号"
        />
      </div>
      <div>
        <label style={{ display: 'block', fontSize: '11px', color: '#6b7896', marginBottom: '4px' }}>
          字段类型
        </label>
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          style={{
            background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
            padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
          }}
        >
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
      </div>
      <button
        onClick={() => { if (title.trim()) onSubmit(title.trim(), type); }}
        style={{
          padding: '6px 14px', background: '#22c55e', color: '#fff', border: 'none',
          borderRadius: '6px', cursor: 'pointer', fontSize: '13px', fontWeight: 600,
        }}
      >
        确认
      </button>
      <button
        onClick={onCancel}
        style={{
          padding: '6px 14px', background: 'transparent', color: '#9aa8c4',
          border: '1px solid #2c3654', borderRadius: '6px', cursor: 'pointer', fontSize: '13px',
        }}
      >
        取消
      </button>
    </div>
  );
}

export function FieldManager({ sheetId }: Props) {
  const { data } = useSheets();
  const addField = useAddField();
  const deleteField = useDeleteField();
  const [adding, setAdding] = useState(false);

  const rawData = data as { data?: { sheets?: Array<{ sheet_id: string; fields?: Field[] }> } } | undefined;
  const sheets = rawData?.data?.sheets ?? [];
  const currentSheet = sheets.find((s: { sheet_id: string }) => s.sheet_id === sheetId);
  const fields: Field[] = currentSheet?.fields ?? [];

  if (!sheetId) {
    return (
      <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
        请先选择一个子表
      </div>
    );
  }

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
        <h3 style={{ fontSize: '14px', color: '#9aa8c4', marginRight: 'auto' }}>
          字段列表 <span style={{ color: '#6b7896' }}>({fields.length})</span>
        </h3>
        <button
          onClick={() => setAdding(!adding)}
          style={{
            padding: '4px 10px', fontSize: '12px', background: '#22c55e', color: '#fff',
            border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 600,
          }}
        >
          {adding ? '取消' : '+ 新增字段'}
        </button>
      </div>

      {adding && (
        <AddFieldForm
          onSubmit={(title, type) => {
            const fieldDef: Record<string, unknown> = {
              field_title: title,
              field_type: type,
            };
            if (type === 'FIELD_TYPE_NUMBER') {
              fieldDef.property_number = { decimal_places: 1 };
            }
            if (type === 'FIELD_TYPE_SINGLE_SELECT') {
              fieldDef.property_single_select = { is_multiple: false, is_quick_add: true, options: [] };
            }
            addField.mutate({ sheetId, fields: [fieldDef] }, {
              onError: (err) => alert('新增字段失败：' + (err instanceof Error ? err.message : '未知错误')),
            });
            setAdding(false);
          }}
          onCancel={() => setAdding(false)}
        />
      )}

      {fields.length === 0 ? (
        <div style={{ color: '#6b7896', fontSize: '13px', padding: '20px 0', textAlign: 'center' }}>
          暂无字段
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
            <thead>
              <tr>
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
                  字段标题
                </th>
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
                  类型
                </th>
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
                  属性
                </th>
                <th style={{ padding: '6px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896' }}>
                  操作
                </th>
              </tr>
            </thead>
            <tbody>
              {fields.map((f: Field) => (
                <tr key={f.field_id} style={{ borderBottom: '1px solid #2c3654' }}>
                  <td style={{ padding: '6px 10px', color: '#e8edf7' }}>{f.field_title}</td>
                  <td style={{ padding: '6px 10px', color: '#9aa8c4' }}>
                    {formatFieldType(f.field_type)}
                  </td>
                  <td style={{ padding: '6px 10px', color: '#6b7896', fontSize: '11px', fontFamily: 'monospace' }}>
                    {formatFieldProperty(f)}
                  </td>
                  <td style={{ padding: '6px 10px' }}>
                    <button
                      onClick={() => {
                        if (confirm(`确定删除字段「${f.field_title}」？`)) {
                          deleteField.mutate({ sheetId, fieldIds: [f.field_id] }, {
                            onError: (err) => alert('删除字段失败：' + (err instanceof Error ? err.message : '未知错误')),
                          });
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
      )}
    </div>
  );
}
