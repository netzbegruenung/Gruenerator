/**
 * Der Schreiber gegen eine Fake-Datenbank: die Reihenfolge (erst das Tor,
 * dann irgendetwas), das Heben auf share_mode='groups' je Typ, der Upsert und
 * wann ein Collab-Raum geschlossen wird. Gegen echtes Postgres (Unique-Key,
 * Doppelklick) prüft `groupShareWriter.db.vitest.ts`.
 */
import { describe, expect, it, vi } from 'vitest';

import {
  addGroupShare,
  GroupShareForbiddenError,
  removeAllGroupShares,
  removeGroupShare,
  setGroupSharePermissions,
  type GroupShareWriterDeps,
} from './groupShareWriter.js';

function fakeDeps(
  opts: { insertReturns?: Array<{ inserted: boolean }>; rows?: unknown[] } = {},
  over: Partial<GroupShareWriterDeps> = {}
) {
  const query = vi.fn(async (sql: string, _params?: unknown[]) => {
    if (sql.includes('INSERT INTO group_content_shares'))
      return opts.insertReturns ?? [{ inserted: true }];
    return opts.rows ?? [];
  });
  const deps: GroupShareWriterDeps = {
    postgres: { query } as unknown as GroupShareWriterDeps['postgres'],
    assertCanShare: vi.fn(async () => ({})),
    getNotebookCollection: vi.fn(async () => null),
    updateNotebookCollection: vi.fn(async () => ({ success: true })),
    notifyShared: vi.fn(),
    closeRoom: vi.fn(async () => {}),
    ...over,
  };
  return { deps, query };
}

const share = {
  userId: 'u1',
  groupId: 'g1',
  contentId: 'c1',
  permissions: { read: true, write: false },
};

const forbidden = () =>
  vi.fn(async () => {
    throw new Error('Du bist nicht Mitglied dieser Gruppe.');
  });

