import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  fetchMyLandesverbandScopes,
  fetchLandesverbandDetail,
  updateLandesverbandGreeting,
  fetchLandesverbandSkills,
  setLandesverbandSkillHidden,
  fetchLandesverbandUsers,
} from '../../../hooks/useLandesverbandAdminTyped';
import { useAuthStore } from '../../../stores/authStore';

export interface LandesverbandScope {
  id: string;
  name: string;
  country: 'DE' | 'AT';
}

export interface LandesverbandDetail {
  id: string;
  name: string;
  country: 'DE' | 'AT';
  greetingText: string | null;
  memberCount: number;
}

export interface LandesverbandSkillEntry {
  mention: string;
  title: string;
  skillCategory: string | null;
  hiddenGlobally: boolean;
  hiddenForLv: boolean;
}

export interface LandesverbandUserSummary {
  id: string;
  displayName: string | null;
  email: string | null;
  joinedAt: string | null;
  emailVerified: boolean;
}

/**
 * Single source of truth for "which LV(s) does the current user
 * administer" — shared by `RequireAdmin`'s `lvAdmin` gate and
 * `LandesverbandSwitcher`. Only fetched for authenticated users; a global
 * instance-admin gets every Landesverband back (see the router's `mine`
 * handler), not just ones they were explicitly assigned to.
 */
export function useMyLandesverbandAdminScopes() {
  const isAuthenticated = useAuthStore((s) => Boolean(s.user));
  return useQuery<LandesverbandScope[]>({
    queryKey: ['my-landesverband-scopes'],
    queryFn: fetchMyLandesverbandScopes,
    enabled: isAuthenticated,
    staleTime: 60_000,
  });
}

export function useLandesverbandDetail(landesverbandId: string | null) {
  return useQuery<LandesverbandDetail>({
    queryKey: ['landesverband-detail', landesverbandId],
    queryFn: () => fetchLandesverbandDetail(landesverbandId!),
    enabled: Boolean(landesverbandId),
    staleTime: 10_000,
  });
}

export function useUpdateLandesverbandGreeting() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      landesverbandId,
      greetingText,
    }: {
      landesverbandId: string;
      greetingText: string | null;
    }) => updateLandesverbandGreeting(landesverbandId, greetingText),
    onSuccess: (_data, variables) => {
      void qc.invalidateQueries({ queryKey: ['landesverband-detail', variables.landesverbandId] });
    },
  });
}

export function useLandesverbandSkills(landesverbandId: string | null) {
  return useQuery<LandesverbandSkillEntry[]>({
    queryKey: ['landesverband-skills', landesverbandId],
    queryFn: () => fetchLandesverbandSkills(landesverbandId!),
    enabled: Boolean(landesverbandId),
    staleTime: 10_000,
  });
}

export function useSetLandesverbandSkillHidden(landesverbandId: string | null) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ mention, hidden }: { mention: string; hidden: boolean }) =>
      setLandesverbandSkillHidden(landesverbandId!, mention, hidden),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['landesverband-skills', landesverbandId] });
    },
  });
}

export function useLandesverbandUsers(landesverbandId: string | null) {
  return useQuery<LandesverbandUserSummary[]>({
    queryKey: ['landesverband-users', landesverbandId],
    queryFn: () => fetchLandesverbandUsers(landesverbandId!),
    enabled: Boolean(landesverbandId),
    staleTime: 10_000,
  });
}
