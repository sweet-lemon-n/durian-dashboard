import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useLogistics() {
  return useQuery({
    queryKey: ['logistics'],
    queryFn: () => api('/api/logistics'),
  });
}

export function useUpdateLogistics() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: { id: string } & Record<string, unknown>) =>
      api(`/api/logistics/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['logistics'] }),
  });
}
