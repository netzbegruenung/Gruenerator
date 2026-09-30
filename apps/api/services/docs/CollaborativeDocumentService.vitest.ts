import { beforeEach, describe, expect, it, vi } from 'vitest';

/** Every side effect of a purge lands in this one ordered log. */
const {
  effects,
  deleteStoredFile,
  deleteReplacedThumbnailShare,
  purgeDocThread,
  reportBackgroundError,
} = vi.hoisted(() => {
  const log: string[] = [];
  return {
    effects: log,
    deleteStoredFile: vi.fn((name: string) => {
      log.push(`unlink ${name}`);
      return Promise.resolve();
    }),
    deleteReplacedThumbnailShare: vi.fn((url: string) => {
      log.push(`thumbnail ${url}`);
      return Promise.resolve();
    }),
    purgeDocThread: vi.fn((threadId: string, _runQuery?: unknown) => {
      log.push(`purge thread ${threadId}`);
      return Promise.resolve(true);
    }),
    reportBackgroundError: vi.fn(),
  };
});

vi.mock('../../routes/boards/boardAttachmentStorage.js', () => ({ deleteStoredFile }));
vi.mock('../canvas/canvasRepository.js', () => ({ deleteReplacedThumbnailShare }));
vi.mock('../../routes/chat/services/threadTrashService.js', () => ({ purgeDocThread }));
vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

import {
  checkEditAccess,
  getTrashedCollaborativeDocument,
  listTrashedCollaborativeDocuments,
  purgeCollaborativeDocument,
  restoreCollaborativeDocument,
  trashCollaborativeDocument,
  updateCollaborativeDocument,
  type QueryRunner,
} from './CollaborativeDocumentService.js';

const DOCS_ONLY = ['blank', 'docs', 'sheets', 'presentations'];
const OWNER = 'user-owner';
const EDITOR = 'user-editor';
const VIEWER = 'user-viewer';
const STRANGER = 'user-stranger';

const doc = (overrides: Record<string, unknown> = {}) => ({
  id: 'doc-1',
  created_by: OWNER,
  permissions: null,
  ...overrides,
});

/**
 * Mock query runner routing by SQL shape. `select` answers the initial
 * document lookup (empty ⇒ not found), `group` the group-write lookup, and
 * `update` the RETURNING row. Records calls for assertions.
 */
function makeRunner(opts: { select?: unknown[]; group?: unknown[]; update?: unknown[] }): {
  run: QueryRunner;
  calls: string[];
} {
  const calls: string[] = [];
  const run = (async (sql: string) => {
    calls.push(sql);
    if (sql.includes('group_content_shares')) return opts.group ?? [];
    if (sql.trimStart().startsWith('UPDATE')) return opts.update ?? [];
    return opts.select ?? [];
  }) as QueryRunner;
  return { run, calls };
}

describe('checkEditAccess', () => {
  it('returns not_found when the row is absent (or subtype out of scope)', async () => {
    const { run } = makeRunner({ select: [] });
    expect(await checkEditAccess(run, 'doc-1', OWNER, DOCS_ONLY)).toEqual({ status: 'not_found' });
  });

  it('allows the creator', async () => {
    const { run } = makeRunner({ select: [doc()] });
    const res = await checkEditAccess(run, 'doc-1', OWNER, DOCS_ONLY);
    expect(res).toMatchObject({ status: 'ok', isOwner: true });
  });

  it('allows a direct editor but not a viewer', async () => {
    const editorRunner = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [EDITOR]: { level: 'editor' } } })],
    });
    expect(await checkEditAccess(editorRunner.run, 'doc-1', EDITOR, DOCS_ONLY)).toMatchObject({
      status: 'ok',
      isOwner: false,
    });

    const viewerRunner = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [VIEWER]: { level: 'viewer' } } })],
      group: [],
    });
    expect(await checkEditAccess(viewerRunner.run, 'doc-1', VIEWER, DOCS_ONLY)).toEqual({
      status: 'forbidden',
    });
  });

  it('allows a group member with write permission', async () => {
    const { run } = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: {} })],
      group: [{ permissions: { read: true, write: true } }],
    });
    expect(await checkEditAccess(run, 'doc-1', STRANGER, DOCS_ONLY)).toMatchObject({
      status: 'ok',
    });
  });
});

