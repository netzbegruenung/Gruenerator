/**
 * Dreizeilen Layout Utility
 * Exact values extracted from apps/api/routes/sharepic/sharepic_canvas/dreizeilen_canvas.ts
 * and apps/api/services/sharepic/canvas/config.ts to ensure 1:1 visual match
 */

import { SYSTEM_ASSETS } from './canvasAssets';

export interface ColorPair {
  background: string;
  text: string;
}

export interface ColorScheme {
  id: string;
  label: string;
  colors: [ColorPair, ColorPair, ColorPair];
}

export interface BalkenLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  text: string;
  lineIndex: number;
}

export interface ParallelogramPoint {
  x: number;
  y: number;
}

export interface TextBlockBounds {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
  height: number;
}

export interface DreizeilenLayoutResult {
  balkenLayouts: BalkenLayout[];
  textBlockBounds: TextBlockBounds;
  sunflowerSize: number;
  sunflowerDefaultPos: { x: number; y: number };
}

// Colors from backend config.ts
export const COLORS = {
  TANNE: '#005538',
  KLEE: '#008939',
  GRASHALM: '#8ABD24',
  SAND: '#F5F1E9',
  HIMMEL: '#0BA1DD',
  HELLGRUEN: '#6CCD87',
  DUNKELGRAU: '#2E2E3D',
} as const;

// Configuration matching backend exactly (config.ts and dreizeilen_canvas.ts)
export const DREIZEILEN_CONFIG = {
  canvas: {
    width: 1080,
    height: 1350,
  },
  balken: {
    skewAngle: 12, // degrees - from backend line 230-234
    heightFactor: 1.6, // params.BALKEN_HEIGHT_FACTOR
    paddingFactor: 0.3, // params.TEXT_PADDING_FACTOR
  },
  text: {
    fontFamily: 'GrueneTypeNeue',
    fontStyle: 'normal' as const,
    defaultFontSize: 75, // params.DEFAULT_FONT_SIZE
    minFontSize: 50, // params.MIN_FONT_SIZE adjusted for UI
    maxFontSize: 110, // params.MAX_FONT_SIZE
  },
  sunflower: {
    src: SYSTEM_ASSETS.sunflower.yellow.src,
    sizeFactor: 0.8, // params.SUNFLOWER_SIZE_FACTOR
  },
  credit: {
    fontSize: 60,
    y: 1310, // canvasHeight - 40
    fontFamily: 'GrueneTypeNeue',
    color: '#FFFFFF',
  },
  defaults: {
    balkenGruppenOffset: [30, 0] as [number, number], // params.DEFAULT_BALKEN_GRUPPEN_OFFSET
    balkenOffset: [50, -100, 50] as [number, number, number], // params.DEFAULT_BALKEN_OFFSET
    sunflowerPosition: 'bottomRight' as const,
    sunflowerOffset: [0, 0] as [number, number],
  },
  bounds: {
    maxBalkenOffset: 300,
    minBalkenOffset: -300,
    maxGruppenOffset: 300,
    minGruppenOffset: -300,
  },
} as const;

// Predefined color schemes - unified per-line coloring
export const COLOR_SCHEMES: ColorScheme[] = [
  {
    id: 'tanne-sand',
    label: 'Tanne & Sand',
    colors: [
      { background: COLORS.TANNE, text: COLORS.SAND }, // line 1
      { background: COLORS.SAND, text: COLORS.TANNE }, // line 2
      { background: COLORS.SAND, text: COLORS.TANNE }, // line 3
    ],
  },
  {
    id: 'sand-tanne',
    label: 'Sand & Tanne',
    colors: [
      { background: COLORS.SAND, text: COLORS.TANNE },
      { background: COLORS.TANNE, text: COLORS.SAND },
      { background: COLORS.SAND, text: COLORS.TANNE },
    ],
  },
];

/**
 * Calculate parallelogram corner points for a skewed bar
 * Matches backend dreizeilen_canvas.ts lines 230-235
 *
 * @param x - Left edge X position
 * @param y - Top edge Y position
 * @param width - Width of the bar
 * @param height - Height of the bar
 * @param skewAngle - Skew angle in degrees (default 12°)
 * @returns Array of 4 corner points (bottom-left, bottom-right, top-right, top-left)
 */
export function calculateParallelogramPoints(
  x: number,
  y: number,
  width: number,
  height: number,
  skewAngle: number = DREIZEILEN_CONFIG.balken.skewAngle
): ParallelogramPoint[] {
  const skewRad = (skewAngle * Math.PI) / 180;
  const skewOffset = (height * Math.tan(skewRad)) / 2;

  return [
    { x: x, y: y + height }, // bottom-left
    { x: x + width - skewOffset, y: y + height }, // bottom-right
    { x: x + width + skewOffset, y: y }, // top-right
    { x: x + skewOffset, y: y }, // top-left
  ];
}

/**
 * Flatten parallelogram points to Konva.Line format [x1, y1, x2, y2, ...]
 */
export function flattenPoints(points: ParallelogramPoint[]): number[] {
  return points.flatMap((p) => [p.x, p.y]);
}

/**
 * Measure text width using canvas 2D context
 * Creates a temporary canvas for accurate measurement
 */
export function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string = DREIZEILEN_CONFIG.text.fontFamily
): number {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return text.length * fontSize * 0.5; // Fallback estimation

  ctx.font = `${fontSize}px ${fontFamily}, Arial, sans-serif`;

  // Warn in development if font not loaded
  if (import.meta.env.DEV) {
    const isLoaded = document.fonts.check(`${fontSize}px ${fontFamily}`);
    if (!isLoaded) {
      console.warn(`[Dreizeilen] Font "${fontFamily}" not loaded, measurements may be inaccurate`);
    }
  }

  return ctx.measureText(text).width;
}

