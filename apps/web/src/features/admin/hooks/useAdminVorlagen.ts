import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import apiClient from '../../../components/utils/apiClient';

export interface AdminVorlage {
  id: string;
  title: string;
  description: string;
  template_type: string;
  thumbnail_url: string | null;
  external_url: string | null;
  images: unknown[];
  categories: string[];
  tags: string[];
  content_data: Record<string, unknown>;
  metadata: Record<string, unknown>;
  is_private: boolean;
  status: string;
  creator_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface VorlagenStats {
  pending: number;
  published: number;
  rejected: number;
}

export function useAdminVorlagen(status = 'pending_review') {
  return useQuery<AdminVorlage[]>({
    queryKey: ['admin-vorlagen', status],
    queryFn: async () => {
      const res = await apiClient.get(`/admin/vorlagen?status=${status}`);
      return (res.data as { data: AdminVorlage[] }).data;
    },
    staleTime: 30_000,
  });
}

export function useVorlagenStats() {
  return useQuery<VorlagenStats>({
    queryKey: ['admin-vorlagen-stats'],
    queryFn: async () => {
      const res = await apiClient.get('/admin/vorlagen/stats');
      return (res.data as { data: VorlagenStats }).data;
    },
    staleTime: 30_000,
  });
}

export function useApproveVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiClient.post(`/admin/vorlagen/${id}/approve`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-vorlagen'] });
      qc.invalidateQueries({ queryKey: ['admin-vorlagen-stats'] });
    },
  });
}

export function useRejectVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) =>
      apiClient.post(`/admin/vorlagen/${id}/reject`, { reason }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-vorlagen'] });
      qc.invalidateQueries({ queryKey: ['admin-vorlagen-stats'] });
    },
  });
}
