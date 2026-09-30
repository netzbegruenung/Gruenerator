/**
 * Wer reagieren darf, je Entitätstyp, gegen eine Fake-Datenbank:
 * ok / forbidden (kein Mitglied, Projekt, kein Board-Zugriff) / not_found.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../routes/boards/boardAccess.js', () => ({ checkBoardAccess: vi.fn() }));

const { checkBoardCommentReaction, checkGroupCommentReaction, checkGroupShareReaction } =
  await import('./reactionTargets.js');

type Deps = Parameters<typeof checkGroupShareReaction>[2];

const ID = '11111111-2222-4333-8444-555555555555';

interface Fake {
  /** Zeile der Entität; null = gibt es nicht oder Gruppe im Papierkorb. */
  entity?: Record<string, string> | null;
  /** Mitgliedschaft; null = kein Mitglied. */
  member?: { group_type: 'standard' | 'personal' } | null;
  board?: { hasAccess: boolean; createdBy: string | null };
}

function fakeDeps(f: Fake = {}) {
  const queryOne = vi.fn(async (sql: string) => {
    if (sql.includes('FROM group_memberships gm')) {
      if (f.member === null) return null;
      return {
        role: 'member',
        group_type: f.member?.group_type ?? 'standard',
        created_by: 'creator',
        is_system: false,
      };
    }
    return f.entity === undefined ? { group_id: 'g1', board_id: 'b1' } : f.entity;
  });
  const checkBoardAccess = vi.fn(async () => ({
    hasAccess: f.board?.hasAccess ?? true,
    boardTitle: 'Board',
    createdBy: f.board ? f.board.createdBy : 'owner',
    canEdit: false,
  }));
  const deps = {
    postgres: { queryOne },
    isInstanceAdmin: vi.fn(async () => false),
    checkBoardAccess,
  } as unknown as Deps;
  return { deps, queryOne, checkBoardAccess };
}

describe.each([
  ['group_share', checkGroupShareReaction, 'FROM group_content_shares gcs'],
  ['group_comment', checkGroupCommentReaction, 'FROM group_share_comments c'],
] as const)('%s', (_type, check, fromClause) => {
  it('Mitglied → ok', async () => {
    const { deps } = fakeDeps();
    expect(await check('u1', ID, deps)).toBe('ok');
  });

  it('kein Mitglied → forbidden', async () => {
    const { deps } = fakeDeps({ member: null });
    expect(await check('u1', ID, deps)).toBe('forbidden');
  });

  it('Projekt (persönlich) → forbidden, wie beim Kommentieren', async () => {
    const { deps } = fakeDeps({ member: { group_type: 'personal' } });
    expect(await check('u1', ID, deps)).toBe('forbidden');
  });

  it('unbekannt oder Gruppe im Papierkorb → not_found', async () => {
    const { deps, queryOne } = fakeDeps({ entity: null });
    expect(await check('u1', ID, deps)).toBe('not_found');
    const sql = queryOne.mock.calls[0][0];
    expect(sql).toContain(fromClause);
    expect(sql).toContain('g.deleted_at IS NULL');
  });

  it('keine UUID → not_found ohne Query', async () => {
    const { deps, queryOne } = fakeDeps();
    expect(await check('u1', 'nope', deps)).toBe('not_found');
    expect(queryOne).not.toHaveBeenCalled();
  });
});

describe('board_comment', () => {
  it('Board-Zugriff → ok, geprüft am Board des Kommentars', async () => {
    const { deps, checkBoardAccess } = fakeDeps();
    expect(await checkBoardCommentReaction('u1', ID, deps)).toBe('ok');
    expect(checkBoardAccess).toHaveBeenCalledWith('b1', 'u1');
  });

  it('kein Zugriff → forbidden', async () => {
    const { deps } = fakeDeps({ board: { hasAccess: false, createdBy: 'owner' } });
    expect(await checkBoardCommentReaction('u1', ID, deps)).toBe('forbidden');
  });

  it('Board gelöscht → not_found', async () => {
    const { deps } = fakeDeps({ board: { hasAccess: false, createdBy: null } });
    expect(await checkBoardCommentReaction('u1', ID, deps)).toBe('not_found');
  });

  it('Kommentar unbekannt → not_found', async () => {
    const { deps, checkBoardAccess } = fakeDeps({ entity: null });
    expect(await checkBoardCommentReaction('u1', ID, deps)).toBe('not_found');
    expect(checkBoardAccess).not.toHaveBeenCalled();
  });
});
