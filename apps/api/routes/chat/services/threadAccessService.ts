import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { type ThreadId, type UserId } from '../../../utils/types/branded.js';

/**
 * Check if a user can access a chat thread.
 *
 * Signature uses branded `ThreadId` and `UserId` so swapping the two
 * arguments at a call site is a compile error — both are UUIDs at runtime
 * and plain string parameters would hide the bug. Access is granted if
 * the user is the owner, is listed in `permissions`, the thread is public,
 * a group the user is a member of has the thread shared to it, or — for
 * doc-linked chat threads — the user can access the linked document.
 *
 * Uses separate queries to avoid PostgreSQL type ambiguity
 * (chat_threads.user_id is varchar, group_memberships.user_id is uuid).
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function canAccessThread(threadId: ThreadId, userId: UserId): Promise<boolean> {
  // `chat_threads.id` is a uuid column. A non-UUID id (e.g. an unsaved local
  // sentinel like "__LOCALID_...") would make `WHERE id = $1` throw 22P02 and
  // 500 the request. There is no persisted thread to access, so deny cleanly.
  if (!UUID_RE.test(threadId)) return false;

  const db = getPostgresInstance();

  // Check owner, permissions, or public
  const directAccess = await db.query(
    `SELECT 1 FROM chat_threads
     WHERE id = $1
     AND (user_id = $2 OR permissions ? $2::text OR is_public = true)
     LIMIT 1`,
    [threadId, userId]
  );
  if (directAccess.length > 0) return true;

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
  if (docDirectAccess.length > 0) return true;

  // Group access on the chat thread itself
  const groupAccess = await db.query(
    `SELECT 1 FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
     WHERE gcs.content_type = 'chat_threads'
     AND gcs.content_id = $1::text
     AND gm.user_id = $2::uuid
     LIMIT 1`,
    [threadId, userId]
  );
  if (groupAccess.length > 0) return true;

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
  return docGroupAccess.length > 0;
}
