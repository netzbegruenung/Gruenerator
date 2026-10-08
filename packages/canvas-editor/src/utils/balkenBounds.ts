/**
 * Geometry of a balken group: the bar layout the renderer draws, and where the
 * group lands on the canvas once its offset, scale and rotation are applied.
 */

import { type RunStyle } from '@gruenerator/contracts';

import { DREIZEILEN_CONFIG } from './dreizeilenLayout';
import { runMeasurer } from './textUtils';

import type { BalkenInstance, BalkenMode } from '../primitives/BalkenGroup';

export interface BalkenLayout {
  x: number;
  y: number;
  width: number;
  height: number;
  colorIndex: number;
  text: string;
}

const PLAIN_RUN: RunStyle = {
  bold: false,
  italic: false,
  underline: false,
  accent: false,
  marker: false,
};

/**
 * Calculate bar layouts matching DreizeilenCanvas exactly
 * Uses same logic as calculateDreizeilenLayout in dreizeilenLayout.ts
 *
 * `fontGeneration` bindet die Messung an den Stand von `document.fonts` —
 * siehe `useFontGeneration`.
 */
export function calculateBalkenLayouts(
  mode: BalkenMode,
  widthScale: number,
  texts: string[],
  stageWidth: number,
  stageHeight: number,
  barOffsets: [number, number, number] | undefined,
  fontGeneration: number
): {
  balkens: BalkenLayout[];
  bounds: { left: number; top: number; width: number; height: number };
} {
  const config = DREIZEILEN_CONFIG;
  const fontSize = config.text.defaultFontSize; // 75
  const balkenHeight = fontSize * config.balken.heightFactor; // 75 * 1.6 = 120
  const padding = fontSize * config.balken.paddingFactor; // 75 * 0.3 = 22.5
  const measure = runMeasurer(fontSize, config.text.fontFamily, 'normal', fontGeneration);
  const measureTextWidth = (text: string) => measure(text, PLAIN_RUN);

  // Use provided offsets or fall back to defaults
  const balkenOffset: [number, number, number] = barOffsets ?? config.defaults.balkenOffset;

  if (mode === 'single') {
    const text = texts[0] || 'GRÜNE';
    const textWidth = measureTextWidth(text);
    const baseWidth = textWidth + padding * 2 + 20;
    const rectWidth = baseWidth * widthScale;

    // Center the single bar
    const x = (stageWidth - rectWidth) / 2;
    const y = (stageHeight - balkenHeight) / 2;

    return {
      balkens: [{ x, y, width: rectWidth, height: balkenHeight, colorIndex: 0, text }],
      bounds: { left: x, top: y, width: rectWidth, height: balkenHeight },
    };
  }

  // Triple mode - exactly like DreizeilenCanvas with 3 lines
  // Default texts if custom texts are empty
  const lines: [string, string, string] = [
    texts[0] || 'DIE',
    texts[1] || 'GRÜNEN',
    texts[2] || 'SIND DA',
  ];

  // Calculate total height (no gaps - bars stack tightly)
  const totalHeight = balkenHeight * 3;
  const startY = (stageHeight - totalHeight) / 2;

  // Map which uses staggered layout logic
  const balkens: BalkenLayout[] = lines.map((text, index) => {
    const textWidth = measureTextWidth(text);
    const baseWidth = textWidth + padding * 2 + 20;
    const rectWidth = baseWidth * widthScale;

    // X position: centered + per-line offset (matching DreizeilenCanvas)
    const x = Math.max(
      10,
      Math.min(stageWidth - rectWidth - 10, (stageWidth - rectWidth) / 2 + balkenOffset[index])
    );

    const y = startY + balkenHeight * index;

    return {
      x,
      y,
      width: rectWidth,
      height: balkenHeight,
      colorIndex: index,
      text,
    };
  });

  // Calculate bounds
  const minX = Math.min(...balkens.map((b) => b.x));
  const maxX = Math.max(...balkens.map((b) => b.x + b.width));

  return {
    balkens,
    bounds: {
      left: minX,
      top: startY,
      width: maxX - minX,
      height: totalHeight,
    },
  };
}

export interface BalkenExtent {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

/**
 * The canvas box a group covers, mirroring `BalkenGroup`: the group is scaled
 * and rotated around the centre of its bars' bounds, then moved by `offset`.
 * The skewed top edge of each bar reaches past its rect on the right.
 */
export function balkenExtent(
  balken: BalkenInstance,
  stageWidth: number,
  stageHeight: number
): BalkenExtent {
  const { balkens, bounds } = calculateBalkenLayouts(
    balken.mode,
    balken.widthScale,
    balken.texts,
    stageWidth,
    stageHeight,
    balken.barOffsets,
    0
  );
  const skewRad = (DREIZEILEN_CONFIG.balken.skewAngle * Math.PI) / 180;
  const skew = (Math.max(...balkens.map((b) => b.height)) * Math.tan(skewRad)) / 2;
  const cx = bounds.left + bounds.width / 2;
  const cy = bounds.top + bounds.height / 2;
  const right = Math.max(...balkens.map((b) => b.x + b.width)) + skew;
  const corners: [number, number][] = [
    [bounds.left, bounds.top],
    [right, bounds.top],
    [right, bounds.top + bounds.height],
    [bounds.left, bounds.top + bounds.height],
  ];
  const rad = (balken.rotation * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const xs: number[] = [];
  const ys: number[] = [];
  for (const [x, y] of corners) {
    const dx = (x - cx) * balken.scale;
    const dy = (y - cy) * balken.scale;
    xs.push(balken.offset.x + cx + dx * cos - dy * sin);
    ys.push(balken.offset.y + cy + dx * sin + dy * cos);
  }
  return {
    left: Math.min(...xs),
    right: Math.max(...xs),
    top: Math.min(...ys),
    bottom: Math.max(...ys),
  };
}

/** How far to move [lo, hi] so it sits in [margin, size - margin]; centred if it cannot. */
function shiftInto(lo: number, hi: number, size: number, margin: number): number {
  if (hi - lo > size - 2 * margin) return size / 2 - (lo + hi) / 2;
  if (lo < margin) return margin - lo;
  if (hi > size - margin) return size - margin - hi;
  return 0;
}

/**
 * The scale and offset that keep a group inside the canvas, or null when it
 * already fits. Shrinks only when the group is larger than the canvas allows
 * (never below `minScale`, never above its current scale), then moves it in.
 */
export function fitBalkenToCanvas(
  balken: BalkenInstance,
  stageWidth: number,
  stageHeight: number,
  margin: number,
  minScale: number
): { scale: number; offset: { x: number; y: number } } | null {
  const current = balkenExtent(balken, stageWidth, stageHeight);
  const fitScale =
    balken.scale *
    Math.min(
      (stageWidth - 2 * margin) / (current.right - current.left),
      (stageHeight - 2 * margin) / (current.bottom - current.top)
    );
  const scale = Math.min(balken.scale, Math.max(minScale, fitScale));
  const extent = balkenExtent({ ...balken, scale }, stageWidth, stageHeight);
  const dx = shiftInto(extent.left, extent.right, stageWidth, margin);
  const dy = shiftInto(extent.top, extent.bottom, stageHeight, margin);
  if (scale === balken.scale && dx === 0 && dy === 0) return null;
  return { scale, offset: { x: balken.offset.x + dx, y: balken.offset.y + dy } };
}
