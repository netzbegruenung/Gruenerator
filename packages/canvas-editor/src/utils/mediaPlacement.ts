import { shareCanvasPreviewUrl, type MediaItem } from '@gruenerator/contracts';

import { downscaleImageForUpload } from './userImageUtils';

/**
 * Resolves a durable, placeable image URL for a media-library item. Freshly
 * uploaded items carry only a `shareToken`, so we fall back to the share
 * download endpoint. Shared by the Uploads section and the generator tools that
 * place their output straight onto the canvas.
 */
export function buildPlacementUrl(item: MediaItem): string | null {
  if (item.mediaUrl) return item.mediaUrl;
  if (item.shareToken) return `/api/share/${item.shareToken}/download`;
  return item.thumbnailUrl;
}

/**
 * A stored share image as the File a background pick hands to `onImageChange`.
 * The canvas renders the 2160px preview tier anyway; the stored original can be
 * many MB and its /download awaits download tracking.
 */
export async function fetchShareImageFile(url: string, filename: string): Promise<File> {
  const response = await fetch(shareCanvasPreviewUrl(url) ?? url);
  if (!response.ok) throw new Error('Bild konnte nicht geladen werden');
  const blob = await response.blob();
  const rawFile = new File([blob], filename, { type: blob.type || 'image/jpeg' });
  // This File backs the auto-save `originalImage`, so it should be the working
  // size, not the raw original.
  return downscaleImageForUpload(rawFile);
}
