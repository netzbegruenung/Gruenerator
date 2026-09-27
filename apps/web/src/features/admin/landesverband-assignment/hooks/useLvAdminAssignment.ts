import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState, useEffect } from 'react';

import {
  fetchLandesverbaende,
  fetchLandesverbandAdmins,
  assignLandesverbandAdmin,
  revokeLandesverbandAdmin,
  searchAdminUsers,
} from '../../../../hooks/useLvAdminAssignmentTyped';

export interface LandesverbandSummary {
  id: string;
  name: string;
  country: 'DE' | 'AT';
  emailDomains: string[];
  adminCount: number;
}

export interface LandesverbandAdminEntry {
  userId: string;
  email: string | null;
  displayName: string | null;
  assignedBy: string | null;
  assignedAt: string;
}

export interface AdminUserSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  isAdmin: boolean;
  joinedAt: string | null;
}

export function useLandesverbaende() {
  return useQuery<LandesverbandSummary[]>({
    queryKey: ['lv-admin-landesverbaende'],
    queryFn: fetchLandesverbaende,
    staleTime: 30_000,
  });
}

export function useLandesverbandAdmins(landesverbandId: string | null) {
  return useQuery<LandesverbandAdminEntry[]>({
    queryKey: ['lv-admin-admins', landesverbandId],
    queryFn: () => fetchLandesverbandAdmins(landesverbandId!),
    enabled: Boolean(landesverbandId),
    staleTime: 10_000,
  });
}

export function useAssignLandesverbandAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ landesverbandId, email }: { landesverbandId: string; email: string }) =>
      assignLandesverbandAdmin(landesverbandId, email),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['lv-admin-admins', variables.landesverbandId] });
      void qc.invalidateQueries({ queryKey: ['lv-admin-landesverbaende'] });
    },
  });
}

export function useRevokeLandesverbandAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ landesverbandId, userId }: { landesverbandId: string; userId: string }) =>
      revokeLandesverbandAdmin(landesverbandId, userId),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['lv-admin-admins', variables.landesverbandId] });
      void qc.invalidateQueries({ queryKey: ['lv-admin-landesverbaende'] });
    },
  });
}

/** Debounced (300ms) user search, min 2 chars, for the assignment picker. */
export function useAdminUserSearch(query: string) {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(query), 300);
    return () => clearTimeout(id);
  }, [query]);

  return useQuery<AdminUserSummary[]>({
    queryKey: ['lv-admin-user-search', debounced],
    queryFn: () => searchAdminUsers(debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 10_000,
  });
}
