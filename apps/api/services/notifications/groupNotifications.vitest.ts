/**
 * Zustellung an Gruppenmitglieder: die System-Gruppe bleibt ohne E-Mail, und
 * Erwähnungen stehen einzeln statt im Gruppen-Bündel.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNotification = vi.fn(async () => null);
const db = { query: vi.fn(), queryOne: vi.fn() };

vi.mock('./NotificationService.js', () => ({ createNotification }));
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => db,
}));

const { notifyGroupMembers, notifyGroupUsers } = await import('./groupNotifications.js');

const params = {
  groupId: 'g1',
  excludeUserId: 'author',
  title: 't',
  body: 'b',
  actionUrl: '/projekte/g1',
};

function group(isSystem: boolean, members: string[]) {
  db.query.mockResolvedValue(members.map((user_id) => ({ user_id })));
  db.queryOne.mockResolvedValue({ name: 'Grünerator', is_system: isSystem });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe('group notification delivery', () => {
  it.each(['group_post_created', 'group_mention_all', 'group_user_mentioned'] as const)(
    'never emails %s in the system group',
    async (type) => {
      group(true, ['a', 'b']);
      await notifyGroupMembers({ ...params, type });
      expect(createNotification).toHaveBeenCalledTimes(2);
      for (const [call] of createNotification.mock.calls as unknown as [
        { channelOverride: unknown },
      ][]) {
        expect(call.channelOverride).toEqual({ email: false });
      }
    }
  );

  it('keeps email to the user preference in normal groups', async () => {
    group(false, ['a']);
    await notifyGroupMembers({ ...params, type: 'group_mention_all' });
    expect(createNotification).toHaveBeenCalledWith(
      expect.objectContaining({ channelOverride: undefined })
    );
  });

  it('bundles news under the group but keeps mentions apart', async () => {
    group(false, ['a']);
    await notifyGroupMembers({ ...params, type: 'group_post_created' });
    await notifyGroupMembers({ ...params, type: 'group_mention_all' });
    const [news, mention] = createNotification.mock.calls as unknown as [Record<string, unknown>][];
    expect(news?.[0]).toMatchObject({ groupKey: 'group:g1' });
    expect(mention?.[0]).not.toHaveProperty('groupKey');
    expect(mention?.[0]).toMatchObject({ metadata: expect.objectContaining({ groupId: 'g1' }) });
  });

  it('passes skipped users to the member query', async () => {
    group(false, []);
    await notifyGroupMembers({ ...params, type: 'group_post_created', skipUserIds: ['x'] });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['g1', 'author', ['x']]);
  });

  it('leaves skipped users out of a user list', async () => {
    group(false, ['a']);
    await notifyGroupUsers({
      ...params,
      type: 'group_comment_added',
      userIds: ['a', 'x', 'author'],
      skipUserIds: ['x'],
    });
    expect(db.query.mock.calls[0]?.[1]).toEqual(['g1', ['a']]);
  });
});
