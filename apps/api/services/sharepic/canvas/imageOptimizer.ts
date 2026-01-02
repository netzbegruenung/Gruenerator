import sharp from 'sharp';
import type { ImageFormat, ImageOptimizationOptions } from './types.js';

export async function optimizeCanvasBuffer(
  canvasBuffer: Buffer,
  options: ImageOptimizationOptions = {}
): Promise<Buffer> {
  const {
    format = 'png',
    quality = 85,
    compressionLevel = 9
  } = options;

  if (format === 'webp') {
    return sharp(canvasBuffer)
      .webp({ quality })
      .toBuffer();
  }

  return sharp(canvasBuffer)
    .png({ compressionLevel })
    .toBuffer();
}

export function bufferToBase64(buffer: Buffer, format: ImageFormat = 'png'): string {
  const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
