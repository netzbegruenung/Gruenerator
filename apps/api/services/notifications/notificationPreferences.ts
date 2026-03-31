import { createLogger } from '../../utils/logger.js';
import { getProfileService } from '../user/ProfileService.js';

import { ALL_NOTIFICATION_TYPES } from './types.js';

import type { NotificationType, NotificationChannel, ChannelPreferences } from './types.js';
import type { UserProfile } from '../user/types.js';

const log = createLogger('notification-preferences');

export async function getProfileForDelivery(userId: string): Promise<UserProfile | null> {
  try {
    return await getProfileService().getProfileById(userId);
  } catch {
    return null;
  }
}

/**
 * Platform defaults per notification type.
 * Encodes which channels are enabled by default for each type.
 * Types that previously had `emailPreference: false` in the frontend config
 * now have `email: false` here — single source of truth.
 */
const DEFAULT_CHANNEL_PREFERENCES: Record<NotificationType, ChannelPreferences> = {
  document_shared: { email: true, push: true, in_app: true },
  document_permission_changed: { email: false, push: true, in_app: true },
  document_access_revoked: { email: false, push: true, in_app: true },
  board_updates: { email: true, push: true, in_app: true },
  board_comment_added: { email: false, push: true, in_app: true },
  board_comment_reply: { email: false, push: true, in_app: true },
  board_user_mentioned: { email: true, push: true, in_app: true },
  group_activity: { email: true, push: true, in_app: true },
  group_member_joined: { email: true, push: true, in_app: true },
  group_role_changed: { email: false, push: true, in_app: true },
  group_content_shared: { email: true, push: true, in_app: true },
  group_deleted: { email: false, push: true, in_app: true },
  wolke_setup: { email: false, push: false, in_app: true },
  transfer_downloaded: { email: false, push: true, in_app: true },
};

/**
 * Resolve a stored preference value into per-channel preferences.
 * Handles backward compatibility:
 *   - boolean → treated as email-only toggle (push + in_app default to platform defaults)
 *   - object  → merged with platform defaults (missing channels get defaults)
 *   - missing → platform defaults
 */
function resolveChannelPreferences(
  stored: unknown,
  category: NotificationType
): ChannelPreferences {
  const defaults = DEFAULT_CHANNEL_PREFERENCES[category] ?? {
    email: true,
    push: true,
    in_app: true,
  };

  if (stored === null || stored === undefined) {
    return { ...defaults };
  }

  if (typeof stored === 'boolean') {
    return { email: stored, push: defaults.push, in_app: defaults.in_app };
  }

  if (typeof stored === 'object' && !Array.isArray(stored)) {
    const obj = stored as Record<string, unknown>;
    return {
      email: typeof obj.email === 'boolean' ? obj.email : defaults.email,
      push: typeof obj.push === 'boolean' ? obj.push : defaults.push,
      in_app: typeof obj.in_app === 'boolean' ? obj.in_app : defaults.in_app,
    };
  }

  return { ...defaults };
}

/**
 * Check whether a notification should be delivered on a specific channel.
 * Opt-out model: returns `true` when the preference is missing or undefined.
 * Fail-open: returns `true` on any error so notifications are never silently suppressed.
 */
export async function shouldDeliver(
  userId: string,
  category: NotificationType,
  channel: NotificationChannel,
  preloadedProfile?: UserProfile | null
): Promise<boolean> {
  try {
    const profileService = getProfileService();
    const profile =
      preloadedProfile !== undefined
        ? preloadedProfile
        : await profileService.getProfileById(userId);

    if (!profile) return true;

    const stored = profile.user_defaults?.notifications?.[category];
    const resolved = resolveChannelPreferences(stored, category);
    return resolved[channel];
  } catch (error) {
    log.warn('[NotificationPreferences] Error checking preference, defaulting to deliver', {
      userId,
      category,
      channel,
      error,
    });
    return true;
  }
}

/**
 * Get resolved preferences for all notification types for a user.
 * Returns a full map with defaults filled in for any missing categories.
 */
export async function getPreferencesForUser(
  userId: string
): Promise<Record<NotificationType, ChannelPreferences>> {
  const profileService = getProfileService();
  const profile = await profileService.getProfileById(userId);
  const storedNotifications = profile?.user_defaults?.notifications ?? {};

  const result = {} as Record<NotificationType, ChannelPreferences>;
  for (const type of ALL_NOTIFICATION_TYPES) {
    result[type] = resolveChannelPreferences(storedNotifications[type], type);
  }

  return result;
}

/**
 * Get the platform default preferences (no user overrides).
 */
export function getDefaultPreferences(): Record<NotificationType, ChannelPreferences> {
  const result = {} as Record<NotificationType, ChannelPreferences>;
  for (const type of ALL_NOTIFICATION_TYPES) {
    result[type] = { ...DEFAULT_CHANNEL_PREFERENCES[type] };
  }
  return result;
}

/**
 * Backward-compatible wrapper: checks email channel only.
 * Used by existing callers that imported `shouldSendNotification` from the email module.
 */
export async function shouldSendNotification(
  userId: string,
  category: string,
  preloadedProfile?: UserProfile | null
): Promise<boolean> {
  return shouldDeliver(userId, category as NotificationType, 'email', preloadedProfile);
}
