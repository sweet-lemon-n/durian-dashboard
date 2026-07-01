import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useRecords(sheetId: string, limit = 500) {
  return useQuery({
    queryKey: ['smartsheet', 'records', sheetId],
    queryFn: () =>
      api(`/api/smartsheet/records?sheetId=${sheetId}&limit=${limit}`),
    enabled: !!sheetId,
  });
}

export function useAddRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fields: Record<string, unknown> }) =>
      api('/api/smartsheet/records/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useUpdateRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; recordId: string; fields: Record<string, unknown> }) =>
      api('/api/smartsheet/records/update', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useDeleteRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; recordIds: string[] }) =>
      api('/api/smartsheet/records/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: ['smartsheet', 'records', vars.sheetId] }),
  });
}

export function useSheets() {
  return useQuery({
    queryKey: ['smartsheet', 'sheets'],
    queryFn: () => api('/api/config/info'),
  });
}

export function useAddSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { title: string }) =>
      api('/api/smartsheet/sheet/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}

export function useDeleteSheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string }) =>
      api('/api/smartsheet/sheet/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}

export function useAddField() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; fields: unknown[] }) =>
      api('/api/smartsheet/fields/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet', 'sheets'] }),
  });
}
