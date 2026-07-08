import { getContractsClient } from '@gruenerator/shared/api';

import { uploadBlobToMediaLibrary } from './mediaUploadService';

/**
 * Persist a rendered canvas image as the document's gallery thumbnail.
 * Mirrors GlobalChatProvider.updateSharepicThumbnail (chat-created canvases);
 * studio flows call this after mint and on export.
 */
export async function updateCanvasThumbnail(canvasId: string, dataUrl: string): Promise<void> {
  const blob = await (await fetch(dataUrl)).blob();
  const thumbnailUrl = await uploadBlobToMediaLibrary(blob, {
    filename: `sharepic-thumbnail-${canvasId}.png`,
    uploadSource: 'canvas-thumbnail',
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
