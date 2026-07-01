import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export interface AutoNewsResponse {
  success: boolean;
  data: {
    items: unknown[];
    fetchedAt: string;
  };
}

export function useAutoNews() {
  return useQuery<AutoNewsResponse>({
    queryKey: ['autoNews'],
    queryFn: () => api<AutoNewsResponse>('/api/news/auto'),
    refetchInterval: 5 * 60_000,
    staleTime: 4 * 60_000,
  });
}

export function useRefreshNews() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api('/api/news/auto/refresh', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['autoNews'] }),
  });
}
