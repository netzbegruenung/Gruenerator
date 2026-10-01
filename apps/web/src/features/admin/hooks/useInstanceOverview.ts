import { type InstanceAdminUserSummary } from '@gruenerator/contracts';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchInstanceAdminUsers,
  fetchInstanceAdminRoles,
  setInstanceAdminUserPanda,
} from '../../../hooks/useInstanceAdminOverviewTyped';

export type InstanceAdminUser = InstanceAdminUserSummary;

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

/** Unlock or lock the „Panda" lane for one account. */
export function useSetUserPanda() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, enabled }: { userId: string; enabled: boolean }) =>
      setInstanceAdminUserPanda(userId, enabled),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['bgst-admin-users'] });
    },
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
