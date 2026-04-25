import { useUserProfileStore, type UserRole } from '@gruenerator/chat';
import { useEffect } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useUserDefaultsStore } from '../stores/userDefaultsStore';

export function useHydrateUserProfile() {
  const locale = useAuthStore((s) => s.locale);
  const getDefault = useUserDefaultsStore((s) => s.getDefault);
  const hydrate = useUserDefaultsStore((s) => s.hydrate);
  const isHydrated = useUserDefaultsStore((s) => s.isHydrated);

  useEffect(() => {
    if (!isHydrated) {
      void hydrate();
    }
  }, [isHydrated, hydrate]);

  useEffect(() => {
    if (!isHydrated) return;
    const roles = getDefault<UserRole[]>('profile', 'roles') || [];
    useUserProfileStore.getState().hydrate({ roles, locale: locale || 'de-DE' });
  }, [getDefault, isHydrated, locale]);
}