/**
 * Calculate bar positions for all active text lines
 * Matches backend dreizeilen_canvas.ts lines 163-172
 */
export function calculateDreizeilenLayout(
  lines: [string, string, string],
  fontSize: number,
  balkenOffset: [number, number, number] = DREIZEILEN_CONFIG.defaults.balkenOffset,
  balkenGruppenOffset: [number, number] = DREIZEILEN_CONFIG.defaults.balkenGruppenOffset,
  canvasWidth: number = DREIZEILEN_CONFIG.canvas.width,
  canvasHeight: number = DREIZEILEN_CONFIG.canvas.height,
  widthScale: number = 1.0
): DreizeilenLayoutResult {
  const config = DREIZEILEN_CONFIG;
  const balkenHeight = fontSize * config.balken.heightFactor;

  // Filter active lines (non-empty)
  const activeLines = lines
    .map((line, index) => ({ text: line.trim(), originalIndex: index }))
    .filter((l) => l.text);

  if (activeLines.length === 0) {
    return {
      balkenLayouts: [],
      textBlockBounds: { left: 0, right: 0, top: 0, bottom: 0, width: 0, height: 0 },
      sunflowerSize: 0,
      sunflowerDefaultPos: { x: 0, y: 0 },
    };
  }

  // Calculate vertical positioning (centered with 80px offset) - backend lines 159-161
  const totalHeight = balkenHeight * activeLines.length;
  let startY = (canvasHeight - totalHeight) / 2 + 80;
  startY = Math.max(startY, 100);

  // Calculate each bar's position
  const balkenLayouts: BalkenLayout[] = activeLines.map((line, layoutIndex) => {
    const textWidth = measureTextWidth(line.text, fontSize);
    const padding = fontSize * config.balken.paddingFactor;
    const baseWidth = textWidth + padding * 2 + 20;
    const rectWidth = Math.min(baseWidth * widthScale, canvasWidth - 20);

    // X position: centered + per-line offset + group offset
    const x = Math.max(
      10,
      Math.min(
        canvasWidth - rectWidth - 10,
        (canvasWidth - rectWidth) / 2 + balkenOffset[line.originalIndex] + balkenGruppenOffset[0]
      )
    );

    const y = startY + balkenHeight * layoutIndex + balkenGruppenOffset[1];

    return {
      x,
      y,
      width: rectWidth,
      height: balkenHeight,
      text: line.text,
      lineIndex: line.originalIndex,
    };
  });

  // Calculate text block bounds for sunflower positioning - backend lines 174-179
  const textBlockLeft = Math.min(...balkenLayouts.map((b) => b.x));
  const textBlockRight = Math.max(...balkenLayouts.map((b) => b.x + b.width));
  const textBlockTop = balkenLayouts[0].y;
  const textBlockBottom = balkenLayouts[balkenLayouts.length - 1].y + balkenHeight;

  const textBlockBounds: TextBlockBounds = {
    left: textBlockLeft,
    right: textBlockRight,
    top: textBlockTop,
    bottom: textBlockBottom,
    width: textBlockRight - textBlockLeft,
    height: textBlockBottom - textBlockTop,
  };

  // Calculate sunflower size - backend lines 181-183
  const baseSunflowerSize =
    Math.min(textBlockBounds.width, textBlockBounds.height) * config.sunflower.sizeFactor;
  const sizeFactor = Math.max(0.5, Math.min(1, fontSize / config.text.defaultFontSize));
  const sunflowerSize = baseSunflowerSize * sizeFactor;

  // Default sunflower position (bottomRight) - backend lines 208-216
  const sunflowerDefaultPos = calculateSunflowerDefaultPosition(
    textBlockBounds,
    balkenLayouts,
    sunflowerSize,
    activeLines.length,
    canvasWidth,
    canvasHeight
  );

  return {
    balkenLayouts,
    textBlockBounds,
    sunflowerSize,
    sunflowerDefaultPos,
  };
}

/**
 * Calculate default sunflower position based on text block
 */
function calculateSunflowerDefaultPosition(
  textBlock: TextBlockBounds,
  balkenLayouts: BalkenLayout[],
  sunflowerSize: number,
  lineCount: number,
  canvasWidth: number,
  canvasHeight: number
): { x: number; y: number } {
  // Reference Y for 2-line vs 3-line cases
  const referenceY =
    lineCount === 2
      ? balkenLayouts[1].y + balkenLayouts[1].height - sunflowerSize * 0.6
      : textBlock.bottom - sunflowerSize * 0.6;

  // Default position: bottomRight
  let sunflowerX: number;
  if (lineCount === 2) {
    sunflowerX = balkenLayouts[1].x + balkenLayouts[1].width - sunflowerSize * 0.5;
  } else {
    sunflowerX = textBlock.right - sunflowerSize * 0.6;
  }

  // Clamp to canvas bounds
  const clampedX = Math.max(0, Math.min(canvasWidth - sunflowerSize, sunflowerX));
  const clampedY = Math.max(0, Math.min(canvasHeight - sunflowerSize, referenceY));

  return { x: clampedX, y: clampedY };
}

/**
 * Get color scheme by ID
 */
export function getColorScheme(id: string): ColorScheme {
  return COLOR_SCHEMES.find((s) => s.id === id) ?? COLOR_SCHEMES[0];
}
