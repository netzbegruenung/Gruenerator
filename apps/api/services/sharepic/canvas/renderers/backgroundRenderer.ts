/**
 * Background Renderer
 * Handles solid color and image backgrounds with cover-fit
 * Extracted from simple_canvas.ts lines 124-150 and campaign_canvas.ts
 */

import {
  loadImage,
  type SKRSContext2D as CanvasRenderingContext2D,
  type Image,
} from '@napi-rs/canvas';
import type { BackgroundConfig } from '../types/freeCanvasTypes.js';

/**
 * Render background (solid color or image with cover-fit)
 * @param ctx - Canvas 2D context
 * @param background - Background configuration
 * @param canvasWidth - Canvas width
 * @param canvasHeight - Canvas height
 */
export async function renderBackground(
  ctx: CanvasRenderingContext2D,
  background: BackgroundConfig,
  canvasWidth: number,
  canvasHeight: number
): Promise<void> {
  if (background.type === 'color') {
    ctx.fillStyle = background.color || '#FFFFFF';
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    return;
  }

  if (background.type === 'image' && background.imageData) {
    const buffer = Buffer.from(
      background.imageData.replace(/^data:image\/\w+;base64,/, ''),
      'base64'
    );
    const image: Image = await loadImage(buffer);

    const imageAspectRatio = image.width / image.height;
    const canvasAspectRatio = canvasWidth / canvasHeight;

    let sx: number, sy: number, sWidth: number, sHeight: number;

    if (imageAspectRatio > canvasAspectRatio) {
      sHeight = image.height;
      sWidth = image.height * canvasAspectRatio;
      sx = (image.width - sWidth) / 2;
      sy = 0;
    } else {
      sWidth = image.width;
      sHeight = image.width / canvasAspectRatio;
      sx = 0;
      sy = (image.height - sHeight) / 2;
    }

    ctx.drawImage(image, sx, sy, sWidth, sHeight, 0, 0, canvasWidth, canvasHeight);
    return;
  }

  ctx.fillStyle = '#FFFFFF';
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);
}
