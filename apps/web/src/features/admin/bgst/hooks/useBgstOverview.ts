import { useQuery } from '@tanstack/react-query';

import { fetchBgstUsers, fetchBgstRoles } from '../../../../hooks/useBgstOverviewTyped';

export interface BgstUser {
  id: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  lastLogin: string | null;
  createdAt: string | null;
}

export interface BgstUserRole {
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: Record<string, unknown>[] | null;
}

export function useBgstUsers(enabled = true) {
  return useQuery<BgstUser[]>({
    queryKey: ['bgst-admin-users'],
    queryFn: fetchBgstUsers,
    staleTime: 30_000,
    enabled,
  });
}

export function useBgstRoleAssignments(enabled = true) {
  return useQuery<BgstUserRole[]>({
    queryKey: ['bgst-admin-roles'],
    queryFn: fetchBgstRoles,
    staleTime: 30_000,
    enabled,
  });
}
