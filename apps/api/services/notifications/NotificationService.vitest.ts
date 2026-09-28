/**
 * Bulk-Zustellung: dieselben Kanalregeln wie `createNotification`, aber ein
 * Lesezugriff und ein Insert pro Aufruf (#3813).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface Recipient {
  id: string;
  email: string | null;
  display_name: string | null;
  stored: unknown;
  muted: boolean;
}

let recipients: Recipient[] = [];
const inserted: Array<Array<Record<string, unknown>>> = [];

const db = {
  select: vi.fn(() => ({
    from: () => ({ leftJoin: () => ({ where: async () => recipients }) }),
  })),
  insert: vi.fn(() => ({
    values: (rows: Array<Record<string, unknown>>) => ({
      returning: async () => {
        inserted.push(rows);
        return rows.map((r, i) => ({
          ...r,
          id: `n${i}`,
          is_read: false,
          read_at: null,
          created_at: new Date(0),
        }));
      },
    }),
  })),
};

const publishNotification = vi.fn(async () => {});
const sendNotificationEmail = vi.fn(async () => {});

vi.mock('../../database/services/DrizzleService.js', () => ({ getDrizzleInstance: () => db }));
vi.mock('./notificationPubSub.js', () => ({ publishNotification }));
vi.mock('../../services/email/index.js', () => ({
  sendNotificationEmail,
  sendBoardNotificationEmail: vi.fn(async () => {}),
  sendDocumentNotificationEmail: vi.fn(async () => {}),
}));
vi.mock('../user/ProfileService.js', () => ({ getProfileService: vi.fn() }));
const warn = vi.fn();
vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ warn, info: vi.fn(), debug: vi.fn(), error: vi.fn() }),
}));

const { createNotificationsForUsers } = await import('./NotificationService.js');

function user(id: string, extra: Partial<Recipient> = {}): Recipient {
  return {
    id,
    email: `${id}@example.org`,
    display_name: id,
    stored: null,
    muted: false,
    ...extra,
  };
}

const base = {
  type: 'group_post_created' as const,
  title: 'Neuer Beitrag',
  body: 'b',
  actionUrl: '/projekte/g1',
  metadata: { groupId: 'g1' },
  groupKey: 'group:g1',
};

const insertedUsers = () => inserted.flat().map((r) => r.user_id);
const emailed = () =>
  (sendNotificationEmail.mock.calls as unknown as [{ recipientEmail: string }][]).map(
    ([a]) => a.recipientEmail
  );

beforeEach(() => {
  vi.clearAllMocks();
  inserted.length = 0;
  recipients = [];
});

describe('createNotificationsForUsers', () => {
  it('reads once and inserts once for the whole list', async () => {
    recipients = [user('a'), user('b'), user('c')];
    const rows = await createNotificationsForUsers(['a', 'b', 'c', 'a'], base);
    expect(db.select).toHaveBeenCalledTimes(1);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(rows).toHaveLength(3);
    expect(publishNotification).toHaveBeenCalledTimes(3);
  });

  it('keeps per-type overrides: a user who switched the type off gets nothing', async () => {
    recipients = [user('a'), user('off', { stored: { in_app: false, email: false } })];
    await createNotificationsForUsers(['a', 'off'], base);
    expect(insertedUsers()).toEqual(['a']);
  });

  it('respects the level default: tier 3 stays off at "Mittel"', async () => {
    recipients = [user('a')];
    await createNotificationsForUsers(['a'], { ...base, type: 'group_member_joined' });
    expect(db.insert).not.toHaveBeenCalled();
  });

  it('emails by preference, but never a muted member', async () => {
    recipients = [user('a'), user('m', { muted: true })];
    await createNotificationsForUsers(['a', 'm'], base);
    expect(insertedUsers()).toEqual(['a', 'm']);
    expect(emailed()).toEqual(['a@example.org']);
  });

  it('keeps the system group in-app only via the channel override', async () => {
    recipients = [user('a'), user('b')];
    await createNotificationsForUsers(['a', 'b'], { ...base, channelOverride: { email: false } });
    expect(insertedUsers()).toEqual(['a', 'b']);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('keeps email switched off where the user chose in-app only', async () => {
    recipients = [user('a', { stored: { email: false } })];
    await createNotificationsForUsers(['a'], base);
    expect(insertedUsers()).toEqual(['a']);
    expect(sendNotificationEmail).not.toHaveBeenCalled();
  });

  it('names recipients skipped for lack of a profile', async () => {
    recipients = [user('a')];
    await createNotificationsForUsers(['a', 'gone'], base);
    expect(insertedUsers()).toEqual(['a']);
    expect(warn).toHaveBeenCalledWith(
      'Skipped notification recipients without profile',
      expect.objectContaining({ userIds: ['gone'] })
    );
  });

  it('does nothing for an empty list', async () => {
    expect(await createNotificationsForUsers([], base)).toEqual([]);
    expect(db.select).not.toHaveBeenCalled();
  });
});
