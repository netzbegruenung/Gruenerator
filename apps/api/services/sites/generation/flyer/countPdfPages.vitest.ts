import { PDFDocument } from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import { countPdfPages } from './countPdfPages.js';

async function pdfWithPages(n: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < n; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

describe('countPdfPages', () => {
  it('counts the pages of a real PDF', async () => {
    await expect(countPdfPages(await pdfWithPages(101))).resolves.toBe(101);
  });

  it('returns null for a buffer pdf-lib cannot parse', async () => {
    await expect(countPdfPages(Buffer.from('%PDF-1.7\nnot really'))).resolves.toBeNull();
  });
});
