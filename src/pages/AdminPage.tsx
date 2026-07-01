import { AdminShell } from '@/components/layout/AdminShell';
import { OrdersTab } from '@/components/admin/OrdersTab';
import { LogisticsTab } from '@/components/admin/LogisticsTab';
import { NewsTab } from '@/components/admin/NewsTab';
import { SmartSheetTab } from '@/components/admin/SmartSheetTab';

export default function AdminPage() {
  return (
    <AdminShell>
      {(activeTab) => {
        switch (activeTab) {
          case 'orders': return <OrdersTab />;
          case 'logistics': return <LogisticsTab />;
          case 'news': return <NewsTab />;
          case 'smartsheet': return <SmartSheetTab />;
          default: return <OrdersTab />;
        }
      }}
    </AdminShell>
  );
}
