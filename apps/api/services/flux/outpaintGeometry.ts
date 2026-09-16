import { type ImageFormatId } from '@gruenerator/shared/image-studio';

/**
 * Outpaint geometry: how large the target canvas is and how large the source
 * has to be so it still fits inside it.
 *
 * BFL's outpainting endpoint places the source into the target canvas at its
 * native pixel size, so the canvas may only ever *grow* around the source —
 * which is why a 1088×1360 portrait needs a 2418×1360 canvas to reach 16:9.
 * That exceeds the 2048-per-side budget, so the whole pair is scaled down
 * together instead of rejecting the format (issue #3388): the client used to
 * compute this and gave up here, leaving 16:9 unreachable for every freshly
 * generated image.
 */

export const OUTPAINT_MIN_SIDE = 256;
export const OUTPAINT_MAX_SIDE = 2048;
export const OUTPAINT_MAX_AREA = 4_194_304; // BFL's 4 MP cap

/** A source already in the target ratio has nothing to fill — widen it evenly. */
const SAME_RATIO_EXPANSION = 1.22;

const ASPECT_VALUE: Record<ImageFormatId, number> = {
  '16:9': 16 / 9,
  '4:3': 4 / 3,
  '1:1': 1,
  '4:5': 4 / 5,
  '3:4': 3 / 4,
  '9:16': 9 / 16,
};

export interface OutpaintGeometry {
  /** Target canvas handed to BFL. */
  width: number;
  height: number;
  /** Source dimensions after the budget scale — equal to the input when it fits. */
  sourceWidth: number;
  sourceHeight: number;
  /** Whether the source has to be resized before it is sent. */
  needsResize: boolean;
}

export class OutpaintGeometryError extends Error {}

export function computeOutpaintGeometry(
  srcWidth: number,
  srcHeight: number,
  aspect: ImageFormatId
): OutpaintGeometry {
  if (srcWidth <= 0 || srcHeight <= 0) {
    throw new OutpaintGeometryError('Quellbild hat keine gültigen Maße.');
  }

  const target = ASPECT_VALUE[aspect];
  const input = srcWidth / srcHeight;

  let width: number;
  let height: number;
  if (Math.abs(input - target) < 0.01) {
    width = srcWidth * SAME_RATIO_EXPANSION;
    height = srcHeight * SAME_RATIO_EXPANSION;
  } else if (input > target) {
    width = srcWidth;
    height = srcWidth / target;
  } else {
    width = srcHeight * target;
    height = srcHeight;
  }

  // Shrink canvas and source by the same factor so the source keeps its place
  // inside the canvas and the canvas keeps the requested ratio.
  const scale = Math.min(
    1,
    OUTPAINT_MAX_SIDE / Math.max(width, height),
    Math.sqrt(OUTPAINT_MAX_AREA / (width * height))
  );

  const canvasWidth = Math.round(width * scale);
  const canvasHeight = Math.round(height * scale);

  if (Math.min(canvasWidth, canvasHeight) < OUTPAINT_MIN_SIDE) {
    throw new OutpaintGeometryError(
      `Das Bild ist zu klein, um es auf ${aspect} zu vergrößern — mindestens ${OUTPAINT_MIN_SIDE} Pixel je Seite.`
    );
  }

  // Rounding can push the source a pixel past the canvas; clamp so it always fits.
  const sourceWidth = Math.min(canvasWidth, Math.round(srcWidth * scale));
  const sourceHeight = Math.min(canvasHeight, Math.round(srcHeight * scale));

  return {
    width: canvasWidth,
    height: canvasHeight,
    sourceWidth,
    sourceHeight,
    needsResize: sourceWidth !== srcWidth || sourceHeight !== srcHeight,
  };
}
