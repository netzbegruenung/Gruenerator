import { CANVAS_PREVIEW_WIDTH, shareCanvasPreviewUrl } from '@gruenerator/shared/media-library';

/** Canvas exports capture at pixelRatio 2 (captureStage.ts default). */
const EXPORT_PIXEL_RATIO = 2;

/**
 * Pick the source an image element renders from.
 *
 * The `CANVAS_PREVIEW_WIDTH` WebP tier is export-quality (pixelRatio 2) only
 * while the element draws at most half the tier: the coverFit crop is
 * stretched to the element's box, so a box wider than
 * `CANVAS_PREVIEW_WIDTH / EXPORT_PIXEL_RATIO` needs more source pixels than
 * the tier holds. Wider boxes — zoomed-in backgrounds (imageScale up to 3x)
 * or resized elements — load the stored original instead, so exports stay as
 * sharp as the stored image. `blob:`, remote and `data:` URLs pass through
 * the rewrite unchanged either way.
 */
export function canvasImageSourceUrl(
  url: string | undefined,
  boxWidth: number
): string | undefined {
  if (!url) return url;
  return boxWidth * EXPORT_PIXEL_RATIO <= CANVAS_PREVIEW_WIDTH ? shareCanvasPreviewUrl(url) : url;
}
