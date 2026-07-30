import { useUserProfileStore } from '@gruenerator/chat/stores';
import { landesverbandIdsForRoles } from '@gruenerator/shared/agents';
import { useMemo } from 'react';

import { useAuthStore } from '@/stores/authStore';

/**
 * The Landesverbände the signed-in user belongs to, from their profile roles.
 *
 * Roles are already hydrated app-wide by `useHydrateUserProfile`, so this is a
 * pure read — no extra request. `isHydrated` matters to callers that hide
 * things: before hydration the role list is empty, and treating that as "no
 * Landesverband" would flash the LV cards away and back on every load.
 */
export function useUserLandesverbaende(): { lvIds: readonly string[]; isHydrated: boolean } {
  const roles = useUserProfileStore((s) => s.roles);
  const isHydrated = useUserProfileStore((s) => s.isHydrated);
  const locale = useAuthStore((s) => s.locale) ?? 'de-DE';

  const lvIds = useMemo(() => landesverbandIdsForRoles(roles, locale), [roles, locale]);

  return { lvIds, isHydrated };
}
