import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TempRecord {
  record_id?: string;
  柜号?: string;
  品牌?: string;
  放柜时间?: string;
  设定温度?: number;
  送风温度?: number;
  回风温度?: number;
  风口设定?: string;
  当前位置?: string;
  味道?: string;
  关口?: string;
  更新时间?: string;
}

export interface DashboardResponse {
  success: boolean;
  data: {
    records: TempRecord[];
    stats?: unknown;
    alerts?: unknown;
    containers?: string[];
    detention?: unknown;
  };
}

export function useDashboard(hours = 168, limit = 500) {
  return useQuery<DashboardResponse>({
    queryKey: ['dashboard', hours, limit],
    queryFn: () =>
      api<DashboardResponse>(
        `/api/dashboard?hours=${hours}&limit=${limit}`,
        { cache: 'no-store' },
      ),
    refetchInterval: 30_000,
    staleTime: 25_000,
  });
}
