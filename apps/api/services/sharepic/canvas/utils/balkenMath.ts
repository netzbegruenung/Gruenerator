/**
 * Balken Math Utilities
 * Ported from: apps/web/src/features/image-studio/canvas-editor/utils/dreizeilenLayout.ts
 * Exact calculations for parallelogram bars (Balkens) with 12° skew angle
 */

import type { ColorScheme } from '../types/freeCanvasTypes.js';

export interface ParallelogramPoint {
  x: number;
  y: number;
}

export const COLORS = {
  TANNE: '#005538',
  KLEE: '#008939',
  GRASHALM: '#8ABD24',
  SAND: '#F5F1E9',
  HIMMEL: '#009EE3',
  ZITAT_BG: '#6ccd87',
  SONNE: '#FFD43B'
} as const;

export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'tanne-sand',
    colors: [
      { background: COLORS.TANNE, text: COLORS.SAND },
      { background: COLORS.TANNE, text: COLORS.SAND },
      { background: COLORS.TANNE, text: COLORS.SAND }
    ]
  },
  {
    id: 'klee-sand',
    colors: [
      { background: COLORS.KLEE, text: COLORS.SAND },
      { background: COLORS.KLEE, text: COLORS.SAND },
      { background: COLORS.KLEE, text: COLORS.SAND }
    ]
  },
  {
    id: 'grashalm-tanne',
    colors: [
      { background: COLORS.GRASHALM, text: COLORS.TANNE },
      { background: COLORS.GRASHALM, text: COLORS.TANNE },
      { background: COLORS.GRASHALM, text: COLORS.TANNE }
    ]
  },
  {
    id: 'sand-tanne',
    colors: [
      { background: COLORS.SAND, text: COLORS.TANNE },
      { background: COLORS.SAND, text: COLORS.TANNE },
      { background: COLORS.SAND, text: COLORS.TANNE }
    ]
  },
  {
    id: 'himmel-sand',
    colors: [
      { background: COLORS.HIMMEL, text: COLORS.SAND },
      { background: COLORS.HIMMEL, text: COLORS.SAND },
      { background: COLORS.HIMMEL, text: COLORS.SAND }
    ]
  },
  {
    id: 'tanne-klee-grashalm',
    colors: [
      { background: COLORS.TANNE, text: COLORS.SAND },
      { background: COLORS.KLEE, text: COLORS.SAND },
      { background: COLORS.GRASHALM, text: COLORS.TANNE }
    ]
  }
];

/**
 * Calculate parallelogram corner points for a skewed rectangle (Balken)
 * @param x - Left X coordinate
 * @param y - Top Y coordinate
 * @param width - Rectangle width
 * @param height - Rectangle height
 * @param skewAngle - Skew angle in degrees (default 12°)
 * @returns Array of 4 corner points (bottom-left, bottom-right, top-right, top-left)
 */
export function calculateParallelogramPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  skewAngle: number = 12
): ParallelogramPoint[] {
  const skewRad = (skewAngle * Math.PI) / 180;
  const skewOffset = (height * Math.tan(skewRad)) / 2;

  return [
    { x: x, y: y + height },                    // bottom-left
    { x: x + width - skewOffset, y: y + height }, // bottom-right
    { x: x + width + skewOffset, y: y },        // top-right
    { x: x + skewOffset, y: y }                 // top-left
  ];
}

/**
 * Get color scheme by ID
 */
export function getColorScheme(colorSchemeId: string): ColorScheme {
  const scheme = COLOR_SCHEMES.find(s => s.id === colorSchemeId);
  if (!scheme) {
    return COLOR_SCHEMES[0];
  }
  return scheme;
}

/**
 * Balken configuration constants
 */
export const BALKEN_CONFIG = {
  skewAngle: 12,
  heightFactor: 1.6,
  defaultFontSize: 75,
  gap: 15,
  defaultWidth: 900
} as const;
