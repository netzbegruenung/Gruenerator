// SPDX-License-Identifier: MPL-2.0
import { type CanvasImageUrlService } from '../hostServices.js';

/** The download UI offers 1x/2x export (TopBar/DownloadSection.tsx SCALE_OPTIONS). */
const EXPORT_PIXEL_RATIO = 2;

/**
 * Pick the source an image element renders from.
 *
 * The host's variant (`previewWidth` px) is export-quality at the UI's max
 * export scale while the element draws at most half as wide: the coverFit crop
 * is stretched to the element's box, so a wider box needs more source pixels
 * than the variant holds. Wider boxes (zoomed-in backgrounds with imageScale
 * up to 3x, or resized elements) load the original instead, so exports stay as
 * sharp as the stored image.
 */
export function canvasImageSourceUrl(
  url: string | undefined,
  boxWidth: number,
  urls: CanvasImageUrlService
): string | undefined {
  if (!url) return url;
  return boxWidth * EXPORT_PIXEL_RATIO <= urls.previewWidth
    ? urls.previewUrl(url)
    : urls.originalUrl(url);
}
