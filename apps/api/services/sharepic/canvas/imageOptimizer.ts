import type { ImageFormat, ImageOptimizationOptions } from './types.js';

export async function optimizeCanvasBuffer(
  canvasBuffer: Buffer,
  _options: ImageOptimizationOptions = {}
): Promise<Buffer> {
  return canvasBuffer;
}

export function bufferToBase64(buffer: Buffer, format: ImageFormat = 'png'): string {
  const mimeType = format === 'webp' ? 'image/webp' : 'image/png';
  return `data:${mimeType};base64,${buffer.toString('base64')}`;
}
