/** SVG paths are designed in a 100x100 viewBox. Renderer rescales to shape.width/height. */
export const PATH_VIEWBOX = 100;

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
  return {
    width: Math.max(
      MIN_SHAPE_SIZE,
      isPathShape ? PATH_VIEWBOX * nodeScaleX : shape.width * nodeScaleX
    ),
    height: Math.max(
      MIN_SHAPE_SIZE,
      isPathShape ? PATH_VIEWBOX * nodeScaleY : shape.height * nodeScaleY
    ),
  };
}

/** The node scale a shape renders at for a given size — the inverse of the above. */
export function shapeNodeScale(isPathShape: boolean, size: ResizedShapeSize): ResizedShapeSize {
  return isPathShape
    ? { width: size.width / PATH_VIEWBOX, height: size.height / PATH_VIEWBOX }
    : { width: 1, height: 1 };
}
