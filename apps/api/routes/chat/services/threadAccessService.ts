import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { type ThreadId, type UserId } from '../../../utils/types/branded.js';

/**
 * Access levels for a chat thread, ordered by strength.
 *
 * - `owner`  — `chat_threads.user_id = userId`; may manage shares.
 * - `write`  — may read and send messages: explicit `permissions` entry,
 *              `is_public`, a group share with `write:true` (legacy rows
 *              without a `write` key count as writable), or — for doc-linked
 *              threads — access to the linked document.
 * - `read`   — may read the transcript only: a group share stored with
 *              `{"write": false}`, or a link share (`share_mode =
 *              'authenticated'`) for any logged-in user.
 * - `none`   — no access; callers must respond as if the thread does not exist.
 *
 * Signatures use branded `ThreadId` and `UserId` so swapping the two
 * arguments at a call site is a compile error — both are UUIDs at runtime
 * and plain string parameters would hide the bug.
 *
 * Uses separate queries to avoid PostgreSQL type ambiguity
 * (chat_threads.user_id is varchar, group_memberships.user_id is uuid).
 */
export type ThreadAccessLevel = 'none' | 'read' | 'write' | 'owner';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getThreadAccessLevel(
  threadId: ThreadId,
  userId: UserId
): Promise<ThreadAccessLevel> {
  // `chat_threads.id` is a uuid column. A non-UUID id (e.g. an unsaved local
  // sentinel like "__LOCALID_...") would make `WHERE id = $1` throw 22P02 and
  // 500 the request. There is no persisted thread to access, so deny cleanly.
  if (!UUID_RE.test(threadId)) return 'none';

  const db = getPostgresInstance();

  // Owner, explicit permissions, or public. Always returns a row when the
  // thread exists, so a missing thread short-circuits to 'none' here.
  const directRows = await db.query<{
    is_owner: boolean;
    has_write_grant: boolean;
    is_link_shared: boolean;
  }>(
    `SELECT (user_id = $2) AS is_owner,
            (permissions ? $2::text OR is_public = true) AS has_write_grant,
            (COALESCE(share_mode, 'private') = 'authenticated') AS is_link_shared
     FROM chat_threads
     WHERE id = $1
     LIMIT 1`,
    [threadId, userId]
  );
  if (directRows.length === 0) return 'none';
  const direct = directRows[0];
  if (direct?.is_owner) return 'owner';
  if (direct?.has_write_grant) return 'write';
  const linkShared = direct?.is_link_shared === true;

  // Doc-linked chat threads: defer to the linked document's access rules so
  // any user who can access the document can use its chat. Mirrors
  // checkDirectAccess() in routes/docs/documentAccess.ts.
  const docDirectAccess = await db.query(
    `SELECT 1
     FROM chat_threads ct
     INNER JOIN collaborative_documents d ON d.id = ct.doc_id
     WHERE ct.id = $1
       AND ct.doc_id IS NOT NULL
       AND (
         d.created_by = $2
         OR d.is_public = true
         OR d.share_mode = 'authenticated'
         OR d.permissions ? $2::text
       )
     LIMIT 1`,
    [threadId, userId]
  );
  if (docDirectAccess.length > 0) return 'write';

  // Group access on the chat thread itself. `bool_or` over zero matching
  // rows yields a single row with NULL — treated as "no group share".
  // Legacy shares were written with {"read":true,"write":true}; rows missing
  // either key default to true via COALESCE, preserving their behavior.
  const groupRows = await db.query<{ can_write: boolean | null }>(
    `SELECT bool_or(COALESCE((gcs.permissions->>'write')::boolean, true)) AS can_write
     FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
     WHERE gcs.content_type = 'chat_threads'
     AND gcs.content_id = $1::text
     AND gm.user_id = $2::uuid
     AND gm.is_active = TRUE
     AND COALESCE((gcs.permissions->>'read')::boolean, true) = true`,
    [threadId, userId]
  );
  const groupWrite = groupRows[0]?.can_write ?? null;
  if (groupWrite === true) return 'write';

  // Group access on the linked document (mirrors checkGroupAccess() in
  // routes/docs/documentAccess.ts, scoped to the thread's doc_id).
  const docGroupAccess = await db.query(
    `SELECT 1
     FROM chat_threads ct
     INNER JOIN group_content_shares gcs
       ON gcs.content_type IN ('collaborative_documents', 'canvas_template')
      AND gcs.content_id = ct.doc_id::text
     INNER JOIN group_memberships gm
       ON gm.group_id = gcs.group_id
      AND gm.user_id = $2::uuid
      AND gm.is_active = TRUE
     WHERE ct.id = $1
       AND ct.doc_id IS NOT NULL
       AND COALESCE((gcs.permissions->>'read')::boolean, true) = true
     LIMIT 1`,
    [threadId, userId]
  );
  if (docGroupAccess.length > 0) return 'write';

  // Read-only grants are the weakest — checked last so any writable path
  // above wins: a read-only group share, or the authenticated link share.
  if (groupWrite === false || linkShared) return 'read';

  return 'none';
}

/** True when the user may read the thread (any access level). */
export async function canAccessThread(threadId: ThreadId, userId: UserId): Promise<boolean> {
  return (await getThreadAccessLevel(threadId, userId)) !== 'none';
}

/** True when the user may send messages into the thread. */
export async function canWriteThread(threadId: ThreadId, userId: UserId): Promise<boolean> {
  const level = await getThreadAccessLevel(threadId, userId);
  return level === 'write' || level === 'owner';
}