describe('addGroupShare', () => {
  it('inserts through the unique key and notifies once', async () => {
    const { deps, query } = fakeDeps();
    const out = await addGroupShare({ ...share, contentType: 'collaborative_documents' }, deps);
    expect(out).toEqual({ created: true });
    const [sql, params] = query.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('ON CONFLICT (group_id, content_type, content_id) DO NOTHING');
    expect(params).toEqual([
      'collaborative_documents',
      'c1',
      'g1',
      'u1',
      JSON.stringify({ read: true, write: false, collaborative: false }),
      null,
    ]);
    expect(deps.notifyShared).toHaveBeenCalledTimes(1);
    expect(deps.closeRoom).not.toHaveBeenCalled();
  });

  it('reports an existing share without notifying or closing anything', async () => {
    const { deps } = fakeDeps({ insertReturns: [] });
    const out = await addGroupShare({ ...share, contentType: 'user_agents' }, deps);
    expect(out).toEqual({ created: false });
    expect(deps.notifyShared).not.toHaveBeenCalled();
    expect(deps.closeRoom).not.toHaveBeenCalled();
  });

  it('closes the room when the upsert changed the rights of an existing share', async () => {
    const { deps, query } = fakeDeps({ insertReturns: [{ inserted: false }] });
    const out = await addGroupShare(
      {
        ...share,
        contentType: 'chat_threads',
        permissions: { read: true, write: true },
        onExisting: 'update-permissions',
      },
      deps
    );
    expect(out).toEqual({ created: false });
    expect(String(query.mock.calls[0]?.[0])).toContain('IS DISTINCT FROM EXCLUDED.permissions');
    expect(deps.closeRoom).toHaveBeenCalledWith('chat_threads', 'c1');
    expect(deps.notifyShared).not.toHaveBeenCalled();
  });

  it('keeps its hands off notifications when the caller sends its own', async () => {
    const { deps } = fakeDeps();
    await addGroupShare({ ...share, contentType: 'collaborative_documents', notify: false }, deps);
    expect(deps.notifyShared).not.toHaveBeenCalled();
  });

  it('stores the trimmed note, an empty one as none', async () => {
    const { deps, query } = fakeDeps();
    await addGroupShare({ ...share, contentType: 'user_agents', note: '  Schaut mal  ' }, deps);
    await addGroupShare({ ...share, contentType: 'user_agents', note: '   ' }, deps);
    const notes = query.mock.calls
      .filter(([sql]) => String(sql).includes('INSERT'))
      .map(([, params]) => (params as unknown[])[5]);
    expect(notes).toEqual(['Schaut mal', null]);
  });

  it.each(['user_agents', 'user_text_forms'] as const)(
    'lifts a private %s to share_mode=groups before inserting',
    async (contentType) => {
      const { deps, query } = fakeDeps();
      await addGroupShare({ ...share, contentType }, deps);
      const [promote, insert] = query.mock.calls.map(([sql]) => String(sql));
      expect(promote).toMatch(new RegExp(`UPDATE ${contentType} SET share_mode = 'groups'`));
      expect(promote).toContain("share_mode = 'private'");
      expect(insert).toContain('INSERT INTO group_content_shares');
    }
  );

  it.each([
    ['private', true],
    ['groups', false],
    ['authenticated', false],
  ] as const)('a %s notebook is lifted: %s', async (shareMode, lifted) => {
    const { deps } = fakeDeps(
      {},
      {
        getNotebookCollection: vi.fn(async () => ({ id: 'c1', share_mode: shareMode })) as never,
      }
    );
    await addGroupShare({ ...share, contentType: 'notebook_collections' }, deps);
    expect(vi.mocked(deps.updateNotebookCollection).mock.calls.length > 0).toBe(lifted);
  });

  it('lifts nothing for a type without share_mode', async () => {
    const { deps, query } = fakeDeps();
    await addGroupShare({ ...share, contentType: 'collaborative_documents' }, deps);
    expect(query).toHaveBeenCalledTimes(1);
  });

  it.each(['notebook_collections', 'user_agents', 'user_text_forms'] as const)(
    'changes nothing about a %s when the project gate refuses',
    async (contentType) => {
      const { deps, query } = fakeDeps(
        {},
        {
          assertCanShare: forbidden(),
          getNotebookCollection: vi.fn(async () => ({ id: 'c1', share_mode: 'private' })) as never,
        }
      );
      const run = addGroupShare({ ...share, contentType }, deps);
      await expect(run).rejects.toBeInstanceOf(GroupShareForbiddenError);
      await expect(run).rejects.toThrow('nicht Mitglied');
      expect(query).not.toHaveBeenCalled();
      expect(deps.updateNotebookCollection).not.toHaveBeenCalled();
      expect(deps.notifyShared).not.toHaveBeenCalled();
    }
  );

  it('lets a database error through as itself, not as a refusal', async () => {
    const { deps } = fakeDeps(
      {},
      {
        postgres: {
          query: vi.fn(async () => {
            throw new Error('Database query failed');
          }),
        } as unknown as GroupShareWriterDeps['postgres'],
      }
    );
    const run = addGroupShare({ ...share, contentType: 'collaborative_documents' }, deps);
    await expect(run).rejects.toThrow('Database query failed');
    await expect(run).rejects.not.toBeInstanceOf(GroupShareForbiddenError);
  });
});

describe('removing and changing a share', () => {
  const target = { groupId: 'g1', contentType: 'chat_threads' as const, contentId: 'c1' };

  it('closes the room only when a share was removed', async () => {
    const hit = fakeDeps({ rows: [{ id: 's1' }] });
    expect(await removeGroupShare(target, hit.deps)).toBe(true);
    expect(hit.deps.closeRoom).toHaveBeenCalledWith('chat_threads', 'c1');

    const miss = fakeDeps({ rows: [] });
    expect(await removeGroupShare(target, miss.deps)).toBe(false);
    expect(miss.deps.closeRoom).not.toHaveBeenCalled();
  });

  it('removes a content from every project at once', async () => {
    const { deps, query } = fakeDeps({ rows: [{ id: 's1' }, { id: 's2' }] });
    expect(await removeAllGroupShares({ contentType: 'user_agents', contentId: 'a1' }, deps)).toBe(
      2
    );
    expect(query.mock.calls[0]?.[1]).toEqual(['user_agents', 'a1']);
  });

  it('writes the canonical permission shape and closes the room', async () => {
    const { deps, query } = fakeDeps({ rows: [{ id: 's1' }] });
    const ok = await setGroupSharePermissions(
      { ...target, permissions: { read: true, write: true } },
      deps
    );
    expect(ok).toBe(true);
    expect(query.mock.calls[0]?.[1]?.[0]).toBe(
      JSON.stringify({ read: true, write: true, collaborative: false })
    );
    expect(deps.closeRoom).toHaveBeenCalledWith('chat_threads', 'c1');
  });
});
