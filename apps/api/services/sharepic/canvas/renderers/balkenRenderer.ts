/**
 * Balken Renderer
 * Renders parallelogram bars with text overlay
 * Based on dreizeilen_canvas.ts lines 226-249 and balkenMath.ts
 */

import type { CanvasRenderingContext2D } from 'canvas';
import type { BalkenLayer } from '../types/freeCanvasTypes.js';
import {
  calculateParallelogramPoints,
  getColorScheme,
  BALKEN_CONFIG
} from '../utils/balkenMath.js';

/**
 * Render a balken layer (single or triple parallelogram bars with text)
 * @param ctx - Canvas 2D context
 * @param balken - Balken layer configuration
 * @param canvasWidth - Canvas width (for reference)
 * @param canvasHeight - Canvas height (for reference)
 */
export async function renderBalken(
  ctx: CanvasRenderingContext2D,
  balken: BalkenLayer,
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  const colorScheme = getColorScheme(balken.colorSchemeId);

  const fontSize = BALKEN_CONFIG.defaultFontSize;
  const balkenHeight = fontSize * BALKEN_CONFIG.heightFactor;
  const barCount = balken.mode === 'triple' ? 3 : 1;

  ctx.save();

  ctx.translate(balken.x, balken.y);
  ctx.rotate((balken.rotation * Math.PI) / 180);
  ctx.scale(balken.scale, balken.scale);
  ctx.globalAlpha = balken.opacity;

  for (let i = 0; i < barCount; i++) {
    const barY = i * (balkenHeight + BALKEN_CONFIG.gap);
    const barWidth = BALKEN_CONFIG.defaultWidth * balken.widthScale;

    const points = calculateParallelogramPoints(
      0,
      barY,
      barWidth,
      balkenHeight,
      BALKEN_CONFIG.skewAngle
    );

    ctx.fillStyle = colorScheme.colors[i].background;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    points.slice(1).forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = colorScheme.colors[i].text;
    ctx.font = `${fontSize}px GrueneTypeNeue`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = balken.texts[i] || '';
    ctx.fillText(text, barWidth / 2, barY + balkenHeight / 2);
  }

  ctx.restore();
}
