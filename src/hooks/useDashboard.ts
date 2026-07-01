import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface TempRecord {
  recordId?: string;
  containerNo?: string;
  brand?: string;
  placementTime?: string;
  setTemp?: number;
  setTempDisplay?: string;
  supplyTemp?: number;
  supplyTempDisplay?: string;
  returnTemp?: number;
  returnTempDisplay?: string;
  tempDiff?: number;
  vent?: string;
  location?: string;
  aroma?: string;
  port?: string;
  updateTime?: string;
  isAbnormal?: boolean;
  creator?: string;
  updater?: string;
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
