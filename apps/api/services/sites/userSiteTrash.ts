/**
 * Papierkorb for Websites (`user_sites`). Trash only sets `deleted_at`, so the
 * public page under the subdomain goes dark (its reader filters) while the
 * subdomain stays taken — its unique index spans trashed rows too.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  deleteTrashedRow,
  getTrashedOwnedRow,
  restoreOwnedRow,
  type OwnedRestoreResult,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

export const USER_SITE_TRASH: OwnedTrashTable = {
  table: 'user_sites',
  columns: 'id, site_title AS title',
};

/**
 * Undo a trash. One Website per user is enforced in code, not by an index:
 * a user who built a new one meanwhile gets `conflict`, never a second site.
 */
export async function restoreUserSite(userId: string, id: string): Promise<OwnedRestoreResult> {
  const found = await getTrashedOwnedRow(USER_SITE_TRASH, userId, id);
  if (typeof found === 'string') return found;
  const live = await getPostgresInstance().query<{ id: string }>(
    'SELECT id FROM user_sites WHERE user_id = $1 AND deleted_at IS NULL LIMIT 1',
    [userId]
  );
  if (live.length > 0) return 'conflict';
  return restoreOwnedRow(USER_SITE_TRASH, userId, id);
}

/** Hard-delete a trashed Website. The old delete had no side stores either. */
export async function purgeUserSite(id: string, cutoff: Date | null): Promise<boolean> {
  return (await deleteTrashedRow(USER_SITE_TRASH, id, cutoff)) !== null;
}
