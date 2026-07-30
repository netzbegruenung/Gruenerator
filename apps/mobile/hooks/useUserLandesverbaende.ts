import { landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { useAuth } from '@gruenerator/shared/hooks';
import { useQuery } from '@tanstack/react-query';

import { fetchRoles } from '../services/roles';

const KEY = ['profile-roles'] as const;

/**
 * The Landesverbände the signed-in user belongs to, from their profile roles.
 *
 * Mirrors web's `features/agentura/hooks/useUserLandesverbaende`, but reads the
 * roles itself: mobile has no app-wide profile hydration, so the query is the
 * cache. Editing roles stays on web — this is read-only.
 */
export function useUserLandesverbaende(): { lvIds: readonly string[]; isHydrated: boolean } {
  const { locale } = useAuth();
  const { data: roles, isSuccess } = useQuery({
    queryKey: KEY,
    queryFn: fetchRoles,
    staleTime: 5 * 60 * 1000,
  });

  return {
    lvIds: landesverbandIdsForRoles(roles ?? [], locale),
    isHydrated: isSuccess,
  };
}
