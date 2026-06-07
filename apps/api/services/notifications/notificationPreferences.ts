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
 * Importance tier per notification type (single source of truth).
 *   1 = Kritisch & persönlich (an auch bei "Wenig")
 *   2 = Wichtig             (an ab "Mittel" = Standard)
 *   3 = Optional/Info       (nur bei "Viele")
 * The 3-level user setting (Wenig/Mittel/Viele) is just a threshold over these
 * tiers; channels are uniform — an active type fires on all channels, an
 * inactive type on none.
 */
const TYPE_IMPORTANCE: Record<NotificationType, 1 | 2 | 3> = {
  document_shared: 1,
  document_permission_changed: 2,
  document_access_revoked: 1,
  board_updates: 2,
  board_comment_added: 3,
  board_comment_reply: 1,
  board_user_mentioned: 1,
  group_member_joined: 3,
  group_member_left: 3,
  group_role_changed: 3,
  group_content_shared: 3,
  group_deleted: 1,
  group_join_requested: 3,
  group_join_approved: 1,
  group_join_denied: 1,
  transfer_downloaded: 3,
  notebook_liked: 3,
  wolke_new_files: 2,
  // Tier 1: the user explicitly delegated work and is waiting on the result —
  // always deliver (incl. email) regardless of notification level.
  agent_task_completed: 1,
  agent_task_failed: 1,
};

export type NotificationLevel = 'low' | 'medium' | 'high';

const LEVEL_THRESHOLD: Record<NotificationLevel, 1 | 2 | 3> = {
  low: 1,
  medium: 2,
  high: 3,
};

const ALL_ON: ChannelPreferences = { email: true, push: true, in_app: true };
const ALL_OFF: ChannelPreferences = { email: false, push: false, in_app: false };

/**
 * Build the full per-type preference map for a level. A type is fully on when
 * its importance tier is at or below the level's threshold, otherwise fully off.
 */
export function getPresetPreferences(
  level: NotificationLevel
): Record<NotificationType, ChannelPreferences> {
  const threshold = LEVEL_THRESHOLD[level];
  const result = {} as Record<NotificationType, ChannelPreferences>;
  for (const type of ALL_NOTIFICATION_TYPES) {
    result[type] = TYPE_IMPORTANCE[type] <= threshold ? { ...ALL_ON } : { ...ALL_OFF };
  }
  return result;
}

/**
 * Platform defaults = the "Mittel" preset. Making medium the default means a
 * fresh user (no stored prefs) naturally resolves to level "medium", and
 * existing users without an explicit override stop receiving tier-3 noise
 * (e.g. every group join) immediately.
 */
const DEFAULT_CHANNEL_PREFERENCES: Record<NotificationType, ChannelPreferences> =
  getPresetPreferences('medium');

/**
 * Derive which level a resolved preference map corresponds to, or 'custom' when
 * it matches none of the three presets (i.e. the user fine-tuned channels).
 */
export function deriveLevel(
  resolved: Record<NotificationType, ChannelPreferences>
): NotificationLevel | 'custom' {
  const channelsEqual = (a: ChannelPreferences, b: ChannelPreferences): boolean =>
    a.email === b.email && a.push === b.push && a.in_app === b.in_app;

  for (const level of ['low', 'medium', 'high'] as const) {
    const preset = getPresetPreferences(level);
    if (ALL_NOTIFICATION_TYPES.every((type) => channelsEqual(resolved[type], preset[type]))) {
      return level;
    }
  }
  return 'custom';
}

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
 * Apply a level preset to a user: overwrites the entire `notifications`
 * generator with the preset's per-type channel map in a single write.
 * Returns the freshly resolved preferences.
 */
export async function applyLevelForUser(
  userId: string,
  level: NotificationLevel
): Promise<Record<NotificationType, ChannelPreferences>> {
  const profileService = getProfileService();
  await profileService.setUserDefaultsGenerator(
    userId,
    'notifications',
    getPresetPreferences(level)
  );
  return getPreferencesForUser(userId);
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
