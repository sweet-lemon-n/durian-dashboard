import { useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useAddView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; viewTitle: string; viewType: string }) =>
      api('/api/smartsheet/views/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useDeleteView() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; viewId: string }) =>
      api('/api/smartsheet/views/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useAddGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; groupName: string }) =>
      api('/api/smartsheet/groups/add', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useDeleteGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { sheetId: string; groupId: string }) =>
      api('/api/smartsheet/groups/delete', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useUpdateGroup() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: { groupId: string; groupName: string }) =>
      api('/api/smartsheet/groups/rename', { method: 'POST', body: JSON.stringify(data) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useSetupDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api<{ success: boolean; data: { docid: string } }>('/api/setup', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useRefreshSchema() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api('/api/schema/refresh', { method: 'POST' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}

export function useRenameDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) =>
      api('/api/doc/rename', { method: 'POST', body: JSON.stringify({ name }) }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['smartsheet'] }),
  });
}
