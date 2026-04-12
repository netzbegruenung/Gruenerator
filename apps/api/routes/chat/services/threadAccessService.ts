import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { type ThreadId, type UserId } from '../../../utils/types/branded.js';

/**
 * Check if a user can access a chat thread.
 *
 * Signature uses branded `ThreadId` and `UserId` so swapping the two
 * arguments at a call site is a compile error — both are UUIDs at runtime
 * and plain string parameters would hide the bug. Access is granted if
 * the user is the owner, is listed in `permissions`, the thread is public,
 * or a group the user is a member of has the thread shared to it.
 *
 * Uses separate queries to avoid PostgreSQL type ambiguity
 * (chat_threads.user_id is varchar, group_memberships.user_id is uuid).
 */
export async function canAccessThread(threadId: ThreadId, userId: UserId): Promise<boolean> {
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

  // Check group access separately to avoid type conflicts
  const groupAccess = await db.query(
    `SELECT 1 FROM group_content_shares gcs
     INNER JOIN group_memberships gm ON gm.group_id = gcs.group_id
     WHERE gcs.content_type = 'chat_threads'
     AND gcs.content_id = $1::text
     AND gm.user_id = $2::uuid
     LIMIT 1`,
    [threadId, userId]
  );
  return groupAccess.length > 0;
}