describe('updateCollaborativeDocument', () => {
  it('propagates forbidden without issuing an UPDATE', async () => {
    const { run, calls } = makeRunner({
      select: [doc({ created_by: STRANGER, permissions: { [VIEWER]: { level: 'viewer' } } })],
      group: [],
    });
    const res = await updateCollaborativeDocument(run, 'doc-1', VIEWER, DOCS_ONLY, { title: 'x' });
    expect(res.status).toBe('forbidden');
    expect(calls.some((s) => s.trimStart().startsWith('UPDATE'))).toBe(false);
  });

  it('renames and returns the updated row', async () => {
    const { run, calls } = makeRunner({
      select: [doc()],
      update: [doc({ title: 'Renamed' })],
    });
    const res = await updateCollaborativeDocument(run, 'doc-1', OWNER, DOCS_ONLY, {
      title: 'Renamed',
    });
    expect(res).toEqual({ status: 'ok', document: doc({ title: 'Renamed' }) });
    expect(calls.some((s) => s.includes('title = $1'))).toBe(true);
  });
});

describe('trashCollaborativeDocument', () => {
  it('rejects a foreign board via the docs scope (row filtered out ⇒ not_found)', async () => {
    // A board id queried under DOCS_ONLY subtypes matches no row — this is the
    // guard that keeps the /docs route from deleting boards/canvas.
    const { run, calls } = makeRunner({ select: [] });
    expect(await trashCollaborativeDocument(run, 'board-1', OWNER, DOCS_ONLY)).toEqual({
      status: 'not_found',
    });
    expect(calls.some((s) => s.trimStart().startsWith('UPDATE'))).toBe(false);
  });

  it('forbids a non-owner (editor) from deleting', async () => {
    const { run } = makeRunner({
      select: [{ created_by: STRANGER, permissions: { [EDITOR]: { level: 'editor' } } }],
    });
    expect(await trashCollaborativeDocument(run, 'doc-1', EDITOR, DOCS_ONLY)).toEqual({
      status: 'forbidden',
    });
  });

  it('moves the document to the trash for the owner', async () => {
    const { run, calls } = makeRunner({ select: [{ created_by: OWNER, permissions: null }] });
    expect(await trashCollaborativeDocument(run, 'doc-1', OWNER, DOCS_ONLY)).toEqual({
      status: 'ok',
    });
    expect(calls.some((s) => s.includes('is_deleted = true, deleted_at = now()'))).toBe(true);
  });
});

/**
 * A single-row stand-in for `collaborative_documents` that honours the WHERE
 * clauses the trash functions rely on, so the lifecycle is observed on state,
 * not on SQL strings.
 */
function makeTrashTable(initial: { created_by: string; permissions?: unknown }) {
  const row = {
    id: 'doc-1',
    title: 'Antrag',
    document_subtype: 'docs',
    created_by: initial.created_by,
    permissions: initial.permissions ?? null,
    is_deleted: false,
    deleted_at: null as Date | null,
  };
  const run = (async (sql: string) => {
    const s = sql.replace(/\s+/g, ' ').trim();
    if (s.startsWith('SELECT created_by, permissions') && s.includes('is_deleted = false')) {
      return row.is_deleted ? [] : [row];
    }
    if (s.startsWith('SELECT id, title') && s.includes('deleted_at IS NOT NULL')) {
      return row.deleted_at ? [{ ...row }] : [];
    }
    if (s.startsWith('UPDATE collaborative_documents SET is_deleted = true, deleted_at = now()')) {
      if (!row.is_deleted) Object.assign(row, { is_deleted: true, deleted_at: new Date() });
      return [];
    }
    if (s.startsWith('UPDATE collaborative_documents SET is_deleted = false, deleted_at = NULL')) {
      if (row.deleted_at) Object.assign(row, { is_deleted: false, deleted_at: null });
      return [];
    }
    throw new Error(`unexpected SQL: ${s}`);
  }) as QueryRunner;
  return { row, run };
}

