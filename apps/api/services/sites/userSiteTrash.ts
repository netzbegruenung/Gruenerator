/**
 * Papierkorb for Websites (`user_sites`). Trash only sets `deleted_at`, so the
 * public page, which is served from `published_snapshot`, goes dark (its reader
 * filters) and the subdomain is free again — its unique index covers live rows
 * only. A restore comes back as a draft (snapshot dropped, not published); one
 * whose subdomain was taken meanwhile fails with 23505 and answers `conflict`.
 */
import { SITES_PER_ACCOUNT_MAX } from '@gruenerator/contracts';
import { sql } from 'drizzle-orm';

import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { closeCollabRooms } from '../collab/hocuspocusInternal.js';
import {
  deleteTrashedRow,
  isRowId,
  isUniqueViolation,
  type OwnedRestoreResult,
  type OwnedTrashResult,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

import { requireSiteRole } from './siteAccess.js';
import { siteRoom } from './siteDraftDoc.js';

/** Advisory-lock keys that serialise count and insert of live sites (create and restore). */
export const siteAccountLockKey = (userId: string) => `user_sites:${userId}`;
export const siteGroupLockKey = (groupId: string) => `user_sites_group:${groupId}`;

export const USER_SITE_TRASH: OwnedTrashTable = {
  table: 'user_sites',
  columns: 'id, site_title AS title',
};

/** Drop every open editor connection to these Websites' draft rooms (never throws). */
export async function closeSiteRooms(siteIds: string[]): Promise<void> {
  await closeCollabRooms(siteIds.map(siteRoom));
}

/**
 * Trash a live Website (admin only) and cut its open editors off. `userId` is whoever acts, not
 * the creator: a co-admin or a project admin trashes too.
 */
export async function trashUserSite(actorId: string, id: string): Promise<OwnedTrashResult> {
  if (!isRowId(id)) return 'not_found';
  const access = await requireSiteRole(id, actorId, 'admin');
  if (typeof access === 'string') return access;
  await getPostgresInstance().query(
    'UPDATE user_sites SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL',
    [id]
  );
  void closeSiteRooms([id]);
  return 'ok';
}

interface TrashedSiteAccess {
  user_id: string | null;
  group_id: string | null;
  is_admin: boolean;
}

/**
 * Who may restore: the same admin rule as `requireSiteRole`, but read on the trashed row
 * (that query filters `deleted_at IS NULL`). Admin is a `site_members` admin or an admin of the
 * live, non-archived project the site belongs to; `moderation = 'removed'` caps it, as there.
 */
const TRASHED_SITE_ACCESS_SQL = `
SELECT us.user_id, us.group_id,
       us.moderation <> 'removed' AND (
         EXISTS (SELECT 1 FROM site_members sm
                  WHERE sm.site_id = us.id AND sm.user_id = $2 AND sm.role = 'admin')
         OR EXISTS (SELECT 1 FROM group_memberships gm
                     INNER JOIN groups g ON g.id = gm.group_id
                      WHERE gm.group_id = us.group_id AND gm.user_id = $2
                        AND gm.is_active = TRUE AND gm.role = 'admin'
                        AND g.deleted_at IS NULL AND g.is_system = FALSE
                        AND g.archived_at IS NULL)
       ) AS is_admin
  FROM user_sites us
 WHERE us.id = $1 AND us.deleted_at IS NOT NULL`;

/**
 * Undo a trash (admin only). The quota is the creator's personal one, or the project's for a
 * project site, whoever restores. Count and update share the advisory lock of the create, so a
 * parallel create cannot slip past the limit. A subdomain someone took meanwhile is the partial
 * unique index's 23505 and answers `conflict`.
 */
export async function restoreUserSite(actorId: string, id: string): Promise<OwnedRestoreResult> {
  if (!isRowId(id)) return 'not_found';
  const found = await getPostgresInstance().query<TrashedSiteAccess>(TRASHED_SITE_ACCESS_SQL, [
    id,
    actorId,
  ]);
  const site = found[0];
  if (!site) return 'not_found';
  if (!site.is_admin) return 'forbidden';

  try {
    return await getDrizzleInstance().transaction(async (tx) => {
      if (site.group_id) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${siteGroupLockKey(site.group_id)}))`
        );
      } else if (site.user_id) {
        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${siteAccountLockKey(site.user_id)}))`
        );
      }
      const live = site.group_id
        ? await tx.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM user_sites
                WHERE group_id = ${site.group_id} AND deleted_at IS NULL`
          )
        : await tx.execute<{ n: number }>(
            sql`SELECT count(*)::int AS n FROM user_sites
                WHERE user_id = ${site.user_id} AND group_id IS NULL AND deleted_at IS NULL`
          );
      if (Number(live.rows[0]?.n ?? 0) >= SITES_PER_ACCOUNT_MAX) return 'conflict' as const;
      // Back as a draft: the snapshot and the published flag are dropped with the trash.
      const restored = await tx.execute(
        sql`UPDATE user_sites
            SET deleted_at = NULL, is_published = false, published_snapshot = NULL
            WHERE id = ${id} AND deleted_at IS NOT NULL RETURNING id`
      );
      return restored.rows.length > 0 ? ('ok' as const) : ('not_found' as const);
    });
  } catch (error) {
    if (isUniqueViolation(error)) return 'conflict';
    throw error;
  }
}

/**
 * Hard-delete a trashed Website and its draft (the Yjs rows of room `site-<id>`, keyed by
 * the bare id). Trash and restore leave those rows alone, so a restored site keeps its draft.
 */
export async function purgeUserSite(id: string, cutoff: Date | null): Promise<boolean> {
  if ((await deleteTrashedRow(USER_SITE_TRASH, id, cutoff)) === null) return false;
  await closeSiteRooms([id]);
  const db = getPostgresInstance();
  await db.query('DELETE FROM yjs_document_updates WHERE document_id = $1', [id]);
  await db.query('DELETE FROM yjs_document_snapshots WHERE document_id = $1', [id]);
  return true;
}
