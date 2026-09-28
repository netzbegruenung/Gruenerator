/**
 * Wer bei einem Beitrag oder Kommentar welche Benachrichtigung bekommt:
 * @alle ersetzt die Grundmeldung, @Name bekommt eine eigene und fällt aus der
 * Grundmeldung heraus, und in der System-Gruppe darf @alle nur ein Instanz-Admin.
 */
import { buildMemberMention } from '@gruenerator/shared/utils';
import { describe, expect, it, vi } from 'vitest';

import {
  notifyGroupActivity,
  type GroupActivity,
  type GroupActivityNotifiers,
} from './groupActivityNotifications.js';

const ANNA = '11111111-1111-4111-8111-111111111111';
const BEN = '22222222-2222-4222-8222-222222222222';
const AUTHOR = '33333333-3333-4333-8333-333333333333';

function notifiers() {
  const members = vi.fn(async () => {});
  const users = vi.fn(async () => {});
  return {
    members,
    users,
    n: { members, users } as unknown as GroupActivityNotifiers,
  };
}

const activity = (over: Partial<GroupActivity> = {}): GroupActivity => ({
  groupId: 'g1',
  authorId: AUTHOR,
  authorName: 'Jana',
  body: 'Hallo',
  isSystem: false,
  mayMentionAll: true,
  actionUrl: '/projekte/g1?beitrag=s1',
  metadata: { shareId: 's1' },
  base: { type: 'group_post_created', title: 'Neuer Beitrag', recipients: 'members' },
  ...over,
});

describe('notifyGroupActivity', () => {
  it('sends only the base notification without mentions', async () => {
    const { n, members, users } = notifiers();
    await notifyGroupActivity(activity(), n);
    expect(users).not.toHaveBeenCalled();
    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'group_post_created',
        excludeUserId: AUTHOR,
        skipUserIds: [],
        body: 'Jana: Hallo',
      })
    );
  });

  it('replaces the base notification with @alle', async () => {
    const { n, members, users } = notifiers();
    await notifyGroupActivity(activity({ body: `@alle ${buildMemberMention('Anna', ANNA)}` }), n);
    expect(users).not.toHaveBeenCalled();
    expect(members).toHaveBeenCalledTimes(1);
    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'group_mention_all',
        excludeUserId: AUTHOR,
        body: 'Jana: @alle @Anna',
      })
    );
  });

  it('notifies mentioned people and leaves them out of the base notification', async () => {
    const { n, members, users } = notifiers();
    await notifyGroupActivity(
      activity({
        body: `${buildMemberMention('Anna', ANNA)} ${buildMemberMention('Ich', AUTHOR)}`,
      }),
      n
    );
    expect(users).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'group_user_mentioned', userIds: [ANNA] })
    );
    expect(members).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'group_post_created', skipUserIds: [ANNA] })
    );
  });

  it('removes mentioned people from a recipient list base', async () => {
    const { n, users } = notifiers();
    await notifyGroupActivity(
      activity({
        body: buildMemberMention('Anna', ANNA),
        base: { type: 'group_comment_added', title: 'Neuer Kommentar', recipients: [ANNA, BEN] },
      }),
      n
    );
    expect(users).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'group_comment_added', userIds: [BEN] })
    );
  });

  it('treats @alle as plain text when the author may not use it', async () => {
    const { n, members } = notifiers();
    await notifyGroupActivity(activity({ body: '@alle', isSystem: true, mayMentionAll: false }), n);
    expect(members).toHaveBeenCalledTimes(1);
    expect(members).toHaveBeenCalledWith(expect.objectContaining({ type: 'group_post_created' }));
  });

  it('limits person mentions in the system group to the thread', async () => {
    const { n, users } = notifiers();
    await notifyGroupActivity(
      activity({
        isSystem: true,
        mayMentionAll: false,
        body: `${buildMemberMention('Anna', ANNA)} ${buildMemberMention('Ben', BEN)}`,
        base: { type: 'group_comment_added', title: 'Neue Antwort', recipients: [BEN] },
      }),
      n
    );
    expect(users).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'group_user_mentioned', userIds: [BEN] })
    );
  });

  it('on edit only notifies mentions that are new', async () => {
    const { n, members, users } = notifiers();
    await notifyGroupActivity(
      activity({
        base: null,
        previousBody: `@alle ${buildMemberMention('Anna', ANNA)}`,
        body: `@alle ${buildMemberMention('Anna', ANNA)} ${buildMemberMention('Ben', BEN)}`,
      }),
      n
    );
    expect(members).not.toHaveBeenCalled();
    expect(users).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'group_user_mentioned', userIds: [BEN] })
    );
  });

  it('shortens long bodies', async () => {
    const { n, members } = notifiers();
    await notifyGroupActivity(activity({ body: 'x'.repeat(300) }), n);
    const call = members.mock.calls[0] as unknown as [{ body: string }];
    expect(call[0].body).toBe(`Jana: ${'x'.repeat(140)}…`);
  });
});
