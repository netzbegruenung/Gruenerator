import { useMemo } from 'react';

import { useAuthStore } from '../stores/authStore';
import { useProfileData } from '../stores/profileStore';

export function useFirstName(): string | null {
  const profile = useProfileData();
  const firstName = useAuthStore((s) => s.user?.first_name);
  const displayName = useAuthStore((s) => s.user?.display_name);

  // The profile's display_name is the most reliable source: on desktop the
  // bearer session populates authStore.user from the token-exchange payload,
  // whose `display_name`/`first_name` are null (the name lives under `name`),
  // so without this fallback the greeting degrades to "du" even though the
  // profile (/auth/profile) carries the full name.
  const profileDisplayName = profile?.display_name;

  return useMemo(() => {
    if (profile?.first_name) return profile.first_name;
    if (firstName) return firstName;
    if (displayName) return displayName.split(' ')[0] ?? null;
    if (profileDisplayName) return profileDisplayName.split(' ')[0] ?? null;
    return null;
  }, [profile?.first_name, firstName, displayName, profileDisplayName]);
}
