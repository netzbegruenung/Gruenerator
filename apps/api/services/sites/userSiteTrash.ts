/**
 * Papierkorb for Websites (`user_sites`). Trash only sets `deleted_at`, so the
 * public page, which is served from `published_snapshot`, goes dark (its reader
 * filters) and the subdomain is free again — its unique index covers live rows
 * only. A restore comes back as a draft (snapshot dropped, not published); one
 * whose subdomain was taken meanwhile fails with 23505 and answers `conflict`.
 */
import { SITES_PER_ACCOUNT_MAX } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { closeCollabRooms } from '../collab/hocuspocusInternal.js';
import {
  deleteTrashedRow,
  getTrashedOwnedRow,
  trashOwnedRow,
  restoreOwnedRow,
  type OwnedRestoreResult,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

import { siteRoom } from './siteDraftDoc.js';

export const USER_SITE_TRASH: OwnedTrashTable = {
  table: 'user_sites',
  columns: 'id, site_title AS title',
};

/** Drop every open editor connection to these Websites' draft rooms (never throws). */
export async function closeSiteRooms(siteIds: string[]): Promise<void> {
  await closeCollabRooms(siteIds.map(siteRoom));
}

/** Trash a live Website and cut its open editors off. */
export async function trashUserSite(userId: string, id: string) {
  const result = await trashOwnedRow(USER_SITE_TRASH, userId, id);
  if (result === 'ok') void closeSiteRooms([id]);
  return result;
}

/**
 * Undo a trash. An account already at SITES_PER_ACCOUNT_MAX live Websites gets
 * `conflict`; the count is not locked against a parallel create, so a race can
 * overshoot the soft limit by one, never break a row.
 */
export async function restoreUserSite(userId: string, id: string): Promise<OwnedRestoreResult> {
  const found = await getTrashedOwnedRow(USER_SITE_TRASH, userId, id);
  if (typeof found === 'string') return found;
  const live = await getPostgresInstance().query<{ n: number }>(
    'SELECT count(*)::int AS n FROM user_sites WHERE user_id = $1 AND deleted_at IS NULL',
    [userId]
  );
  if (Number(live[0]?.n ?? 0) >= SITES_PER_ACCOUNT_MAX) return 'conflict';
  await getPostgresInstance().query(
    `UPDATE user_sites SET is_published = false, published_snapshot = NULL
     WHERE id = $1 AND user_id = $2 AND deleted_at IS NOT NULL`,
    [id, userId]
  );
  return restoreOwnedRow(USER_SITE_TRASH, userId, id);
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
