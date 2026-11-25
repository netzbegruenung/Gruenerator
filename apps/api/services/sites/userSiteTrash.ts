/**
 * Papierkorb for Websites (`user_sites`). Trash only sets `deleted_at`, so the
 * public page, which is served from `published_snapshot`, goes dark (its reader
 * filters) and the subdomain is free again — its unique index covers live rows
 * only. A restore comes back as a draft (snapshot dropped, not published); one
 * whose subdomain was taken meanwhile fails with 23505 and answers `conflict`.
 */
import { SITES_PER_ACCOUNT_MAX } from '@gruenerator/contracts';
import { sql } from 'drizzle-orm';
import { type PoolClient } from 'pg';

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
  type Trashed,
} from '../trash/ownedRowTrash.js';
import { type TrashCursor, trashKeysetWhere, trashOrderBy } from '../trash/trashCursor.js';

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
 * Who may restore, and so who sees the trashed site in the Papierkorb: the same admin rule as
 * `requireSiteRole`, but read on the trashed row (that query filters `deleted_at IS NULL`).
 * Admin is a `site_members` admin or an admin of the live, non-archived project the site belongs
 * to; `moderation = 'removed'` caps it, as there. One expression for restore, list and get —
 * `site` is the `user_sites` alias, `user` the placeholder holding the person's id.
 */
const siteAdminExpr = (site: string, user: string) => `
       ${site}.moderation <> 'removed' AND (
         EXISTS (SELECT 1 FROM site_members sm
                  WHERE sm.site_id = ${site}.id AND sm.user_id = ${user} AND sm.role = 'admin')
         OR EXISTS (SELECT 1 FROM group_memberships gm
                     INNER JOIN groups g ON g.id = gm.group_id
                      WHERE gm.group_id = ${site}.group_id AND gm.user_id = ${user}
                        AND gm.is_active = TRUE AND gm.role = 'admin'
                        AND g.deleted_at IS NULL AND g.is_system = FALSE
                        AND g.archived_at IS NULL)
       )`;

const TRASHED_SITE_ACCESS_SQL = `
SELECT us.user_id, us.group_id,
${siteAdminExpr('us', '$2')} AS is_admin
  FROM user_sites us
 WHERE us.id = $1 AND us.deleted_at IS NOT NULL`;

type TrashedSiteRow = Trashed<{ title: string }>;

/** Papierkorb list: every trashed site the person could restore, not only the ones they made. */
export function listTrashedUserSites(
  userId: string,
  opts: { limit: number; before: TrashCursor | null }
): Promise<TrashedSiteRow[]> {
  const params: unknown[] = [userId];
  const keyset = trashKeysetWhere('us.deleted_at', 'us.id', opts.before, params);
  params.push(opts.limit);
  return getPostgresInstance().query<TrashedSiteRow>(
    `SELECT us.id, us.site_title AS title, us.deleted_at FROM user_sites us
     WHERE us.deleted_at IS NOT NULL AND ${siteAdminExpr('us', '$1')} AND ${keyset}
     ORDER BY ${trashOrderBy('us.deleted_at', 'us.id')}
     LIMIT $${params.length}`,
    params
  );
}

/** One trashed site for an admin of it; `forbidden` for anyone else. */
export async function getTrashedUserSite(
  userId: string,
  id: string
): Promise<TrashedSiteRow | 'not_found' | 'forbidden'> {
  if (!isRowId(id)) return 'not_found';
  const rows = await getPostgresInstance().query<TrashedSiteRow & { is_admin: boolean }>(
    `SELECT us.id, us.site_title AS title, us.deleted_at,
${siteAdminExpr('us', '$2')} AS is_admin
       FROM user_sites us
      WHERE us.id = $1 AND us.deleted_at IS NOT NULL`,
    [id, userId]
  );
  if (rows.length === 0) return 'not_found';
  const { is_admin, ...row } = rows[0];
  return is_admin ? row : 'forbidden';
}

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

