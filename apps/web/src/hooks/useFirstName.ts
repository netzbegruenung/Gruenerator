import { useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useProfileData } from '../stores/profileStore';

export function useFirstName(): string | null {
  const profile = useProfileData();
  const displayName = useAuthStore((s) => s.user?.display_name);
  const name = useAuthStore((s) => s.user?.name);

  return useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (displayName) return displayName.split(' ')[0];
    if (name) return name.split(' ')[0];
    return null;
  }, [profile?.first_name, displayName, name]);
}
