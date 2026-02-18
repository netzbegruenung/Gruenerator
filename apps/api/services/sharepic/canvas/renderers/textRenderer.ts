/**
 * Text Renderer
 * Enhanced text rendering with word wrapping, transforms, and opacity
 * Extracted from simple_canvas.ts and extended for Free Canvas API
 */

import type { TextLayer } from '../types/freeCanvasTypes.js';
import type { SKRSContext2D as CanvasRenderingContext2D } from '@napi-rs/canvas';

/**
 * Word-wrap text helper function
 * @param ctx - Canvas 2D context
 * @param text - Text to wrap
 * @param x - X position
 * @param y - Y position
 * @param maxWidth - Maximum line width
 * @param lineHeight - Line height in pixels
 * @returns Final Y position after all lines
 */
function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number
): number {
  const words = text.split(' ');
  let line = '';
  let currentY = y;

  for (let i = 0; i < words.length; i++) {
    const testLine = line + words[i] + ' ';
    const testWidth = ctx.measureText(testLine).width;
    if (testWidth > maxWidth && i > 0) {
      ctx.fillText(line.trim(), x, currentY);
      line = words[i] + ' ';
      currentY += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line.trim(), x, currentY);
  return currentY + lineHeight;
}

/**
 * Render a text layer with full transforms
 * @param ctx - Canvas 2D context
 * @param text - Text layer configuration
 */
export function renderText(ctx: CanvasRenderingContext2D, text: TextLayer): void {
  ctx.save();

  ctx.translate(text.x, text.y);
  ctx.rotate((text.rotation * Math.PI) / 180);
  ctx.globalAlpha = text.opacity;

  ctx.font = `${text.fontStyle} ${text.fontSize}px ${text.fontFamily}`;
  ctx.fillStyle = text.color;
  ctx.textAlign = text.align;
  ctx.textBaseline = 'top';

  if (text.maxWidth) {
    const lineHeight = text.fontSize * 1.2;
    wrapText(ctx, text.text, 0, 0, text.maxWidth, lineHeight);
  } else {
    ctx.fillText(text.text, 0, 0);
  }

  ctx.restore();
}
