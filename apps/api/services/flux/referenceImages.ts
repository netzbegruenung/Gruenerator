/**
 * Reference-image preparation for FLUX.2 multi-reference editing.
 *
 * The BFL API caps input + output at 9 megapixels combined. We reserve
 * ~1MP headroom for the output and split the remaining budget evenly
 * across the reference images. Images already under their share pass
 * through byte-identical; oversized ones are downscaled via sharp.
 *
 * Shared between the imageEdit contract router and the ChatGraph
 * imageEditNode.
 */

import sharp from 'sharp';

import type { ReferenceImage } from './FluxImageService.js';

const TOTAL_INPUT_BUDGET_MP = 8;
const MP = 1_000_000;

export const MAX_REFERENCE_IMAGES = 8;

export async function fitToBudget(images: ReferenceImage[]): Promise<ReferenceImage[]> {
  if (images.length === 0) return images;
  const capPx = Math.max(1, Math.floor(TOTAL_INPUT_BUDGET_MP / images.length)) * MP;

  return Promise.all(
    images.map(async (img) => {
      const meta = await sharp(img.buffer).metadata();
      const width = meta.width ?? 0;
      const height = meta.height ?? 0;
      if (!width || !height || width * height <= capPx) return img;

      const scale = Math.sqrt(capPx / (width * height));
      const buffer = await sharp(img.buffer)
        .resize({
          width: Math.max(1, Math.floor(width * scale)),
          height: Math.max(1, Math.floor(height * scale)),
          fit: 'inside',
        })
        .jpeg({ quality: 90 })
        .toBuffer();
      return { buffer, mimeType: 'image/jpeg' };
    })
  );
}
