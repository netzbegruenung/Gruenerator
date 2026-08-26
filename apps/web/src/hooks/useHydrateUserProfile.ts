import { useUserProfileStore } from '@gruenerator/chat/stores';
import { useEffect } from 'react';

import { useUserDefaultsQuery } from '../features/user-defaults/userDefaultsQueries';
import { useAuthStore } from '../stores/authStore';

/**
 * Bridge: pushes user-defaults RQ data into the chat package's userProfileStore.
 * Mount once at App level (inside QueryClientProvider). Idempotent — RQ dedupes
 * the underlying query, the store hydrate is a simple set().
 */
export function useHydrateUserProfile() {
  const locale = useAuthStore((s) => s.locale);
  const { data, isSuccess } = useUserDefaultsQuery();

  useEffect(() => {
    if (!isSuccess) return;
    const profile = data?.profile ?? {};
    useUserProfileStore.getState().hydrate({
      roles: profile.roles ?? [],
      // Über `hydrate`, nicht `setActiveRole`: das hier ist der Lesepfad, ein
      // Zurückschreiben wäre eine überflüssige PATCH-Anfrage bei jedem Start.
      activeRole: profile.activeRole ?? null,
      // Das Vorhandensein des Schlüssels IST die Antwort auf „hat je gewählt?".
      // `activeRole: null` (bewusst ohne Rolle) und ein fehlender Schlüssel
      // (nie gewählt) lesen sich sonst gleich, und die Vorauswahl bei genau
      // einer Rolle wäre nicht abwählbar.
      hasChosenRole: 'activeRole' in profile,
      locale: locale || 'de-DE',
      isHydrated: true,
    });
  }, [data, isSuccess, locale]);
}
