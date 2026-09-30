/**
 * Rechte und Seiteneffekte des Gruppen-Feeds gegen eine Fake-Datenbank:
 * wer anheften, Notizen ändern, kommentieren und löschen darf.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createShareComment,
  deleteShareComment,
  listShareComments,
  updateGroupShare,
  type GroupFeedDeps,
} from './groupFeed.js';

interface Fake {
  role?: 'admin' | 'member' | null;
  groupType?: 'standard' | 'personal';
  createdBy?: string;
  isSystem?: boolean;
  instanceAdmin?: boolean;
  share?: { id: string; shared_by_user_id: string | null } | null;
  comment?: { user_id: string | null } | null;
  /** Kommentar, auf den geantwortet wird; null = gibt es nicht. */
  parent?: { id: string; parent_id: string | null } | null;
  earlierCommenters?: string[];
}

function fakeDeps(f: Fake = {}) {
  const exec = vi.fn(async () => ({ changes: 1 }));
  const queryOne = vi.fn(async (sql: string, params: unknown[]) => {
    if (sql.includes('FROM group_memberships gm')) {
      if (f.role === null) return null;
      return {
        role: f.role ?? 'member',
        group_type: f.groupType ?? 'standard',
        created_by: f.createdBy ?? 'creator',
        is_system: f.isSystem ?? false,
      };
    }
    if (sql.includes('FROM group_content_shares')) {
      return f.share === undefined ? { id: 's1', shared_by_user_id: 'sharer' } : f.share;
    }
    if (sql.startsWith('INSERT INTO group_share_comments')) {
      return {
        id: 'c-new',
        share_id: params[0],
        parent_id: params[4],
        user_id: params[2],
        body: params[3],
        created_at: new Date('2026-09-27T10:00:00Z'),
      };
    }
    if (sql.startsWith('SELECT id, parent_id FROM group_share_comments')) {
      return f.parent === undefined ? { id: 'c1', parent_id: null } : f.parent;
    }
    if (sql.includes('FROM group_share_comments')) {
      return f.comment === undefined ? { user_id: 'author' } : f.comment;
    }
    return null;
  });
  const query = vi.fn(async (sql: string) => {
    if (sql.includes('SELECT DISTINCT user_id')) {
      return (f.earlierCommenters ?? []).map((user_id) => ({ user_id }));
    }
    return [
      {
        id: 'c1',
        share_id: 's1',
        parent_id: null,
        user_id: 'u2',
        body: 'Hallo',
        created_at: new Date('2026-09-26T08:00:00Z'),
        author_name: 'Aileen',
      },
      {
        id: 'c2',
        share_id: 's1',
        parent_id: 'c1',
        user_id: null,
        body: 'Alt',
        created_at: '2026-09-26T09:00:00Z',
        author_name: null,
      },
    ];
  });
  const notify = vi.fn(async () => {});
  const getReactionSummaries = vi.fn(
    async () => new Map([['c1', [{ emoji: '👍', count: 2, reacted: true }]]])
  );
  const deps = {
    postgres: { exec, queryOne, query } as unknown as GroupFeedDeps['postgres'],
    notify,
    isInstanceAdmin: vi.fn(async () => f.instanceAdmin ?? false),
    getReactionSummaries,
  } satisfies GroupFeedDeps;
  return { deps, exec, notify, query, getReactionSummaries };
}

const ids = { groupId: 'g1', shareId: 's1', userId: 'u1' };

