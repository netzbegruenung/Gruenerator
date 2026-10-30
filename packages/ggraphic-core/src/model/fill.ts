// SPDX-License-Identifier: MPL-2.0
/**
 * Gradient fill for shapes and text.
 *
 * Stored on an instance as an optional `fillGradient`. When present it overrides
 * the solid `fill`. The render helper converts the angle + stops into the Konva
 * `fillLinearGradient*` props relative to a node's bounding box; a radial fill
 * (only the sharepic composer writes one) runs from the box centre to its corners.
 */

export interface GradientStop {
  /** 0..1 position along the gradient axis. */
  offset: number;
  color: string;
}

export interface GradientFill {
  type: 'linear' | 'radial';
  /** Angle in degrees; 0 = left→right, 90 = top→bottom. Unused by `radial`. */
  angle: number;
  stops: GradientStop[];
}
