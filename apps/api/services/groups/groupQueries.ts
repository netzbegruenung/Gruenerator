/**
 * Read-only group queries for chat tools — user-scoped list/find helpers shared
 * by the chat loop and the `groups` tool. Write operations (create / join by
 * token) live in the sibling `groupMutations.ts`.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';

export interface UserGroupRow {
  id: string;
  name: string;
  slug_suffix: string | null;
  role: string;
  member_count: number;
}

const db = getPostgresInstance();

/** The caller's active group memberships, with role + member count, newest first. */
export async function listUserGroups(userId: string, limit = 30): Promise<UserGroupRow[]> {
  return (await db.query(
    `SELECT g.id, g.name, g.slug_suffix, gm.role,
            (SELECT COUNT(*)::int FROM group_memberships m WHERE m.group_id = g.id AND m.is_active = TRUE) AS member_count
     FROM group_memberships gm
     INNER JOIN groups g ON g.id = gm.group_id
     WHERE gm.user_id = $1 AND gm.is_active = TRUE AND g.is_active = TRUE
     ORDER BY g.updated_at DESC NULLS LAST
     LIMIT $2`,
    [userId, limit]
  )) as UserGroupRow[];
}

/**
 * Find groups the caller can see by name — their OWN groups plus public ones.
 * Used to resolve "teile das mit meiner Klima-Gruppe" or "finde die Gruppe X".
 */
export async function findGroups(
  userId: string,
  query: string,
  limit = 15
): Promise<UserGroupRow[]> {
  const pattern = likeContainsPattern(query);
  return (await db.query(
    `SELECT g.id, g.name, g.slug_suffix,
            COALESCE(gm.role, '') AS role,
            (SELECT COUNT(*)::int FROM group_memberships m WHERE m.group_id = g.id AND m.is_active = TRUE) AS member_count
     FROM groups g
     LEFT JOIN group_memberships gm ON gm.group_id = g.id AND gm.user_id = $1 AND gm.is_active = TRUE
     WHERE g.is_active = TRUE
       AND g.name ILIKE $2
       AND (g.is_public = TRUE OR gm.user_id IS NOT NULL)
     ORDER BY (gm.user_id IS NOT NULL) DESC, g.name ASC
     LIMIT $3`,
    [userId, pattern, limit]
  )) as UserGroupRow[];
}
