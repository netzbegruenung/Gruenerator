/**
 * Read-only group queries for chat tools — user-scoped list/find helpers shared
 * by the chat loop and the `groups` tool. Write operations (create / join by
 * token) live in the sibling `groupMutations.ts`.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';

import type { GroupAudience } from '@gruenerator/contracts';

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

/** Was das `groups`-Werkzeug über EIN Projekt sagt — nur für Mitglieder. */
export interface GroupDetailRow {
  id: string;
  name: string;
  description: string | null;
  slug_suffix: string | null;
  is_public: boolean;
  audience: GroupAudience;
  group_type: 'standard' | 'personal';
  role: string;
  /** Admin-Rolle ODER Gründer*in — dieselbe Regel wie `getDetails` im Router. */
  isAdmin: boolean;
  member_count: number;
}

/**
 * Ein Projekt samt Rolle der Person — `null`, wenn es das Projekt nicht gibt
 * ODER die Person kein Mitglied ist. Die beiden Fälle werden absichtlich nicht
 * unterschieden: das Werkzeug darf einer Nicht-Mitgliedschaft nicht verraten,
 * dass eine Gruppen-ID existiert.
 */
export async function getGroupForMember(
  groupId: string,
  userId: string
): Promise<GroupDetailRow | null> {
  const row = (await db.queryOne(
    `SELECT g.id, g.name, g.description, g.slug_suffix, g.is_public, g.audience,
            g.group_type, g.created_by, gm.role,
            (SELECT COUNT(*)::int FROM group_memberships m WHERE m.group_id = g.id AND m.is_active = TRUE) AS member_count
     FROM group_memberships gm
     INNER JOIN groups g ON g.id = gm.group_id
     WHERE gm.group_id = $1 AND gm.user_id = $2 AND gm.is_active = TRUE AND g.is_active = TRUE`,
    [groupId, userId],
    { table: 'group_memberships' }
  )) as
    | (Omit<GroupDetailRow, 'isAdmin' | 'is_public' | 'audience' | 'group_type'> & {
        created_by: string | null;
        is_public: boolean | null;
        audience: GroupAudience | null;
        group_type: 'standard' | 'personal' | null;
      })
    | null;
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? null,
    slug_suffix: row.slug_suffix ?? null,
    is_public: row.is_public ?? false,
    audience: row.audience ?? 'all',
    group_type: row.group_type ?? 'standard',
    role: row.role,
    isAdmin: row.role === 'admin' || row.created_by === userId,
    member_count: Number(row.member_count),
  };
}

/** Wie viele Inhalte (aller Typen) mit dem Projekt geteilt sind. */
export async function countGroupContent(groupId: string): Promise<number> {
  const row = (await db.queryOne(
    'SELECT COUNT(*)::int AS n FROM group_content_shares WHERE group_id = $1',
    [groupId],
    { table: 'group_content_shares' }
  )) as { n: number } | null;
  return row?.n ?? 0;
}
