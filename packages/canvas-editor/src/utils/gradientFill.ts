/**
 * Linear gradient fill for shapes and text.
 *
 * Stored on an instance as an optional `fillGradient`. When present it overrides
 * the solid `fill`. The render helper converts the angle + stops into the Konva
 * `fillLinearGradient*` props relative to a node's bounding box.
 */

export interface GradientStop {
  /** 0..1 position along the gradient axis. */
  offset: number;
  color: string;
}

export interface GradientFill {
  type: 'linear';
  /** Angle in degrees; 0 = left→right, 90 = top→bottom. */
  angle: number;
  stops: GradientStop[];
}

export interface KonvaLinearGradientProps {
  fillLinearGradientStartPoint: { x: number; y: number };
  fillLinearGradientEndPoint: { x: number; y: number };
  fillLinearGradientColorStops: Array<number | string>;
}

export interface LocalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Konva paints gradients in the node's local coordinate space. Given the node's
 * local bounding box (from `node.getSelfRect()` — works for both top-left origin
 * shapes like Rect/Text and center-origin shapes like Circle/Star), project the
 * gradient angle onto the box so the axis spans corner to corner in any
 * direction, centered on the box.
 */
export function gradientToKonvaProps(
  gradient: GradientFill,
  rect: LocalRect
): KonvaLinearGradientProps {
  const rad = (gradient.angle * Math.PI) / 180;
  const dx = Math.cos(rad);
  const dy = Math.sin(rad);
  const cx = rect.x + rect.width / 2;
  const cy = rect.y + rect.height / 2;
  const ex = (rect.width / 2) * dx;
  const ey = (rect.height / 2) * dy;

  return {
    fillLinearGradientStartPoint: { x: cx - ex, y: cy - ey },
    fillLinearGradientEndPoint: { x: cx + ex, y: cy + ey },
    fillLinearGradientColorStops: gradient.stops.flatMap((s) => [s.offset, s.color]),
  };
}

export function createDefaultGradient(baseColor: string): GradientFill {
  return {
    type: 'linear',
    angle: 90,
    stops: [
      { offset: 0, color: baseColor },
      { offset: 1, color: '#ffffff' },
    ],
  };
}
