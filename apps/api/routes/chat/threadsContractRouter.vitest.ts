/**
 * Handler tests for the threads contract router's `update` and `delete`, and
 * the Papierkorb lifecycle behind `delete` (threadTrashService).
 *
 * These pin the one invariant a shape test cannot see: the `chat_thread_recall`
 * Qdrant collection holds a point for exactly the regular threads, and `update`
 * is the only writer of `chat_threads.status`. Both directions have to be
 * carried here — archive deletes the point, unarchive rebuilds it. Half of it
 * is worse than none: deleting on archive without the rebuild makes an
 * unarchived thread permanently invisible to semantic recall, because
 * `upsertThreadRecallPoint` refuses archived threads and nothing else re-runs
 * it. See #3323.
 *
 * PostgresService and the recall service are mocked; handlers are called
 * directly on the router object (no HTTP), like chatThreadSharingContractRouter.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Request } from 'express';

const queryMock = vi.fn();
const deleteRecallPoint = vi.fn<(threadId: string) => Promise<void>>();
const upsertRecallPoint = vi.fn<(threadId: string) => Promise<void>>();
const readVectorHandles = vi.fn();
const deleteVectors = vi.fn();
const reportBackgroundError = vi.fn();

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: queryMock }),
}));

vi.mock('../../services/chat/threadRecallEmbeddingService.js', () => ({
  deleteThreadRecallPoint: (threadId: string) => deleteRecallPoint(threadId),
  upsertThreadRecallPoint: (threadId: string) => upsertRecallPoint(threadId),
}));

vi.mock('../../services/chat/threadTitleService.js', () => ({
  generateThreadTitle: vi.fn(),
  threadNeedsTitle: vi.fn(),
}));

vi.mock('../auth/groups/index.js', () => ({ getPostgresAndCheckMembership: vi.fn() }));

vi.mock('./services/attachmentPersistenceService.js', () => ({
  readThreadAttachmentVectorHandles: (threadId: string) => readVectorHandles(threadId),
  deleteAttachmentVectors: (threadId: string, handles: unknown) => deleteVectors(threadId, handles),
  getThreadTabularFiles: vi.fn(),
}));

vi.mock('../../utils/reportBackgroundError.js', () => ({ reportBackgroundError }));

vi.mock('./services/threadPersistenceService.js', () => ({
  getThreadSettings: vi.fn(),
  insertThreadWithSlugRetry: vi.fn(),
  updateThreadSettings: vi.fn(),
}));

const { threadsContractRouter } = await import('./threadsContractRouter.js');
const { listTrashedThreads, purgeDocThread, purgeThread, restoreThread } =
  await import('./services/threadTrashService.js');

const THREAD_ID = '550e8400-e29b-41d4-a716-446655440001';
const OWNER = 'owner-1';

const req = { user: { id: OWNER } } as unknown as Request;

/** Ownership SELECT, then the UPDATE … RETURNING row. */
function givenStatusChange(from: string, to: string) {
  queryMock
    .mockResolvedValueOnce([{ id: THREAD_ID, user_id: OWNER, status: from }])
    .mockResolvedValueOnce([
      {
        id: THREAD_ID,
        user_id: OWNER,
        agent_id: 'gruenerator-universal',
        title: 'Klimaplan',
        status: to,
        created_at: new Date('2026-09-01T00:00:00Z'),
        updated_at: new Date('2026-09-02T00:00:00Z'),
      },
    ]);
}

function update(body: Record<string, unknown>) {
  return threadsContractRouter.update({ req, body: { threadId: THREAD_ID, ...body } } as never);
}

beforeEach(() => {
  queryMock.mockReset();
  deleteRecallPoint.mockReset().mockResolvedValue(undefined);
  upsertRecallPoint.mockReset().mockResolvedValue(undefined);
});

