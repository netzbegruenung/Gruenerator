/**
 * Papierkorb for chat threads: trash, restore, purge.
 *
 * A trashed thread keeps its row, messages and attachments; it only carries
 * `deleted_at` and loses its `chat_thread_recall` point, so neither the list
 * nor semantic recall can hand it out. Every reader of `chat_threads` filters
 * `deleted_at IS NULL` (`services/trash/trashReaders.vitest.ts`). Only
 * {@link purgeThread} deletes the row, and with it the attachment vectors.
 *
 * Delete rights are the owner's (`chat_threads.user_id`); restore and
 * purge-now ask exactly that.
 */
import { type ChatThread } from '../../../database/schema/chat.js';
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import {
  deleteThreadRecallPoint,
  upsertThreadRecallPoint,
} from '../../../services/chat/threadRecallEmbeddingService.js';
import { type QueryRunner } from '../../../services/docs/CollaborativeDocumentService.js';
import {
  type TrashCursor,
  trashKeysetWhere,
  trashOrderBy,
} from '../../../services/trash/trashCursor.js';
import { createLogger } from '../../../utils/logger.js';
import { reportBackgroundError } from '../../../utils/reportBackgroundError.js';

import {
  deleteAttachmentVectors,
  readThreadAttachmentVectorHandles,
} from './attachmentPersistenceService.js';

const log = createLogger('threadTrash');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type TrashedThreadRow = Pick<ChatThread, 'id' | 'title' | 'thread_type'> & {
  deleted_at: Date;
};

export type TrashedThreadLookup =
  { status: 'not_found' } | { status: 'forbidden' } | { status: 'ok'; row: TrashedThreadRow };

/**
 * `deleted` = the thread was removed outright instead of trashed:
 * - it had no messages — nothing to restore, and the client's empty-thread
 *   cleanup would otherwise flood the Papierkorb;
 * - it belongs to a document (`doc_id`) — deleting a doc chat clears it, and
 *   `uq_chat_threads_doc_id` leaves no room for a trashed copy beside the
 *   fresh thread `ensureDocChatThread` creates on the next open.
 */
export type TrashThreadResult = 'trashed' | 'deleted' | 'not_found' | 'forbidden';

export async function trashThread(threadId: string, userId: string): Promise<TrashThreadResult> {
  if (!UUID_RE.test(threadId)) return 'not_found';
  const db = getPostgresInstance();
  const rows = await db.query<{ user_id: string; doc_id: string | null }>(
    'SELECT user_id, doc_id FROM chat_threads WHERE id = $1 AND deleted_at IS NULL',
    [threadId]
  );
  if (rows.length === 0) return 'not_found';
  if (rows[0].user_id !== userId) return 'forbidden';

  const hardDelete =
    rows[0].doc_id !== null ||
    (await db.query('SELECT 1 FROM chat_messages WHERE thread_id = $1 LIMIT 1', [threadId]))
      .length === 0;
  if (hardDelete) {
    await removeThread(
      threadId,
      'DELETE FROM chat_threads WHERE id = $1 AND deleted_at IS NULL RETURNING id',
      [threadId]
    );
    return 'deleted';
  }

  await db.query(
    'UPDATE chat_threads SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [threadId]
  );
  await deleteThreadRecallPoint(threadId);
  return 'trashed';
}

/** A trashed thread the user may restore or purge. */
export async function getTrashedThread(
  threadId: string,
  userId: string
): Promise<TrashedThreadLookup> {
  if (!UUID_RE.test(threadId)) return { status: 'not_found' };
  const rows = await getPostgresInstance().query<TrashedThreadRow & { user_id: string }>(
    `SELECT id, title, thread_type, deleted_at, user_id FROM chat_threads
     WHERE id = $1 AND deleted_at IS NOT NULL`,
    [threadId]
  );
  if (rows.length === 0) return { status: 'not_found' };
  const { user_id, ...row } = rows[0];
  if (user_id !== userId) return { status: 'forbidden' };
  return { status: 'ok', row };
}

