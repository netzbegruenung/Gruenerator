import { useQuery } from '@tanstack/react-query';

import {
  fetchInstanceAdminUsers,
  fetchInstanceAdminRoles,
} from '../../../hooks/useInstanceAdminOverviewTyped';

export interface InstanceAdminUser {
  id: string;
  email: string | null;
  displayName: string | null;
  isAdmin: boolean;
  lastLogin: string | null;
  createdAt: string | null;
}

export interface InstanceAdminUserRole {
  userId: string;
  email: string | null;
  displayName: string | null;
  roles: Record<string, unknown>[] | null;
}

// Die Query-Keys bleiben `bgst-admin-*`: sie landen im persistierten
// react-query-Cache, ein neuer Name wäre ein zweiter Eintrag statt einer
// Umbenennung. Der Pfad, den sie holen, heißt aus demselben Grund weiter
// `/api/auth/admin/bgst/*`.
export function useInstanceAdminUsers(enabled = true) {
  return useQuery<InstanceAdminUser[]>({
    queryKey: ['bgst-admin-users'],
    queryFn: fetchInstanceAdminUsers,
    staleTime: 30_000,
    enabled,
  });
}

export function useInstanceAdminRoleAssignments(enabled = true) {
  return useQuery<InstanceAdminUserRole[]>({
    queryKey: ['bgst-admin-roles'],
    queryFn: fetchInstanceAdminRoles,
    staleTime: 30_000,
    enabled,
  });
}
