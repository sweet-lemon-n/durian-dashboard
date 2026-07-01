import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useConfigInfo() {
  return useQuery({
    queryKey: ['configInfo'],
    queryFn: () => api<{ success: boolean; data: unknown }>('/api/config/info'),
    staleTime: 4 * 60_000,
  });
}
