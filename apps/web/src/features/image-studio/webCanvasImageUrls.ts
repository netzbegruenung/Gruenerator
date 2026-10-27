import {
  CANVAS_PREVIEW_WIDTH,
  shareCanvasPreviewUrl,
  shareTokenFromDownloadUrl,
} from '@gruenerator/contracts';

import type { CanvasImageUrlService } from '@gruenerator/canvas-editor';

/**
 * Where the editor loads Grünerator images from: shares and the bundled stock
 * backgrounds have a `CANVAS_PREVIEW_WIDTH` WebP tier; `blob:`, remote and
 * `data:` URLs pass through unchanged.
 */
export const webCanvasImageUrls: CanvasImageUrlService = {
  previewWidth: CANVAS_PREVIEW_WIDTH,
  previewUrl: (url) => shareCanvasPreviewUrl(url) ?? url,
  /**
   * Canvases store `/api/share/<token>/download`, but a `fetch()` is not an
   * image render to the API (no `Sec-Fetch-Dest: image`), so for a
   * collaborator that link expires 30 days after the upload. `/preview`
   * without `w` serves the same original bytes with no deadline, and with an
   * ETag and a short freshness window, so a reopened canvas costs a 304
   * instead of the file. `/download` sends no cache header, so every open
   * re-downloaded it.
   */
  originalUrl: (url) => {
    const token = shareTokenFromDownloadUrl(url);
    return token ? `/api/share/${token}/preview` : url;
  },
  /** Freshly uploaded items carry only a `shareToken`: the share download link. */
  placementUrl: (item) => {
    if (item.mediaUrl) return item.mediaUrl;
    if (item.shareToken) return `/api/share/${item.shareToken}/download`;
    return item.thumbnailUrl;
  },
};