describe('trash lifecycle', () => {
  it('trash sets both columns, restore clears both', async () => {
    const { row, run } = makeTrashTable({ created_by: OWNER });

    expect(await trashCollaborativeDocument(run, 'doc-1', OWNER, null)).toEqual({ status: 'ok' });
    expect(row.is_deleted).toBe(true);
    expect(row.deleted_at).toBeInstanceOf(Date);

    const restored = await restoreCollaborativeDocument(run, 'doc-1', OWNER);
    expect(restored).toMatchObject({ status: 'ok', row: { id: 'doc-1', title: 'Antrag' } });
    expect(row.is_deleted).toBe(false);
    expect(row.deleted_at).toBeNull();
  });

  it('restore and trash lookup use the delete rights: an editor may do neither', async () => {
    const { row, run } = makeTrashTable({
      created_by: STRANGER,
      permissions: { [EDITOR]: { level: 'editor' }, [OWNER]: { level: 'owner' } },
    });
    expect(await trashCollaborativeDocument(run, 'doc-1', EDITOR, null)).toEqual({
      status: 'forbidden',
    });
    // A permission-level owner may trash although someone else created the doc.
    expect(await trashCollaborativeDocument(run, 'doc-1', OWNER, null)).toEqual({ status: 'ok' });

    expect(await restoreCollaborativeDocument(run, 'doc-1', EDITOR)).toEqual({
      status: 'forbidden',
    });
    expect(await getTrashedCollaborativeDocument(run, 'doc-1', EDITOR)).toEqual({
      status: 'forbidden',
    });
    expect(row.is_deleted).toBe(true);
  });

  it('restore of a live document is not_found and writes nothing', async () => {
    const { row, run } = makeTrashTable({ created_by: OWNER });
    expect(await restoreCollaborativeDocument(run, 'doc-1', OWNER)).toEqual({
      status: 'not_found',
    });
    expect(row.is_deleted).toBe(false);
  });
});

describe('listTrashedCollaborativeDocuments', () => {
  it('pages after the cursor with the owner predicate and the millisecond key', async () => {
    const seen: Array<{ sql: string; params: unknown[] }> = [];
    const run = (async (sql: string, params?: unknown[]) => {
      seen.push({ sql, params: params ?? [] });
      return [];
    }) as QueryRunner;

    await listTrashedCollaborativeDocuments(run, OWNER, {
      limit: 21,
      before: { deletedAt: '2026-09-01T10:00:00.123Z', id: 'doc-9' },
    });

    const [{ sql, params }] = seen;
    expect(sql).toContain('deleted_at IS NOT NULL');
    expect(sql).toContain("permissions -> $1 ->> 'level' = 'owner'");
    expect(sql).toContain("date_trunc('milliseconds', deleted_at) < $2::timestamptz");
    expect(params).toEqual([OWNER, '2026-09-01T10:00:00.123Z', 'doc-9', 21]);
  });
});

