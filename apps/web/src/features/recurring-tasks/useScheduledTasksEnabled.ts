import { useProfile } from '../auth/hooks/useProfileData';

import { useAuthStore } from '@/stores/authStore';

/**
 * „Geplante Aufgaben" is experimental and off by default
 * (profiles.scheduled_tasks_enabled). It hides the places that create or list
 * tasks; /wiederkehrend itself stays reachable by URL and existing tasks keep
 * running, so people can still stop what they set up.
 */
export function useScheduledTasksEnabled(): boolean {
  const userId = useAuthStore((s) => s.user?.id);
  const { data } = useProfile(userId);
  return data?.scheduled_tasks_enabled === true;
}