describe('update — thread recall point follows the archive state', () => {
  it('drops the recall point when a thread is archived', async () => {
    givenStatusChange('regular', 'archived');

    const res = await update({ status: 'archived' });

    expect(res.status).toBe(200);
    expect(deleteRecallPoint).toHaveBeenCalledWith(THREAD_ID);
    expect(upsertRecallPoint).not.toHaveBeenCalled();
  });

  it('rebuilds the recall point when a thread is unarchived', async () => {
    // The half-fix this guards against: delete on archive, nothing on the way
    // back. `upsertThreadRecallPoint` refuses archived threads, so without this
    // call the thread never returns to semantic recall.
    givenStatusChange('archived', 'regular');

    const res = await update({ status: 'regular' });

    expect(res.status).toBe(200);
    expect(upsertRecallPoint).toHaveBeenCalledWith(THREAD_ID);
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('leaves Qdrant alone when the status did not change', async () => {
    // A rename must not cost a Mistral embedding round-trip, and re-writing
    // `status = 'regular'` over itself is not a transition.
    givenStatusChange('regular', 'regular');

    await update({ title: 'Neuer Titel' });

    expect(upsertRecallPoint).not.toHaveBeenCalled();
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('still answers 200 when the recall sync fails', async () => {
    // Fire-and-forget by design: archiving is a Postgres fact, and a Qdrant or
    // Mistral outage must not turn it into a failed request.
    givenStatusChange('regular', 'archived');
    deleteRecallPoint.mockRejectedValue(new Error('qdrant unreachable'));

    const res = await update({ status: 'archived' });

    expect(res.status).toBe(200);
  });
});

describe('delete — the Papierkorb for chat threads', () => {
  /** Every statement and side store, in the order it ran. */
  const effects: string[] = [];

  function givenDb(opts: {
    owner?: string | null;
    docId?: string | null;
    hasMessages?: boolean;
    deleted?: unknown[];
    trashed?: Record<string, unknown> | null;
  }) {
    queryMock.mockImplementation((sql: string) => {
      const s = sql.replace(/\s+/g, ' ').trim();
      effects.push(s);
      if (s.startsWith('SELECT user_id, doc_id FROM chat_threads')) {
        return Promise.resolve(
          opts.owner ? [{ user_id: opts.owner, doc_id: opts.docId ?? null }] : []
        );
      }
      if (s.startsWith('SELECT 1 FROM chat_messages')) {
        return Promise.resolve(opts.hasMessages ? [{ '?column?': 1 }] : []);
      }
      if (s.startsWith('SELECT id, title, thread_type, deleted_at, user_id')) {
        return Promise.resolve(opts.trashed ? [opts.trashed] : []);
      }
      if (s.startsWith('DELETE FROM chat_threads')) return Promise.resolve(opts.deleted ?? []);
      return Promise.resolve([]);
    });
  }

  function remove(threadId = THREAD_ID) {
    return threadsContractRouter.delete({ req, query: { threadId } } as never);
  }

  const HANDLES = [{ documentId: 'doc-a', userId: OWNER }];

  beforeEach(() => {
    effects.length = 0;
    readVectorHandles.mockReset().mockImplementation(() => {
      effects.push('read attachment handles');
      return Promise.resolve(HANDLES);
    });
    deleteVectors.mockReset().mockImplementation(() => {
      effects.push('delete attachment vectors');
      return Promise.resolve();
    });
    deleteRecallPoint.mockImplementation(() => {
      effects.push('delete recall point');
      return Promise.resolve();
    });
    reportBackgroundError.mockReset();
  });

  it('moves a thread with messages to the Papierkorb and keeps its vectors', async () => {
    givenDb({ owner: OWNER, hasMessages: true });

    const res = await remove();

    expect(res.status).toBe(200);
    expect(effects).toEqual([
      'SELECT user_id, doc_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
      'SELECT 1 FROM chat_messages WHERE thread_id = $1 LIMIT 1',
      'UPDATE chat_threads SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
      'delete recall point',
    ]);
    expect(readVectorHandles).not.toHaveBeenCalled();
    expect(deleteVectors).not.toHaveBeenCalled();
  });

  it('still hard-deletes an empty thread — nothing to restore, no Papierkorb flood', async () => {
    givenDb({ owner: OWNER, hasMessages: false, deleted: [{ id: THREAD_ID }] });

    const res = await remove();

    expect(res.status).toBe(200);
    expect(effects).toEqual([
      'SELECT user_id, doc_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
      'SELECT 1 FROM chat_messages WHERE thread_id = $1 LIMIT 1',
      'read attachment handles',
      'DELETE FROM chat_threads WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      'delete attachment vectors',
      'delete recall point',
    ]);
    expect(effects.some((e) => e.startsWith('UPDATE'))).toBe(false);
  });

  it('hard-deletes a doc chat even with messages — it never enters the Papierkorb', async () => {
    // A doc chat "delete" clears the sidebar chat; the document itself is what
    // the Papierkorb protects, and uq_chat_threads_doc_id leaves no room for a
    // trashed copy beside the fresh thread the next open creates.
    givenDb({ owner: OWNER, docId: 'doc-1', hasMessages: true, deleted: [{ id: THREAD_ID }] });

    const res = await remove();

    expect(res.status).toBe(200);
    expect(effects).toEqual([
      'SELECT user_id, doc_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
      'read attachment handles',
      'DELETE FROM chat_threads WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      'delete attachment vectors',
      'delete recall point',
    ]);
    expect(effects.some((e) => e.startsWith('UPDATE'))).toBe(false);
  });

  it('lists only trashed threads of the owner, so a hard-deleted doc chat never shows', async () => {
    givenDb({});

    await listTrashedThreads(OWNER, { limit: 10, before: null });

    expect(effects).toHaveLength(1);
    expect(effects[0]).toContain('WHERE deleted_at IS NOT NULL AND user_id = $1');
  });

  it("refuses someone else's thread without touching it", async () => {
    givenDb({ owner: 'someone-else', hasMessages: true });

    const res = await remove();

    expect(res.status).toBe(403);
    expect(effects).toHaveLength(1);
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('answers 404 for a thread that is already in the Papierkorb or not a uuid', async () => {
    givenDb({ owner: null });
    expect((await remove()).status).toBe(404);
    expect((await remove('__LOCALID_abc')).status).toBe(404);
    expect(effects).toHaveLength(1);
  });

  it('restore clears deleted_at and rebuilds the recall point', async () => {
    const deletedAt = new Date('2026-09-20T10:00:00Z');
    givenDb({
      trashed: {
        id: THREAD_ID,
        title: 'Klimaplan',
        thread_type: 'chat',
        deleted_at: deletedAt,
        user_id: OWNER,
      },
    });

    const found = await restoreThread(THREAD_ID, OWNER);

    expect(found).toEqual({
      status: 'ok',
      row: { id: THREAD_ID, title: 'Klimaplan', thread_type: 'chat', deleted_at: deletedAt },
    });
    expect(effects).toContain(
      'UPDATE chat_threads SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL'
    );
    expect(upsertRecallPoint).toHaveBeenCalledWith(THREAD_ID);
  });

  it('restore is owner-only, like delete', async () => {
    givenDb({
      trashed: {
        id: THREAD_ID,
        title: null,
        thread_type: 'chat',
        deleted_at: new Date(),
        user_id: 'someone-else',
      },
    });

    expect(await restoreThread(THREAD_ID, OWNER)).toEqual({ status: 'forbidden' });
    expect(effects.some((e) => e.startsWith('UPDATE'))).toBe(false);
    expect(upsertRecallPoint).not.toHaveBeenCalled();
  });

  it('purge reads the attachment handles, deletes the row conditionally, then Qdrant', async () => {
    const cutoff = new Date('2026-08-30T00:00:00Z');
    givenDb({ deleted: [{ id: THREAD_ID }] });

    expect(await purgeThread(THREAD_ID, cutoff)).toBe(true);

    expect(effects).toEqual([
      'read attachment handles',
      'DELETE FROM chat_threads WHERE id = $1 AND deleted_at IS NOT NULL AND ($2::timestamptz IS NULL OR deleted_at < $2) RETURNING id',
      'delete attachment vectors',
      'delete recall point',
    ]);
    expect(queryMock).toHaveBeenCalledWith(expect.stringContaining('DELETE FROM chat_threads'), [
      THREAD_ID,
      cutoff,
    ]);
    expect(deleteVectors).toHaveBeenCalledWith(THREAD_ID, HANDLES);
  });

  it('purge touches no side store when the thread was restored meanwhile (0 rows)', async () => {
    givenDb({ deleted: [] });

    expect(await purgeThread(THREAD_ID, null)).toBe(false);
    expect(deleteVectors).not.toHaveBeenCalled();
    expect(deleteRecallPoint).not.toHaveBeenCalled();
  });

  it('purge reports a failing side store and still clears the rest', async () => {
    givenDb({ deleted: [{ id: THREAD_ID }] });
    deleteVectors.mockRejectedValue(new Error('qdrant unreachable'));

    expect(await purgeThread(THREAD_ID, null)).toBe(true);
    expect(reportBackgroundError).toHaveBeenCalledWith(
      expect.any(Error),
      expect.objectContaining({ job: 'trash-purge', id: THREAD_ID, store: 'attachment_vectors' })
    );
    expect(deleteRecallPoint).toHaveBeenCalledWith(THREAD_ID);
  });

  it("a purged document's chat thread goes whether trashed or not", async () => {
    givenDb({ deleted: [{ id: THREAD_ID }] });

    expect(await purgeDocThread(THREAD_ID)).toBe(true);
    expect(effects).toEqual([
      'read attachment handles',
      'DELETE FROM chat_threads WHERE id = $1 RETURNING id',
      'delete attachment vectors',
      'delete recall point',
    ]);
  });
});
