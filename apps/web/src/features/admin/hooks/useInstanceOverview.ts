import { type InstanceAdminAppBundle, type InstanceAdminUserSummary } from '@gruenerator/contracts';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchInstanceAdminAppBundles,
  fetchInstanceAdminUsers,
  fetchInstanceAdminRoles,
  setInstanceAdminUserAdmin,
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
export function useInstanceAdminUsers(q = '', enabled = true) {
  return useQuery<InstanceAdminUser[]>({
    queryKey: ['bgst-admin-users', q],
    queryFn: () => fetchInstanceAdminUsers(q),
    staleTime: 30_000,
    placeholderData: keepPreviousData,
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

/** Grant or revoke instance-admin rights for one account. */
export function useSetUserAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, isAdmin }: { userId: string; isAdmin: boolean }) =>
      setInstanceAdminUserAdmin(userId, isAdmin),
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

export function useInstanceAdminAppBundles(enabled = true) {
  return useQuery<InstanceAdminAppBundle[]>({
    queryKey: ['bgst-admin-app-bundles'],
    queryFn: fetchInstanceAdminAppBundles,
    staleTime: 60_000,
    enabled,
  });
}
