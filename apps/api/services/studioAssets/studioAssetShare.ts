/**
 * The `shared_media` row behind a Sticker/Hintergrund (upload source
 * 'studio-asset'). The `studio_assets` row owns the file: it decides whether
 * the file may go and whether it is still served.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';

import type { SharedMediaRow } from '../../types/media.js';

export const STUDIO_ASSET_SHARE_DELETE_MESSAGE =
  'Dieses Bild gehört zu einem Sticker/Hintergrund – lösche es dort.';

/**
 * True when moderation removed the asset this share belongs to. A removed
 * file is not served to anyone, the owner included; 'hidden' keeps serving.
 * Trashed assets count too: a removal must not lift because the owner trashed
 * the asset.
 */
export async function isRemovedStudioAssetShare(
  share: Pick<SharedMediaRow, 'id' | 'upload_source'>
): Promise<boolean> {
  if (share.upload_source !== 'studio-asset') return false;
  const rows = await getPostgresInstance().query<{ removed: boolean }>(
    `SELECT TRUE AS removed FROM studio_assets
     WHERE media_id = $1 AND moderation = 'removed' LIMIT 1`,
    [share.id]
  );
  return rows.length > 0;
}
