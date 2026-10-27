import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { exportSlidesPdf } from './slidesPdf';

function pngDataUrl(width = 16, height = 9): string {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#005538';
  ctx.fillRect(0, 0, width, height);
  return canvas.toDataURL('image/png');
}

describe('slidesPdf', () => {
  it('writes one 16:9 page per slide', async () => {
    const bytes = await exportSlidesPdf([pngDataUrl(), pngDataUrl(), pngDataUrl()]);
    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(3);
    for (const page of doc.getPages()) {
      const { width, height } = page.getSize();
      expect(width / height).toBeCloseTo(16 / 9, 5);
    }
  });

  it('rejects a page that is not a PNG data URL', async () => {
    await expect(exportSlidesPdf(['data:text/plain;base64,AAAA'])).rejects.toThrow(/Folie 1/);
  });
});
