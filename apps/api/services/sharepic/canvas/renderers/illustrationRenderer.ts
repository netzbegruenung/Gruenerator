/**
 * Illustration Renderer
 * Loads and renders SVG illustrations from the filesystem
 * Supports: OpenDoodles, Undraw (Kawaii is phase 2 - requires React SSR)
 */

import { loadImage, type SKRSContext2D as CanvasRenderingContext2D, type Image } from '@napi-rs/canvas';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import fs from 'fs/promises';
import type { IllustrationLayer } from '../types/freeCanvasTypes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Render an illustration layer (SVG from filesystem)
 * @param ctx - Canvas 2D context
 * @param illustration - Illustration layer configuration
 */
export async function renderIllustration(
  ctx: CanvasRenderingContext2D,
  illustration: IllustrationLayer
): Promise<void> {
  if (illustration.source === 'kawaii') {
    console.warn('Kawaii illustrations not yet supported (requires React SSR). Skipping.');
    return;
  }

  const illustrationPath = path.join(
    __dirname,
    '../../../../../web/public/illustrations',
    illustration.source,
    `${illustration.illustrationId}.svg`
  );

  const normalizedPath = path.normalize(illustrationPath);
  if (!normalizedPath.includes('/illustrations/')) {
    throw new Error('Invalid illustration path: path traversal detected');
  }

  try {
    const svgBuffer = await fs.readFile(illustrationPath);
    const svgImage: Image = await loadImage(svgBuffer);

    ctx.save();

    ctx.translate(illustration.x, illustration.y);
    ctx.rotate((illustration.rotation * Math.PI) / 180);
    ctx.globalAlpha = illustration.opacity;

    const size = 200 * illustration.scale;
    ctx.drawImage(svgImage, -size / 2, -size / 2, size, size);

    ctx.restore();
  } catch (error) {
    console.warn(
      `Failed to load illustration: ${illustration.source}/${illustration.illustrationId}.svg`,
      (error as Error).message
    );
  }
}
