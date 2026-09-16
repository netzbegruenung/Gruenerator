/**
 * Text Renderer
 * Enhanced text rendering with word wrapping, transforms, and opacity
 * Extracted from simple_canvas.ts and extended for Free Canvas API
 */

import { drawRichTextLines } from '../../textLayout.js';

import type { TextLayer } from '../types/freeCanvasTypes.js';
import type { SKRSContext2D as CanvasRenderingContext2D } from '@napi-rs/canvas';

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
    // Umbruch, Einzug und Auszeichnung kommen aus dem geteilten Helfer —
    // dieselbe Logik, die der Editor für die Vorschau fährt. Vorher brach
    // eine private Kopie nur an ' ', ein `\n` blieb in der Zeile stehen und
    // `fillText` verschluckte es.
    drawRichTextLines(ctx, text.text, {
      x: 0,
      y: 0,
      maxWidth: text.maxWidth,
      lineHeight: text.fontSize * 1.2,
      font: { fontFamily: text.fontFamily, fontSize: text.fontSize, fontStyle: text.fontStyle },
      color: text.color,
    });
  } else {
    ctx.fillText(text.text, 0, 0);
  }

  ctx.restore();
}
