/**
 * `shareContentToGroup` gegen eine Fake-Datenbank — die Besitzprüfung je
 * Typ, die Notebook-Hochstufung, der Doppel-Check und der Insert, ohne
 * Postgres. Die Statuscodes sind die des ts-rest-Handlers, der diese Funktion
 * nur noch durchreicht.
 */
import { describe, expect, it, vi } from 'vitest';

import { shareContentToGroup, type ShareContentDeps } from './groupContent.js';

interface FakeDbOptions {
  /** Antwort auf die Besitzabfrage (Tabelle → Zeile). */
  owner?: Record<string, string> | null;
  existingShare?: boolean;
}

function fakeDeps(opts: FakeDbOptions = {}, over: Partial<ShareContentDeps> = {}) {
  const exec = vi.fn(async () => ({ changes: 1 }));
  const queryOne = vi.fn(async (sql: string) => {
    if (sql.includes('FROM group_content_shares')) return opts.existingShare ? { id: 's1' } : null;
    if (sql.includes('FROM groups')) return { name: 'Kreisverband' };
    return opts.owner ?? null;
  });
  const deps: ShareContentDeps = {
    postgres: { exec, queryOne } as unknown as ShareContentDeps['postgres'],
    checkMembership: vi.fn(async () => {}),
    getNotebookCollection: vi.fn(async () => null),
    updateNotebookCollection: vi.fn(async () => ({ success: true })),
    getShareLinkById: vi.fn(async () => ({}) as never),
    notify: vi.fn(async () => {}),
    ...over,
  };
  return { deps, exec, queryOne };
}

const base = {
  userId: 'u1',
  groupId: 'g1',
  sharerName: 'Moritz',
  permissions: null,
};

describe('shareContentToGroup', () => {
  it('inserts a share for content the caller owns', async () => {
    const { deps, exec } = fakeDeps({ owner: { created_by: 'u1' } });
    const out = await shareContentToGroup(
      { ...base, contentType: 'collaborative_documents', contentId: 'd1' },
      deps
    );
    expect(out.status).toBe(200);
    expect(exec).toHaveBeenCalledTimes(1);
    const [sql, params] = exec.mock.calls[0] as unknown as [string, unknown[]];
    expect(sql).toContain('INSERT INTO group_content_shares');
    expect(params.slice(0, 4)).toEqual(['collaborative_documents', 'd1', 'g1', 'u1']);
  });

  it('refuses content that belongs to someone else', async () => {
    const { deps, exec } = fakeDeps({ owner: { created_by: 'other' } });
    const out = await shareContentToGroup(
      { ...base, contentType: 'collaborative_documents', contentId: 'd1' },
      deps
    );
    expect(out.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('reports a duplicate share as 400 without a second insert', async () => {
    const { deps, exec } = fakeDeps({ owner: { created_by: 'u1' }, existingShare: true });
    const out = await shareContentToGroup(
      { ...base, contentType: 'collaborative_documents', contentId: 'd1' },
      deps
    );
    expect(out.status).toBe(400);
    expect(out.message).toContain('bereits');
    expect(exec).not.toHaveBeenCalled();
  });

  /**
   * `checkNotebookAccess` gewährt Gruppenmitgliedern nur bei share_mode
   * 'groups' Lesezugriff. Ein privates Notebook, das hier geteilt wird, bliebe
   * für die Mitglieder „Kein Zugriff" — die Hochstufung ist Teil des Teilens.
   */
  it('promotes a private notebook to share_mode=groups', async () => {
    const { deps } = fakeDeps(
      {},
      {
        getNotebookCollection: vi.fn(async () => ({
          id: 'n1',
          user_id: 'u1',
          share_mode: 'private',
        })) as never,
      }
    );
    const out = await shareContentToGroup(
      { ...base, contentType: 'notebook_collections', contentId: 'n1' },
      deps
    );
    expect(out.status).toBe(200);
    expect(deps.updateNotebookCollection).toHaveBeenCalledWith('n1', { share_mode: 'groups' });
  });

  it('leaves an authenticated notebook alone', async () => {
    const { deps } = fakeDeps(
      {},
      {
        getNotebookCollection: vi.fn(async () => ({
          id: 'n1',
          user_id: 'u1',
          share_mode: 'authenticated',
        })) as never,
      }
    );
    await shareContentToGroup(
      { ...base, contentType: 'notebook_collections', contentId: 'n1' },
      deps
    );
    expect(deps.updateNotebookCollection).not.toHaveBeenCalled();
  });

  it('is owner-only for notebooks', async () => {
    const { deps, exec } = fakeDeps(
      {},
      {
        getNotebookCollection: vi.fn(async () => ({
          id: 'n1',
          user_id: 'other',
          share_mode: 'private',
        })) as never,
      }
    );
    const out = await shareContentToGroup(
      { ...base, contentType: 'notebook_collections', contentId: 'n1' },
      deps
    );
    expect(out.status).toBe(403);
    expect(exec).not.toHaveBeenCalled();
  });

  it('lets a missing membership propagate as thrown (the handler maps it)', async () => {
    const { deps } = fakeDeps(
      {},
      {
        checkMembership: vi.fn(async () => {
          throw new Error('Du bist nicht Mitglied dieser Gruppe.');
        }),
      }
    );
    await expect(
      shareContentToGroup(
        { ...base, contentType: 'collaborative_documents', contentId: 'd1' },
        deps
      )
    ).rejects.toThrow('nicht Mitglied');
  });

  it('notifies the other members with the label of the content type', async () => {
    const { deps } = fakeDeps({ owner: { created_by: 'u1' } });
    await shareContentToGroup(
      { ...base, contentType: 'collaborative_documents', contentId: 'd1' },
      deps
    );
    // Die Benachrichtigung ist ein losgelöstes Promise — kurz warten.
    await new Promise((r) => setTimeout(r, 0));
    expect(deps.notify).toHaveBeenCalledWith(
      expect.objectContaining({
        groupId: 'g1',
        excludeUserId: 'u1',
        body: 'Moritz hat ein Dokument in „Kreisverband" geteilt',
      })
    );
  });
});
