import { useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useProfileData } from '../stores/profileStore';

export function useFirstName(): string | null {
  const profile = useProfileData();
  const firstName = useAuthStore((s) => s.user?.first_name);
  const displayName = useAuthStore((s) => s.user?.display_name);

  return useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (firstName) return firstName;
    if (displayName) return displayName.split(' ')[0] ?? null;
    return null;
  }, [profile?.first_name, firstName, displayName]);
}
