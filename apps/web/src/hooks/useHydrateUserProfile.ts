import { useUserProfileStore, type UserRole } from '@gruenerator/chat';
import { useEffect } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useUserDefaultsStore } from '../stores/userDefaultsStore';

export function useHydrateUserProfile() {
  const locale = useAuthStore((s) => s.locale);
  const getDefault = useUserDefaultsStore((s) => s.getDefault);

  useEffect(() => {
    const roles = getDefault<UserRole[]>('profile', 'roles') || [];
    useUserProfileStore.getState().hydrate({ roles, locale: locale || 'de-DE' });
  }, [getDefault, locale]);
}
