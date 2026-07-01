import { DashboardShell } from '@/components/layout/DashboardShell';

export default function FlowPage() {
  return (
    <DashboardShell title="流程看板" subtitle="FLOW DASHBOARD">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: 'var(--txt2)', fontSize: '2vh',
      }}>
        🚧 流程看板 — 迁移中...
      </div>
    </DashboardShell>
  );
}
