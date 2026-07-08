import { getContractsClient } from '@gruenerator/shared/api';

import { uploadBlobToMediaLibrary } from './mediaUploadService';

/**
 * Persist a rendered canvas image as the document's gallery thumbnail.
 * Single implementation for all triggers — studio mint, editor download, and
 * chat sharepic edits (via GlobalChatProvider) — distinguished by uploadSource.
 */
export async function updateCanvasThumbnail(
  canvasId: string,
  dataUrl: string,
  uploadSource = 'canvas-thumbnail'
): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  const thumbnailUrl = await uploadBlobToMediaLibrary(blob, {
    filename: `sharepic-thumbnail-${canvasId}.png`,
    uploadSource,
  });
  if (!thumbnailUrl) return;
  const result = await getContractsClient().canvas.update({
    params: { id: canvasId },
    body: { thumbnail_url: thumbnailUrl },
  });
  if (result.status !== 200) {
    throw new Error(`Failed to update canvas thumbnail (HTTP ${result.status})`);
  }
}