/**
 * Undo {@link trashThread}. The recall point is rebuilt fire-and-forget, like
 * unarchiving: `upsertThreadRecallPoint` refuses archived threads by itself.
 */
export async function restoreThread(
  threadId: string,
  userId: string
): Promise<TrashedThreadLookup> {
  const found = await getTrashedThread(threadId, userId);
  if (found.status !== 'ok') return found;

  await getPostgresInstance().query(
    'UPDATE chat_threads SET deleted_at = NULL WHERE id = $1 AND deleted_at IS NOT NULL',
    [threadId]
  );
  upsertThreadRecallPoint(threadId).catch((err) =>
    log.warn(`[threadTrash] Recall point rebuild failed for thread ${threadId}:`, err)
  );
  return found;
}

export async function listTrashedThreads(
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<TrashedThreadRow[]> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('deleted_at', 'id', opts.before, params);
  params.push(opts.limit);
  return getPostgresInstance().query<TrashedThreadRow>(
    `SELECT id, title, thread_type, deleted_at FROM chat_threads
     WHERE deleted_at IS NOT NULL AND user_id = $1 AND ${keyset}
     ORDER BY ${trashOrderBy('deleted_at', 'id')}
     LIMIT $${params.length}`,
    params
  );
}

export async function listExpiredThreads(
  cutoff: Date,
  limit: number
): Promise<Array<{ id: string; userId: string | null }>> {
  const rows = await getPostgresInstance().query<{ id: string; user_id: string }>(
    `SELECT id, user_id FROM chat_threads
     WHERE deleted_at IS NOT NULL AND deleted_at < $1
     ORDER BY deleted_at LIMIT $2`,
    [cutoff, limit]
  );
  return rows.map((r) => ({ id: r.id, userId: r.user_id }));
}

/**
 * Hard-delete a trashed thread. Messages and attachment rows cascade; the
 * attachment vectors and the recall point live in Qdrant and go afterwards.
 * `cutoff` null purges any trashed row (purge-now); the worker passes its
 * retention cutoff.
 */
export function purgeThread(threadId: string, cutoff: Date | null): Promise<boolean> {
  return removeThread(
    threadId,
    `DELETE FROM chat_threads
     WHERE id = $1 AND deleted_at IS NOT NULL AND ($2::timestamptz IS NULL OR deleted_at < $2)
     RETURNING id`,
    [threadId, cutoff]
  );
}

/**
 * Delete a purged document's chat thread (`chat_threads.doc_id`, no FK),
 * trashed or not — the document it belongs to is gone for good. `runQuery` is
 * the document purge's own runner, so the thread's statements cannot escape it.
 */
export function purgeDocThread(threadId: string, runQuery?: QueryRunner): Promise<boolean> {
  return removeThread(
    threadId,
    'DELETE FROM chat_threads WHERE id = $1 RETURNING id',
    [threadId],
    runQuery
  );
}

/**
 * Read the attachment handles, run the conditional DELETE (0 rows → nothing
 * else is touched), then the Qdrant side stores best-effort — the row cannot
 * come back, so a failure is reported, never thrown.
 */
async function removeThread(
  threadId: string,
  deleteSql: string,
  params: unknown[],
  runQuery: QueryRunner = (sql, p) => getPostgresInstance().query(sql, p)
): Promise<boolean> {
  const attachments = await readThreadAttachmentVectorHandles(threadId, runQuery);

  const deleted = await runQuery<{ id: string }>(deleteSql, params);
  if (deleted.length === 0) return false;

  const sideStore = async (store: string, work: () => Promise<unknown>): Promise<void> => {
    try {
      await work();
    } catch (error) {
      reportBackgroundError(error, {
        job: 'trash-purge',
        kind: 'chat_thread',
        id: threadId,
        store,
      });
    }
  };
  await sideStore('attachment_vectors', () => deleteAttachmentVectors(threadId, attachments));
  await sideStore('chat_thread_recall', () => deleteThreadRecallPoint(threadId));
  return true;
}
