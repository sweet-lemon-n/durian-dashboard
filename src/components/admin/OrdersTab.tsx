import { useState } from 'react';
import { useOrders, useCreateOrder, useDeleteOrder } from '@/hooks/useOrders';

function FilterSelect({ label, value, onChange, options, labels }: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  labels: Record<string, string>;
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', color: '#9aa8c4' }}>
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} style={{
        background: '#232c44', border: '1px solid #2c3654', color: '#e8edf7',
        padding: '6px 10px', borderRadius: '6px', fontSize: '13px',
      }}>
        {options.map((opt) => (
          <option key={opt} value={opt}>{labels[opt]}</option>
        ))}
      </select>
    </div>
  );
}

export function OrdersTab() {
  const { data: orders, isLoading } = useOrders();
  const createOrder = useCreateOrder();
  const deleteOrder = useDeleteOrder();

  const [filter, setFilter] = useState({ country: '', category: '', brand: '' });

  if (isLoading) return <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>加载订单数据...</div>;

  const filtered = (orders ?? []).filter((o: Record<string, unknown>) => {
    if (filter.country && o.country !== filter.country) return false;
    if (filter.category && o.category !== filter.category) return false;
    if (filter.brand && o.brand !== filter.brand) return false;
    return true;
  });

  return (
    <div className="panel">
      <div className="toolbar" style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
        <h2 style={{ fontSize: '16px', marginRight: 'auto' }}>📦 订单管理</h2>
        <FilterSelect label="国家" value={filter.country} onChange={(v) => setFilter({ ...filter, country: v })}
          options={['', 'TH', 'VN']} labels={{ '': '全部', TH: '泰国', VN: '越南' }} />
        <FilterSelect label="品类" value={filter.category} onChange={(v) => setFilter({ ...filter, category: v })}
          options={['', 'FRESH', 'FROZEN']} labels={{ '': '全部', FRESH: '鲜果', FROZEN: '冻果' }} />
        <button className="btn primary" onClick={() => {
          const brand = prompt('品牌名称：');
          if (!brand || !brand.trim()) return;
          createOrder.mutate({ brand: brand.trim(), country: filter.country || 'TH', category: filter.category || 'FRESH', boxes: 0, sort: (orders?.length ?? 0) + 1 }, {
            onError: (err) => alert('新增失败：' + (err instanceof Error ? err.message : '未知错误')),
          });
        }} style={{ padding: '7px 14px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '6px', cursor: 'pointer' }}>
          + 新增订单
        </button>
      </div>

      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr>
            {['品牌', '国家', '品类', '箱量', '签收', '交付', '操作'].map((h) => (
              <th key={h} style={{ padding: '9px 10px', textAlign: 'left', borderBottom: '1px solid #2c3654', color: '#6b7896', fontSize: '12px' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filtered.map((order: Record<string, unknown>) => (
            <tr key={order.id as string} style={{ borderBottom: '1px solid #2c3654' }}>
              <td style={{ padding: '9px 10px', color: '#f5c451', fontWeight: 700 }}>{order.brand as string}</td>
              <td style={{ padding: '9px 10px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                  background: order.country === 'TH' ? 'rgba(234,179,8,.18)' : 'rgba(239,68,68,.18)',
                  color: order.country === 'TH' ? '#fde68a' : '#fca5a5',
                }}>
                  {order.country === 'TH' ? '泰国' : '越南'}
                </span>
              </td>
              <td style={{ padding: '9px 10px' }}>
                <span style={{
                  display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 700,
                  background: order.category === 'FRESH' ? 'rgba(239,68,68,.18)' : 'rgba(56,189,248,.18)',
                  color: order.category === 'FRESH' ? '#fca5a5' : '#7dd3fc',
                }}>
                  {order.category === 'FRESH' ? '鲜果' : '冻果'}
                </span>
              </td>
              <td style={{ padding: '9px 10px' }}>{order.boxes as number}</td>
              <td style={{ padding: '9px 10px' }}>{order.signed as number ?? 0}</td>
              <td style={{ padding: '9px 10px' }}>{order.delivered as number ?? 0}</td>
              <td style={{ padding: '9px 10px' }}>
                <button onClick={() => {
                  if (confirm(`确定删除「${order.brand}」？`)) deleteOrder.mutate(order.id as string, {
                    onError: (err) => alert('删除失败：' + (err instanceof Error ? err.message : '未知错误')),
                  });
                }} style={{
                  padding: '4px 10px', fontSize: '12px', background: 'transparent', color: '#f87171',
                  border: '1px solid rgba(248,113,113,.4)', borderRadius: '6px', cursor: 'pointer',
                }}>
                  删除
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {filtered.length === 0 && <div className="empty" style={{ padding: '40px', textAlign: 'center', color: '#6b7896' }}>暂无订单数据</div>}
    </div>
  );
}