type SiteQuery = (text: string, params: unknown[]) => Promise<unknown>;

/** What lives beside a site row: its Yjs draft and its shares into projects (no FK to either). */
async function removeSiteSideStores(query: SiteQuery, id: string): Promise<void> {
  await query('DELETE FROM yjs_document_updates WHERE document_id = $1', [id]);
  await query('DELETE FROM yjs_document_snapshots WHERE document_id = $1', [id]);
  await query(
    "DELETE FROM group_content_shares WHERE content_type = 'user_sites' AND content_id = $1",
    [id]
  );
}

/**
 * Hard-delete a trashed Website, its draft (the Yjs rows of room `site-<id>`, keyed by
 * the bare id) and its project shares. Trash and restore leave those rows alone, so a restored
 * site keeps its draft.
 */
export async function purgeUserSite(id: string, cutoff: Date | null): Promise<boolean> {
  if ((await deleteTrashedRow(USER_SITE_TRASH, id, cutoff)) === null) return false;
  await closeSiteRooms([id]);
  const db = getPostgresInstance();
  await removeSiteSideStores((text, params) => db.query(text, params), id);
  return true;
}

/**
 * Account deletion, run before the profile row goes (`user_sites.user_id` cascades from it, so
 * a site must be handed over first). Personal sites: where the person is the only admin, the
 * longest-standing other member becomes admin, and with nobody left the site is purged; one they
 * created that lives on passes `user_id` to the oldest admin. Project sites live on with
 * `user_id = NULL`. Trashed rows count like live ones. Returns the purged ids — the caller
 * closes their rooms after the commit.
 */
export async function reassignSitesBeforeAccountDeletion(
  userId: string,
  tx: Pick<PoolClient, 'query'>
): Promise<string[]> {
  const purged: string[] = [];
  const purge = async (id: string) => {
    await tx.query('DELETE FROM user_sites WHERE id = $1', [id]);
    await removeSiteSideStores((text, params) => tx.query(text, params), id);
    purged.push(id);
  };

  const sole = await tx.query<{ site_id: string }>(
    `SELECT sm.site_id FROM site_members sm
       INNER JOIN user_sites us ON us.id = sm.site_id
      WHERE sm.user_id = $1 AND sm.role = 'admin' AND us.group_id IS NULL
        AND NOT EXISTS (SELECT 1 FROM site_members o
                         WHERE o.site_id = sm.site_id AND o.role = 'admin' AND o.user_id <> $1)`,
    [userId]
  );
  for (const { site_id } of sole.rows) {
    const promoted = await tx.query(
      `UPDATE site_members SET role = 'admin'
        WHERE site_id = $1 AND user_id = (
          SELECT user_id FROM site_members WHERE site_id = $1 AND user_id <> $2
           ORDER BY created_at, user_id LIMIT 1)
        RETURNING user_id`,
      [site_id, userId]
    );
    if (promoted.rows.length === 0) await purge(site_id);
  }

  const created = await tx.query<{ id: string }>(
    'SELECT id FROM user_sites WHERE user_id = $1 AND group_id IS NULL',
    [userId]
  );
  for (const { id } of created.rows) {
    const heir = await tx.query<{ user_id: string }>(
      `SELECT user_id FROM site_members WHERE site_id = $1 AND role = 'admin' AND user_id <> $2
        ORDER BY created_at, user_id LIMIT 1`,
      [id, userId]
    );
    if (heir.rows[0]) {
      await tx.query('UPDATE user_sites SET user_id = $2 WHERE id = $1', [
        id,
        heir.rows[0].user_id,
      ]);
    } else {
      await purge(id);
    }
  }

  await tx.query(
    'UPDATE user_sites SET user_id = NULL WHERE user_id = $1 AND group_id IS NOT NULL',
    [userId]
  );
  return purged;
}
