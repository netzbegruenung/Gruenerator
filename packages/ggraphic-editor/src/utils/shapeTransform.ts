// SPDX-License-Identifier: MPL-2.0
/** SVG paths are designed in a 100x100 viewBox. Renderer rescales to shape.width/height. */
export const PATH_VIEWBOX = 100;

/** Subset of ShapeType rendered via Konva.Path with a hand-tuned SVG path. */
export type PathShapeType =
  | 'arrow'
  | 'arrow-curved'
  | 'heart'
  | 'cloud'
  | 'chevron'
  | 'double-arrow'
  | 'wavy'
  | 'speech-round'
  | 'speech-rect'
  | 'speech-cloud'
  | 'speech-pointed'
  | 'cloud-fluffy'
  | 'cloud-puff'
  | 'cloud-thin'
  | 'heart-broken'
  | 'heart-double'
  | 'heart-arrow'
  | 'drop'
  | 'drop-pin'
  | 'drop-tear'
  | 'drop-flame'
  | 'banner-ribbon'
  | 'banner-flag'
  | 'banner-tag'
  | 'banner-scroll'
  | 'gear'
  | 'plus'
  | 'minus'
  | 'x-mark'
  | 'tree'
  | 'mountain'
  | 'blob-2'
  | 'checkmark'
  | 'blob'
  | 'leaf';

export const PATH_OFFSETS: Record<PathShapeType, { x: number; y: number }> = {
  arrow: { x: 50, y: 50 },
  heart: { x: 50, y: 50 },
  cloud: { x: 50, y: 40 },
  chevron: { x: 50, y: 50 },
  'double-arrow': { x: 50, y: 50 },
  wavy: { x: 50, y: 50 },
  'speech-round': { x: 50, y: 45 },
  'speech-rect': { x: 50, y: 45 },
  'speech-cloud': { x: 50, y: 45 },
  'speech-pointed': { x: 50, y: 45 },
  'cloud-fluffy': { x: 50, y: 50 },
  'heart-broken': { x: 50, y: 50 },
  'heart-double': { x: 50, y: 40 },
  drop: { x: 50, y: 50 },
  'banner-ribbon': { x: 50, y: 50 },
  'banner-flag': { x: 50, y: 50 },
  gear: { x: 50, y: 50 },
  plus: { x: 50, y: 50 },
  checkmark: { x: 50, y: 50 },
  blob: { x: 50, y: 50 },
  'blob-2': { x: 50, y: 50 },
  leaf: { x: 50, y: 50 },
  'arrow-curved': { x: 50, y: 50 },
  'cloud-puff': { x: 50, y: 50 },
  'cloud-thin': { x: 50, y: 50 },
  'heart-arrow': { x: 50, y: 50 },
  'drop-pin': { x: 50, y: 50 },
  'drop-tear': { x: 50, y: 50 },
  'drop-flame': { x: 50, y: 50 },
  'banner-tag': { x: 50, y: 50 },
  'banner-scroll': { x: 50, y: 50 },
  tree: { x: 50, y: 50 },
  mountain: { x: 50, y: 60 },
  minus: { x: 50, y: 50 },
  'x-mark': { x: 50, y: 50 },
};

/** Smallest edge a shape may be resized to, in canvas units. */
export const MIN_SHAPE_SIZE = 5;

export interface ResizedShapeSize {
  width: number;
  height: number;
}

/**
 * Turn the Konva node scale left behind by a Transformer drag into the shape's new size.
 *
 * The two shape families carry their size differently, and reading `node.scaleX()` as a
 * plain drag factor is only correct for one of them:
 *
 * - Path shapes render at `(shape.width / PATH_VIEWBOX) * shape.scaleX`, so the node scale
 *   is absolute. Their path data is PATH_VIEWBOX units wide, hence the visual width is
 *   `PATH_VIEWBOX * node.scaleX()`.
 * - Every other shape sizes itself from `shape.width` and only carries `shape.scaleX` on
 *   the node, so the visual width is `shape.width * node.scaleX()`.
 */
export function resizedShapeSize(
  isPathShape: boolean,
  shape: ResizedShapeSize,
  nodeScaleX: number,
  nodeScaleY: number
): ResizedShapeSize {
  // A flipped node carries a negative scale; the size is its magnitude.
  const scaleX = Math.abs(nodeScaleX);
  const scaleY = Math.abs(nodeScaleY);
  return {
    width: Math.max(MIN_SHAPE_SIZE, isPathShape ? PATH_VIEWBOX * scaleX : shape.width * scaleX),
    height: Math.max(MIN_SHAPE_SIZE, isPathShape ? PATH_VIEWBOX * scaleY : shape.height * scaleY),
  };
}

/** The node scale a shape renders at for a given size — the inverse of the above. */
export function shapeNodeScale(isPathShape: boolean, size: ResizedShapeSize): ResizedShapeSize {
  return isPathShape
    ? { width: size.width / PATH_VIEWBOX, height: size.height / PATH_VIEWBOX }
    : { width: 1, height: 1 };
}
