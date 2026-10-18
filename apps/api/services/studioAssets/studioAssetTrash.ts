/**
 * Papierkorb for user-uploaded Sticker and Hintergründe (`studio_assets`).
 * Trash only sets `deleted_at`; the purge removes the row, then likes,
 * favorites and — unless the asset was ever public and not removed by
 * moderation — the image file.
 */
import { type StudioAssetRow } from '../../database/schema/studioAssets.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deleteCommentsForEntity } from '../entityComments/entityCommentsCleanup.js';
import { deleteFavoritesForEntity } from '../entityFavorites/EntityFavoritesService.js';
import { deleteLikesForEntity } from '../entityLikes/EntityLikesService.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import {
  deleteTrashedRow,
  isRowId,
  purgeSideStore,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

export const STUDIO_ASSET_TRASH: OwnedTrashTable = {
  table: 'studio_assets',
  columns: 'id, title, kind',
};

const SHARE_TOKEN_RE = /^\/api\/share\/([^/]+)\/download$/;

/** Move the caller's own Sticker/Hintergründe to the Papierkorb; returns the ids actually moved. */
export async function trashStudioAssets(userId: string, ids: string[]): Promise<string[]> {
  const valid = ids.filter(isRowId);
  if (valid.length === 0) return [];
  const rows = await getPostgresInstance().query<{ id: string }>(
    `UPDATE studio_assets SET deleted_at = now()
     WHERE user_id = $1 AND id = ANY($2::uuid[]) AND deleted_at IS NULL
     RETURNING id`,
    [userId, valid]
  );
  return rows.map((r) => r.id);
}

/**
 * Hard-delete a trashed asset, then its likes and favorites (polymorphic, no
 * FK). The file stays when the asset was ever public: other users' saved
 * designs reference its URL. A removed asset loses its file regardless — the
 * serving block lives on this row, so the file must not outlive it.
 */
export async function purgeStudioAsset(id: string, cutoff: Date | null): Promise<boolean> {
  const row = await deleteTrashedRow<
    Pick<StudioAssetRow, 'id' | 'user_id' | 'src' | 'was_public' | 'moderation'>
  >(STUDIO_ASSET_TRASH, id, cutoff, 'id, user_id, src, was_public, moderation');
  if (!row) return false;

  await purgeSideStore('studio_asset', id, 'entity_likes', () =>
    deleteLikesForEntity('studio_asset', id)
  );
  await purgeSideStore('studio_asset', id, 'entity_comments', () =>
    deleteCommentsForEntity('studio_asset', id)
  );
  await purgeSideStore('studio_asset', id, 'entity_favorites', () =>
    deleteFavoritesForEntity('studio_asset', id)
  );
  if (!row.was_public || row.moderation === 'removed') {
    await purgeSideStore('studio_asset', id, 'media', async () => {
      const token = SHARE_TOKEN_RE.exec(row.src)?.[1];
      if (token) await getSharedMediaService().purgeInternalShare(token, row.user_id);
    });
  }
  return true;
}
