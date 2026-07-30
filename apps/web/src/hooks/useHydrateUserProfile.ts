import {
  setMentionLandesverbaende,
  setSkillFavoritesPersister,
  useSkillFavoritesStore,
} from '@gruenerator/chat';
import { useUserProfileStore } from '@gruenerator/chat/stores';
import { landesverbandIdsForRoles, lvSkillMentionsForRoles } from '@gruenerator/shared/agents';
import { useEffect } from 'react';

import apiClient from '../components/utils/apiClient';
import { useUserDefaultsQuery } from '../features/user-defaults/userDefaultsQueries';
import { useAuthStore } from '../stores/authStore';

/**
 * Where the chat package's favourites store writes to. Registered at module
 * scope so a toggle that happens before the first render still lands, and kept
 * outside React because the store is not a hook.
 *
 * Deliberately a bare PATCH rather than the `useSetUserDefault` mutation: the
 * caller is a Zustand action, not a component, and the store already holds the
 * authoritative list — there is no cache to optimistically update beyond it.
 */
setSkillFavoritesPersister((favorites) => {
  void apiClient
    .patch('/auth/profile/user-defaults', {
      generator: 'profile',
      key: 'skillFavorites',
      value: favorites,
    })
    .catch(() => {
      // Best-effort: the localStorage mirror keeps this device correct, and the
      // next successful write reconciles. Failing loudly here would interrupt a
      // star click for something the user cannot act on.
    });
});

/**
 * Bridge: pushes user-defaults RQ data into the chat package's stores.
 * Mount once at App level (inside QueryClientProvider). Idempotent — RQ dedupes
 * the underlying query, the store hydrate is a simple set().
 */
export function useHydrateUserProfile() {
  const locale = useAuthStore((s) => s.locale);
  const { data, isSuccess } = useUserDefaultsQuery();

  useEffect(() => {
    if (!isSuccess) return;
    const roles = data?.profile?.roles ?? [];
    const userLocale = locale || 'de-DE';
    useUserProfileStore.getState().hydrate({
      roles,
      locale: userLocale,
      isHydrated: true,
    });

    // `null` = never written. That first hydration is the one moment we seed, so
    // people who set a Landesverband role before this existed get its recipes
    // pre-starred exactly once. Afterwards the stored list is authoritative and
    // a star the user removed stays removed instead of returning every load.
    // The store also folds in this device's localStorage entries, so stars set
    // before the list moved server-side survive.
    useSkillFavoritesStore
      .getState()
      .hydrate(data?.profile?.skillFavorites ?? null, lvSkillMentionsForRoles(roles, userLocale));

    // Scopes the composer's notebook picker to the user's own Landesverband.
    // Set here rather than in ChatPage because the "+" menu also renders on the
    // Workplace and in the docs/boards surfaces, which never mount ChatPage.
    setMentionLandesverbaende(landesverbandIdsForRoles(roles, userLocale));
  }, [data, isSuccess, locale]);
}
