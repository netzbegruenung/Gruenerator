import { useUserProfileStore } from '@gruenerator/chat';
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
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const { data, isSuccess, isPending, isError, fetchStatus } = useUserDefaultsQuery();

  console.log(
    '[hydrate-bridge] render | auth=' +
      isAuthenticated +
      ' | pending=' +
      isPending +
      ' | success=' +
      isSuccess +
      ' | error=' +
      isError +
      ' | fetchStatus=' +
      fetchStatus +
      ' | rolesCount=' +
      (data?.profile?.roles?.length ?? 'n/a')
  );

  useEffect(() => {
    if (!isSuccess) return;
    const roles = data?.profile?.roles ?? [];
    console.log(
      '[hydrate-bridge] push to userProfileStore | rolesCount=' +
        roles.length +
        ' | locale=' +
        (locale || 'de-DE')
    );
    useUserProfileStore.getState().hydrate({
      roles,
      locale: locale || 'de-DE',
      isHydrated: true,
    });
  }, [data, isSuccess, locale]);
}
