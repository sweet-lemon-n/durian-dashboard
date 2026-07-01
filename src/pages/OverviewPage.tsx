import { DashboardShell } from '@/components/layout/DashboardShell';

export default function OverviewPage() {
  return (
    <DashboardShell title="总览看板" subtitle="OVERVIEW DASHBOARD">
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        height: '60vh', color: 'var(--txt2)', fontSize: '2vh',
      }}>
        🚧 总览看板 — 迁移中...
      </div>
    </DashboardShell>
  );
}
