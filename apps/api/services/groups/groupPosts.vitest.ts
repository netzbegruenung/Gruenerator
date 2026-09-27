/**
 * Eigene Beiträge im Gruppen-Feed gegen eine Fake-Datenbank: wer schreiben,
 * bearbeiten und löschen darf, und dass hochgeladene Dateien bei jedem
 * Abbruch wieder von der Platte verschwinden.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  createGroupPost,
  deleteGroupPost,
  getGroupPostFile,
  updateGroupPost,
  type GroupPostDeps,
  type UploadedPostFile,
} from './groupPosts.js';

interface Fake {
  role?: 'admin' | 'member' | null;
  groupType?: 'standard' | 'personal';
  isSystem?: boolean;
  instanceAdmin?: boolean;
  post?: { id: string; author_id: string | null } | null;
  fileCount?: number;
  failInsert?: boolean;
}

function fakeDeps(f: Fake = {}) {
  const exec = vi.fn(async () => ({ changes: 1 }));
  const queryOne = vi.fn(async (sql: string) => {
    if (sql.includes('FROM group_memberships gm')) {
      if (f.role === null) return null;
      return {
        role: f.role ?? 'member',
        group_type: f.groupType ?? 'standard',
        created_by: 'creator',
        is_system: f.isSystem ?? false,
      };
    }
    if (sql.includes('FROM group_posts')) {
      return f.post === undefined ? { id: 'p1', author_id: 'author' } : f.post;
    }
    if (sql.includes('COUNT(*)')) return { n: f.fileCount ?? 0 };
    if (sql.includes('FROM group_post_files')) {
      return { stored_filename: 'abc.pdf', file_name: 'Plan.pdf', mime_type: 'application/pdf' };
    }
    return null;
  });
  const query = vi.fn(async () => [{ stored_filename: 'stored-1.png' }]);
  const txQueryOne = vi.fn(async (_client: unknown, sql: string) => {
    if (f.failInsert) throw new Error('db down');
    if (sql.startsWith('INSERT INTO group_posts')) return { id: 'p-new' };
    if (sql.includes('INSERT INTO group_content_shares')) return { id: 's-new' };
    return null;
  });
  const txExec = vi.fn(async () => ({ changes: 1 }));
  const postgres = {
    query,
    queryOne,
    exec,
    transaction: vi.fn(async (cb: (client: unknown) => Promise<unknown>) => cb({})),
    transactionQueryOne: txQueryOne,
    transactionExec: txExec,
  };
  const notify = vi.fn(async () => undefined);
  const deleteFile = vi.fn(async () => undefined);
  const deps = {
    postgres: postgres as unknown as GroupPostDeps['postgres'],
    notify: notify as unknown as GroupPostDeps['notify'],
    deleteFile,
    isInstanceAdmin: vi.fn(async () => f.instanceAdmin ?? false),
  };
  return { deps, exec, txQueryOne, txExec, notify, deleteFile };
}

const file = (name: string): UploadedPostFile => ({
  storedFilename: `stored-${name}`,
  originalName: name,
  size: 10,
});

const base = { groupId: 'g1', userId: 'author', authorName: 'Jana' };

describe('createGroupPost', () => {
  it('writes post, files and the share row, then notifies the others', async () => {
    const { deps, txQueryOne, txExec, notify, deleteFile } = fakeDeps();
    const out = await createGroupPost(
      { ...base, body: '  Wer hilft?  ', files: [file('Plan.pdf'), file('Foto.JPG')] },
      deps
    );
    expect(out).toEqual({ status: 201, data: { postId: 'p-new', shareId: 's-new' } });
    expect(txQueryOne.mock.calls[0]?.[2]).toEqual(['g1', 'author', 'Wer hilft?']);
    const fileInserts = txExec.mock.calls.map((c) => c[2] as unknown[]);
    expect(fileInserts.map((p) => [p[3], p[4], p[6]])).toEqual([
      ['Plan.pdf', 'application/pdf', 0],
      ['Foto.JPG', 'image/jpeg', 1],
    ]);
    expect(txQueryOne.mock.calls[1]?.[2]).toEqual(['group_post', 'p-new', 'g1', 'author']);
    expect(notify).toHaveBeenCalledWith(
      expect.objectContaining({ excludeUserId: 'author', body: 'Jana: Wer hilft?' })
    );
    expect(deleteFile).not.toHaveBeenCalled();
  });

  it('accepts files without text', async () => {
    const { deps } = fakeDeps();
    const out = await createGroupPost({ ...base, body: '', files: [file('a.pdf')] }, deps);
    expect(out.status).toBe(201);
  });

  it.each([
    ['empty', { body: '   ', files: [] as UploadedPostFile[] }, {}],
    ['a personal project', { body: 'x', files: [file('a.pdf')] }, { groupType: 'personal' }],
    ['an unknown file type', { body: 'x', files: [file('a.pdf'), file('run.exe')] }, {}],
    [
      'too many files',
      { body: '', files: Array.from({ length: 11 }, (_, i) => file(`${i}.png`)) },
      {},
    ],
  ] as const)('rejects %s and removes the uploaded files', async (_label, input, fake) => {
    const { deps, deleteFile, txQueryOne } = fakeDeps(fake as Fake);
    const out = await createGroupPost({ ...base, ...input, files: [...input.files] }, deps);
    expect(out.status).toBe(400);
    expect(txQueryOne).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledTimes(input.files.length);
  });

  it('lets only instance admins post in the system group, and removes the files', async () => {
    const member = fakeDeps({ role: 'admin', isSystem: true });
    const out = await createGroupPost(
      { ...base, body: 'Hallo', files: [file('a.png')] },
      member.deps
    );
    expect(out.status).toBe(403);
    expect(member.deleteFile).toHaveBeenCalledWith('stored-a.png');
    const admin = fakeDeps({ isSystem: true, instanceAdmin: true });
    expect((await createGroupPost({ ...base, body: 'Hallo', files: [] }, admin.deps)).status).toBe(
      201
    );
  });

  it('removes the files when the user is not a member', async () => {
    const { deps, deleteFile } = fakeDeps({ role: null });
    await expect(
      createGroupPost({ ...base, body: 'x', files: [file('a.pdf')] }, deps)
    ).rejects.toThrow('Mitglied');
    expect(deleteFile).toHaveBeenCalledWith('stored-a.pdf');
  });

  it('removes the files when the insert fails', async () => {
    const { deps, deleteFile, notify } = fakeDeps({ failInsert: true });
    await expect(
      createGroupPost({ ...base, body: 'x', files: [file('a.pdf')] }, deps)
    ).rejects.toThrow('db down');
    expect(deleteFile).toHaveBeenCalledWith('stored-a.pdf');
    expect(notify).not.toHaveBeenCalled();
  });
});

describe('updateGroupPost', () => {
  it('lets the author edit the text', async () => {
    const { deps, exec } = fakeDeps();
    const out = await updateGroupPost(
      { groupId: 'g1', postId: 'p1', userId: 'author', body: ' neu ' },
      deps
    );
    expect(out.status).toBe(200);
    expect(exec.mock.calls[0]?.[1]).toEqual(['neu', 'p1']);
  });

  it('forbids an admin who did not write it', async () => {
    const { deps, exec } = fakeDeps({ role: 'admin' });
    const out = await updateGroupPost(
      { groupId: 'g1', postId: 'p1', userId: 'other', body: 'x' },
      deps
    );
    expect(out.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('refuses to empty a post that has no files', async () => {
    const { deps } = fakeDeps({ fileCount: 0 });
    const out = await updateGroupPost(
      { groupId: 'g1', postId: 'p1', userId: 'author', body: '' },
      deps
    );
    expect(out.status).toBe(400);
  });

  it('allows emptying the text when files remain', async () => {
    const { deps } = fakeDeps({ fileCount: 2 });
    const out = await updateGroupPost(
      { groupId: 'g1', postId: 'p1', userId: 'author', body: '' },
      deps
    );
    expect(out.status).toBe(200);
  });
});

describe('deleteGroupPost', () => {
  it('lets an admin delete it and removes share row, post and files', async () => {
    const { deps, txExec, deleteFile } = fakeDeps({ role: 'admin' });
    const out = await deleteGroupPost({ groupId: 'g1', postId: 'p1', userId: 'other' }, deps);
    expect(out.status).toBe(200);
    expect(txExec.mock.calls.map((c) => c[1])).toEqual([
      expect.stringContaining('DELETE FROM group_content_shares'),
      expect.stringContaining('DELETE FROM group_posts'),
    ]);
    expect(txExec.mock.calls[0]?.[2]).toEqual(['group_post', 'p1', 'g1']);
    expect(deleteFile).toHaveBeenCalledWith('stored-1.png');
  });

  it('forbids a member who did not write it', async () => {
    const { deps, txExec } = fakeDeps();
    const out = await deleteGroupPost({ groupId: 'g1', postId: 'p1', userId: 'other' }, deps);
    expect(out.status).toBe(403);
    expect(txExec).not.toHaveBeenCalled();
  });

  it('returns 404 for a post of another group', async () => {
    const { deps } = fakeDeps({ post: null });
    const out = await deleteGroupPost({ groupId: 'g1', postId: 'p1', userId: 'author' }, deps);
    expect(out.status).toBe(404);
  });
});

describe('getGroupPostFile', () => {
  it('throws for non-members before reading the file row', async () => {
    const { deps } = fakeDeps({ role: null });
    await expect(
      getGroupPostFile({ groupId: 'g1', postId: 'p1', fileId: 'f1', userId: 'x' }, deps)
    ).rejects.toThrow('Mitglied');
  });
});
