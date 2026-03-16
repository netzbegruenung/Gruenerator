import { createLogger } from '../../utils/logger.js';
import { getProfileService } from '../user/ProfileService.js';

import type { UserProfile } from '../user/types.js';

const log = createLogger('notification-preferences');

/**
 * Check whether an email notification should be sent for a given user + category.
 * Opt-out model: returns `true` when the preference is missing or undefined.
 * Fail-open: returns `true` on any error so emails are never silently suppressed.
 *
 * Pass a pre-loaded profile to avoid an extra DB query when the caller already has it.
 */
export async function shouldSendNotification(
  userId: string,
  category: string,
  preloadedProfile?: UserProfile | null
): Promise<boolean> {
  try {
    const profileService = getProfileService();
    const profile =
      preloadedProfile !== undefined
        ? preloadedProfile
        : await profileService.getProfileById(userId);

    if (!profile) return true;

    const value = profileService.getUserDefault(profile, 'notifications', category, true);
    return !!value;
  } catch (error) {
    log.warn('[NotificationPreferences] Error checking preference, defaulting to send', {
      userId,
      category,
      error,
    });
    return true;
  }
}
