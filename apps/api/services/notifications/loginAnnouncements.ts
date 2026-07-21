/**
 * One-off product announcements delivered on login.
 *
 * Fired from the Better Auth `session.create.after` hook (config/betterAuth.ts),
 * so every user receives each active announcement exactly once — the next time
 * they log in. Delivery is:
 *   - idempotent per user (recorded in `login_announcement_deliveries`, which
 *     survives the user dismissing the notification — the notification row
 *     itself is hard-deleted on dismiss and must not be the delivery marker),
 *   - bounded by `until` (the per-login check retires itself after the window),
 *   - best-effort (never throws into the auth flow).
 *
 * To retire an announcement, delete its entry here (or let `until` pass).
 */
import { loginAnnouncementDeliveries } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

import { createNotification } from './NotificationService.js';

import type { NotificationType } from './types.js';

const log = createLogger('login-announcements');

interface Announcement {
  type: NotificationType;
  title: string;
  body: string;
  metadata?: Record<string, unknown>;
  /** Stop delivering after this instant (ISO). Keeps the check cheap to retire. */
  until: string;
}

const ANNOUNCEMENTS: readonly Announcement[] = [
  {
    type: 'new_avatars',
    title: 'Neue Pride-Avatare 🌈',
    body: 'Es gibt drei neue Pride-Avatare für dein Profil. Tippe auf „Avatar aktivieren" oder wähle deinen Favoriten in deinem Profil.',
    metadata: { avatarIds: [11, 12, 13] },
    until: '2026-09-30T23:59:59Z',
  },
];

export async function deliverLoginAnnouncements(userId: string): Promise<void> {
  const now = new Date();
  const active = ANNOUNCEMENTS.filter((a) => new Date(a.until) > now);
  if (active.length === 0) return;

  try {
    const db = getDrizzleInstance();
    for (const announcement of active) {
      // Atomic claim: the insert only returns a row for the first session that
      // records the delivery, so concurrent logins can't double-deliver.
      const claimed = await db
        .insert(loginAnnouncementDeliveries)
        .values({ user_id: userId, announcement_type: announcement.type })
        .onConflictDoNothing()
        .returning({ user_id: loginAnnouncementDeliveries.user_id });
      if (claimed.length === 0) continue;

      await createNotification({
        userId,
        type: announcement.type,
        title: announcement.title,
        body: announcement.body,
        ...(announcement.metadata ? { metadata: announcement.metadata } : {}),
      });
      log.info(`Delivered announcement '${announcement.type}' to user ${userId}`);
    }
  } catch (err) {
    log.warn('Failed to deliver login announcements', {
      userId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
