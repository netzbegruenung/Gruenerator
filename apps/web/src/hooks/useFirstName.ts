import { useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useProfileData } from '../stores/profileStore';

export function useFirstName(): string | null {
  const profile = useProfileData();
  const user = useAuthStore((s) => s.user);

  return useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (user?.display_name) return user.display_name.split(' ')[0];
    if (user?.name) return user.name.split(' ')[0];
    return null;
  }, [profile?.first_name, user?.display_name, user?.name]);
}
