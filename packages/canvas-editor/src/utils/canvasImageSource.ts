import {
  CANVAS_PREVIEW_WIDTH,
  shareCanvasPreviewUrl,
  shareTokenFromDownloadUrl,
} from '@gruenerator/shared/media-library';

/** The download UI offers 1x/2x export (TopBar/DownloadSection.tsx SCALE_OPTIONS). */
const EXPORT_PIXEL_RATIO = 2;

/**
 * Pick the source an image element renders from.
 *
 * The `CANVAS_PREVIEW_WIDTH` WebP tier (1080 x 2) is export-quality at the
 * UI's max export scale while the element draws at most
 * `CANVAS_PREVIEW_WIDTH / EXPORT_PIXEL_RATIO` (1080px): the coverFit crop is
 * stretched to the element's box, so a wider box needs more source pixels
 * than the tier holds. Wider boxes — zoomed-in backgrounds (imageScale up to
 * 3x) or resized elements — load the stored original instead, so exports
 * stay as sharp as the stored image. The original comes through `/preview`
 * too: `/download` sends no cache header, so every open re-downloaded it. `blob:`, remote and `data:` URLs pass
 * through the rewrite unchanged either way.
 */
export function canvasImageSourceUrl(
  url: string | undefined,
  boxWidth: number
): string | undefined {
  if (!url) return url;
  return boxWidth * EXPORT_PIXEL_RATIO <= CANVAS_PREVIEW_WIDTH
    ? shareCanvasPreviewUrl(url)
    : originalImageFetchUrl(url);
}

/**
 * Where to load a stored image's original bytes from.
 *
 * Canvases store `/api/share/<token>/download`, but a `fetch()` is not an image
 * render to the API (no `Sec-Fetch-Dest: image`), so for a collaborator that
 * link expires 30 days after the upload. `/preview` without `w` serves the
 * same original bytes with no deadline, and with an ETag and a short
 * freshness window, so a reopened canvas costs a 304 instead of the file.
 * Other URLs pass through unchanged.
 */
export function originalImageFetchUrl(url: string): string {
  const token = shareTokenFromDownloadUrl(url);
  return token ? `/api/share/${token}/preview` : url;
}
