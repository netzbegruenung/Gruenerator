/**
 * Team-Chat: andere Teilnehmende bekommen eine gebündelte Benachrichtigung je Thread.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const createNotificationsForUsers = vi.fn(async () => []);
const db = { query: vi.fn(), queryOne: vi.fn() };

vi.mock('./NotificationService.js', () => ({ createNotificationsForUsers }));
vi.mock('../../database/services/PostgresService/PostgresService.js', () => ({
  getPostgresInstance: () => db,
}));

const { notifyTeamChatParticipants, notifyTeamChatTurn } =
  await import('./groupChatNotifications.js');

const params = {
  threadId: 't1',
  senderId: 'sender',
  senderName: 'Anna',
  threadTitle: 'Plakate',
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe('notifyTeamChatParticipants', () => {
  it('notifies the participants the query returns, collapsed per thread', async () => {
    db.query.mockResolvedValue([
      { user_id: 'owner', group_id: 'g1', slug_suffix: 'abc123' },
      { user_id: 'writer', group_id: 'g1', slug_suffix: 'abc123' },
    ]);
    await notifyTeamChatParticipants(params);
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ['owner', 'writer'],
      expect.objectContaining({
        type: 'group_chat_message',
        title: 'Anna im Chat „Plakate“',
        groupKey: 'group-chat:t1',
        actionUrl: '/chat/plakate-abc123',
        metadata: expect.objectContaining({ groupId: 'g1', threadId: 't1' }),
      })
    );
  });

  it('asks only for non-sender active members of a team chat (SQL contract)', async () => {
    db.query.mockResolvedValue([]);
    await notifyTeamChatParticipants(params);
    const [sql, args] = db.query.mock.calls[0]!;
    expect(sql).toContain('group_content_shares');
    expect(sql).toContain('gm.is_active = TRUE');
    expect(sql).toContain('deleted_at IS NULL');
    expect(args).toEqual(['t1', 'sender']);
  });

  it('does nothing for a private thread (no rows)', async () => {
    db.query.mockResolvedValue([]);
    await notifyTeamChatParticipants(params);
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('falls back to the bare id without a slug suffix', async () => {
    db.query.mockResolvedValue([{ user_id: 'owner', group_id: 'g1', slug_suffix: null }]);
    await notifyTeamChatParticipants(params);
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ['owner'],
      expect.objectContaining({ actionUrl: '/chat/t1' })
    );
  });

  it('never throws', async () => {
    db.query.mockRejectedValue(new Error('down'));
    await expect(notifyTeamChatParticipants(params)).resolves.toBeUndefined();
  });
});

describe('notifyTeamChatTurn', () => {
  it('resolves sender name and title, falling back to Jemand', async () => {
    db.queryOne.mockResolvedValueOnce({ title: null, group_id: 'g1' });
    db.queryOne.mockResolvedValueOnce({ display_name: null });
    db.query.mockResolvedValue([{ user_id: 'owner', group_id: 'g1', slug_suffix: 'abc123' }]);
    await notifyTeamChatTurn({ threadId: 't1', senderId: 'sender' });
    expect(createNotificationsForUsers).toHaveBeenCalledWith(
      ['owner'],
      expect.objectContaining({ title: 'Jemand im Chat „Neuer Chat“' })
    );
  });

  it('a private chat (no group_id) costs one lookup and nothing else', async () => {
    db.queryOne.mockResolvedValueOnce({ title: 'Privat', group_id: null });
    await notifyTeamChatTurn({ threadId: 't1', senderId: 'sender' });
    expect(db.queryOne).toHaveBeenCalledTimes(1);
    expect(db.query).not.toHaveBeenCalled();
    expect(createNotificationsForUsers).not.toHaveBeenCalled();
  });

  it('a missing or trashed thread notifies nobody', async () => {
    db.queryOne.mockResolvedValueOnce(null);
    await notifyTeamChatTurn({ threadId: 't1', senderId: 'sender' });
    expect(db.query).not.toHaveBeenCalled();
  });
});