describe('updateGroupShare', () => {
  it('lets an admin pin and trims older pins beyond the limit', async () => {
    const { deps, exec } = fakeDeps({ role: 'admin' });
    const out = await updateGroupShare({ ...ids, pinned: true, note: null }, deps);
    expect(out.status).toBe(200);
    const sqls = exec.mock.calls.map((c) => String((c as unknown[])[0]));
    expect(sqls[0]).toContain('SET pinned_at = CURRENT_TIMESTAMP');
    expect(sqls[1]).toContain('OFFSET $2');
    expect((exec.mock.calls[1] as unknown[])[1]).toEqual(['g1', 3]);
  });

  it('treats the group creator as admin', async () => {
    const { deps } = fakeDeps({ role: 'member', createdBy: 'u1' });
    expect((await updateGroupShare({ ...ids, pinned: false, note: null }, deps)).status).toBe(200);
  });

  it('refuses pinning by a plain member', async () => {
    const { deps, exec } = fakeDeps({ role: 'member' });
    const out = await updateGroupShare({ ...ids, pinned: true, note: null }, deps);
    expect(out.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('lets the sharer edit the note and clears it on empty string', async () => {
    const { deps, exec } = fakeDeps({
      role: 'member',
      share: { id: 's1', shared_by_user_id: 'u1' },
    });
    const out = await updateGroupShare({ ...ids, pinned: null, note: '   ' }, deps);
    expect(out.status).toBe(200);
    expect((exec.mock.calls[0] as unknown[])[1]).toEqual([null, 's1']);
  });

  it('refuses a note edit by another member', async () => {
    const { deps } = fakeDeps({ role: 'member' });
    expect((await updateGroupShare({ ...ids, pinned: null, note: 'x' }, deps)).status).toBe(403);
  });

  it('returns 404 for a share of another group', async () => {
    const { deps } = fakeDeps({ role: 'admin', share: null });
    expect((await updateGroupShare({ ...ids, pinned: true, note: null }, deps)).status).toBe(404);
  });

  it('throws the membership message for non-members', async () => {
    const { deps } = fakeDeps({ role: null });
    await expect(updateGroupShare({ ...ids, pinned: true, note: null }, deps)).rejects.toThrow(
      'nicht Mitglied'
    );
  });
});

describe('system group', () => {
  it('ignores group role and creator; only instance admins pin', async () => {
    const asGroupAdmin = fakeDeps({ role: 'admin', createdBy: 'u1', isSystem: true });
    expect(
      (await updateGroupShare({ ...ids, pinned: true, note: null }, asGroupAdmin.deps)).status
    ).toBe(403);
    const asInstanceAdmin = fakeDeps({ role: 'member', isSystem: true, instanceAdmin: true });
    expect(
      (await updateGroupShare({ ...ids, pinned: true, note: null }, asInstanceAdmin.deps)).status
    ).toBe(200);
  });

  it('lets every member comment, but only instance admins reach @alle', async () => {
    const member = fakeDeps({ role: 'member', isSystem: true });
    const out = await createShareComment(
      { ...ids, body: '@alle Danke!', authorName: 'Kim' },
      member.deps
    );
    expect(out.status).toBe(201);
    expect(member.notify).toHaveBeenCalledWith(
      expect.objectContaining({ isSystem: true, mayMentionAll: false })
    );
    const admin = fakeDeps({ role: 'member', isSystem: true, instanceAdmin: true });
    await createShareComment({ ...ids, body: '@alle', authorName: 'Kim' }, admin.deps);
    expect(admin.notify).toHaveBeenCalledWith(expect.objectContaining({ mayMentionAll: true }));
  });
});

describe('comments', () => {
  it('lists comments oldest first with a fallback author name', async () => {
    const { deps } = fakeDeps();
    const out = await listShareComments(ids, deps);
    expect(out.status).toBe(200);
    if (!('data' in out)) throw new Error('expected data');
    expect(out.data.map((c) => c.authorName)).toEqual(['Aileen', 'Ehemaliges Mitglied']);
    expect(out.data[0].createdAt).toBe('2026-09-26T08:00:00.000Z');
    expect(out.data.map((c) => c.parentId)).toEqual([null, 'c1']);
  });

  it('attaches the reactions of each comment from the viewer', async () => {
    const { deps, getReactionSummaries } = fakeDeps();
    const out = await listShareComments(ids, deps);
    if (!('data' in out)) throw new Error('expected data');
    expect(getReactionSummaries).toHaveBeenCalledWith('group_comment', ['c1', 'c2'], 'u1');
    expect(out.data.map((c) => c.reactions)).toEqual([
      [{ emoji: '👍', count: 2, reacted: true }],
      [],
    ]);
  });

  it('creates a comment and notifies sharer + earlier commenters', async () => {
    const { deps, notify } = fakeDeps({ earlierCommenters: ['u2', 'u1'] });
    const out = await createShareComment(
      { ...ids, body: '  Passt so!  ', authorName: 'Moritz' },
      deps
    );
    expect(out.status).toBe(201);
    if (!('data' in out)) throw new Error('expected data');
    expect(out.data).toMatchObject({
      body: 'Passt so!',
      authorName: 'Moritz',
      userId: 'u1',
      reactions: [],
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        authorId: 'u1',
        body: 'Passt so!',
        isSystem: false,
        mayMentionAll: true,
        actionUrl: '/projekte/g1?beitrag=s1',
        base: {
          type: 'group_comment_added',
          title: 'Neuer Kommentar',
          recipients: ['sharer', 'u2', 'u1'],
        },
      })
    );
  });

  it('stores a reply under its comment and notifies only that thread', async () => {
    const { deps, notify, query } = fakeDeps({ earlierCommenters: ['u2'] });
    const out = await createShareComment(
      { ...ids, body: '@Aileen stimmt', authorName: 'Moritz', parentId: 'c1' },
      deps
    );
    expect(out.status).toBe(201);
    if (!('data' in out)) throw new Error('expected data');
    expect(out.data).toMatchObject({ parentId: 'c1', body: '@Aileen stimmt' });
    expect(query).toHaveBeenCalledWith(expect.stringContaining('parent_id = $2'), ['s1', 'c1'], {
      table: 'group_share_comments',
    });
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({
        base: expect.objectContaining({ title: 'Neue Antwort', recipients: ['sharer', 'u2'] }),
      })
    );
  });

  it('files a reply to a reply under the same top-level comment', async () => {
    const { deps } = fakeDeps({ parent: { id: 'c2', parent_id: 'c1' } });
    const out = await createShareComment(
      { ...ids, body: 'ja', authorName: 'M', parentId: 'c2' },
      deps
    );
    if (!('data' in out)) throw new Error('expected data');
    expect(out.data.parentId).toBe('c1');
  });

  it('returns 404 when replying to a comment that is not on this share', async () => {
    const { deps, notify } = fakeDeps({ parent: null });
    const out = await createShareComment(
      { ...ids, body: 'x', authorName: 'M', parentId: 'elsewhere' },
      deps
    );
    expect(out.status).toBe(404);
    expect(notify).not.toHaveBeenCalled();
  });

  it('refuses comments in personal projects', async () => {
    const { deps, notify } = fakeDeps({ groupType: 'personal' });
    const out = await createShareComment({ ...ids, body: 'x', authorName: 'M' }, deps);
    expect(out.status).toBe(400);
    expect(notify).not.toHaveBeenCalled();
  });

  it('lets only the author or an admin delete', async () => {
    const stranger = fakeDeps({ role: 'member', comment: { user_id: 'someone' } });
    expect((await deleteShareComment({ ...ids, commentId: 'c1' }, stranger.deps)).status).toBe(403);
    expect(stranger.exec).not.toHaveBeenCalled();

    const author = fakeDeps({ role: 'member', comment: { user_id: 'u1' } });
    expect((await deleteShareComment({ ...ids, commentId: 'c1' }, author.deps)).status).toBe(200);

    const admin = fakeDeps({ role: 'admin', comment: { user_id: 'someone' } });
    expect((await deleteShareComment({ ...ids, commentId: 'c1' }, admin.deps)).status).toBe(200);
  });

  it('returns 404 for an unknown comment', async () => {
    const { deps } = fakeDeps({ comment: null });
    expect((await deleteShareComment({ ...ids, commentId: 'nope' }, deps)).status).toBe(404);
  });
});