describe('purgeCollaborativeDocument', () => {
  beforeEach(() => {
    effects.length = 0;
    deleteStoredFile.mockClear();
    deleteReplacedThumbnailShare.mockClear();
    purgeDocThread.mockClear();
    reportBackgroundError.mockClear();
  });

  /** Records every statement into `effects`; `deleted` is what the conditional DELETE returns. */
  function purgeRunner(opts: { deleted: unknown[]; failOn?: string }): QueryRunner {
    return (async (sql: string) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      effects.push(s.split(' WHERE ')[0]);
      if (opts.failOn && s.includes(opts.failOn)) throw new Error(`boom ${opts.failOn}`);
      if (s.startsWith('SELECT stored_filename')) {
        return [{ stored_filename: 'a.pdf' }, { stored_filename: 'b.png' }];
      }
      if (s.startsWith('SELECT thumbnail_url')) {
        return [{ thumbnail_url: '/api/share/tok-1/download' }];
      }
      if (s.startsWith('SELECT id FROM chat_threads')) return [{ id: 'thread-1' }];
      if (s.startsWith('SELECT id::text AS id FROM board_comments')) {
        return [{ id: 'comment-1' }, { id: 'reply-1' }];
      }
      if (s.startsWith('DELETE FROM collaborative_documents')) return opts.deleted;
      return [];
    }) as QueryRunner;
  }

  it('reads handles, deletes the row conditionally, then clears every side store in order', async () => {
    const cutoff = new Date('2026-08-29T00:00:00Z');
    const seen: unknown[][] = [];
    const base = purgeRunner({ deleted: [{ id: 'doc-1' }] });
    const run = (async (sql: string, params?: unknown[]) => {
      if (sql.includes('DELETE FROM collaborative_documents')) {
        seen.push(params ?? []);
        expect(sql).toContain('deleted_at IS NOT NULL');
        expect(sql).toContain('deleted_at < $2');
        expect(sql).toContain('RETURNING id');
      }
      return base(sql, params);
    }) as QueryRunner;

    expect(await purgeCollaborativeDocument(run, 'doc-1', cutoff)).toBe(true);
    expect(seen).toEqual([['doc-1', cutoff]]);
    expect(purgeDocThread).toHaveBeenCalledWith('thread-1', run);
    expect(effects).toEqual([
      'SELECT stored_filename FROM board_attachments',
      'SELECT thumbnail_url FROM canvas_documents',
      'SELECT id FROM chat_threads',
      'SELECT id::text AS id FROM board_comments',
      'DELETE FROM collaborative_documents',
      'DELETE FROM yjs_document_updates',
      'DELETE FROM yjs_document_snapshots',
      'WITH doomed AS (SELECT id FROM group_content_shares',
      'DELETE FROM group_content_shares',
      'DELETE FROM entity_reactions',
      'purge thread thread-1',
      'DELETE FROM board_scheduled_runs',
      'unlink a.pdf',
      'unlink b.png',
      'thumbnail /api/share/tok-1/download',
    ]);
  });

  it('touches no side store when the row was restored meanwhile (0 rows)', async () => {
    expect(await purgeCollaborativeDocument(purgeRunner({ deleted: [] }), 'doc-1', null)).toBe(
      false
    );
    expect(effects).toEqual([
      'SELECT stored_filename FROM board_attachments',
      'SELECT thumbnail_url FROM canvas_documents',
      'SELECT id FROM chat_threads',
      'SELECT id::text AS id FROM board_comments',
      'DELETE FROM collaborative_documents',
    ]);
    expect(purgeDocThread).not.toHaveBeenCalled();
    expect(deleteStoredFile).not.toHaveBeenCalled();
    expect(deleteReplacedThumbnailShare).not.toHaveBeenCalled();
  });

  it('reports a failing side store and still cleans the rest, never rethrowing', async () => {
    const run = purgeRunner({ deleted: [{ id: 'doc-1' }], failOn: 'yjs_document_updates' });

    expect(await purgeCollaborativeDocument(run, 'doc-1', null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledTimes(1);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', id: 'doc-1', store: 'yjs_document_updates' })
    );
    expect(effects).toContain('DELETE FROM yjs_document_snapshots');
    expect(effects).toContain('thumbnail /api/share/tok-1/download');
  });

  it('deletes the board comment reactions collected before the cascade', async () => {
    const seen: unknown[][] = [];
    const base = purgeRunner({ deleted: [{ id: 'doc-1' }] });
    const run = (async (sql: string, params?: unknown[]) => {
      if (sql.includes('FROM board_comments') || sql.includes("'board_comment'")) {
        seen.push(params ?? []);
      }
      return base(sql, params);
    }) as QueryRunner;

    await purgeCollaborativeDocument(run, 'doc-1', null);
    expect(seen).toEqual([['doc-1'], [['comment-1', 'reply-1']]]);
  });

  it('still deletes the shares when their reaction cleanup fails', async () => {
    const run = purgeRunner({
      deleted: [{ id: 'doc-1' }],
      failOn: 'WITH doomed AS (SELECT id FROM group_content_shares',
    });

    expect(await purgeCollaborativeDocument(run, 'doc-1', null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ store: 'group_share_reactions' })
    );
    expect(effects).toContain('DELETE FROM group_content_shares');
  });
});
