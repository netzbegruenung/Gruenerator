import type { MediaItem } from '@gruenerator/shared/media-library';

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
