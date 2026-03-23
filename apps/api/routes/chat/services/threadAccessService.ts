import { getPostgresInstance } from '../../../database/services/PostgresService.js';

/**
 * Check if a user can access a chat thread.
 * Uses separate queries to avoid PostgreSQL type ambiguity
 * (chat_threads.user_id is varchar, group_memberships.user_id is uuid).
 */
export async function canAccessThread(threadId: string, userId: string): Promise<boolean> {
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
     AND gcs.content_id = $1::uuid
     AND gm.user_id = $2::uuid
     LIMIT 1`,
    [threadId, userId]
  );
  return groupAccess.length > 0;
}
