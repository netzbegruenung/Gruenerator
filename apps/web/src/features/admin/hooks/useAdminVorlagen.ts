import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

import {
  fetchAdminVorlagen,
  fetchVorlagenStats,
  approveVorlage,
  rejectVorlage,
} from '../../../hooks/useAdminVorlagenTyped';

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

export function useAdminVorlagen(status = 'pending_review', enabled = true) {
  return useQuery<AdminVorlage[]>({
    queryKey: ['admin-vorlagen', status],
    queryFn: () => fetchAdminVorlagen(status) as Promise<AdminVorlage[]>,
    staleTime: 30_000,
    enabled,
  });
}

export function useVorlagenStats(enabled = true) {
  return useQuery<VorlagenStats>({
    queryKey: ['admin-vorlagen-stats'],
    queryFn: () => fetchVorlagenStats() as Promise<VorlagenStats>,
    staleTime: 30_000,
    enabled,
  });
}

export function useApproveVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, message }: { id: string; message?: string }) => approveVorlage(id, message),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-vorlagen'] });
      void qc.invalidateQueries({ queryKey: ['admin-vorlagen-stats'] });
    },
  });
}

export function useRejectVorlage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, reason }: { id: string; reason?: string }) => rejectVorlage(id, reason),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin-vorlagen'] });
      void qc.invalidateQueries({ queryKey: ['admin-vorlagen-stats'] });
    },
  });
}
