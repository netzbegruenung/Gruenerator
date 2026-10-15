import { createCanvas } from '@napi-rs/canvas';
import { PDFDocument } from 'pdf-lib';
import { describe, expect, it, vi } from 'vitest';

import { getCanvasFormat, isPrintFormat, mmToPx, type PrintCanvasFormat } from '../formats';

import {
  exportPrintPdf,
  lowResolutionWarnings,
  planPrintPage,
  printPdfFilename,
  printPixelRatio,
  type PrintExportPage,
} from './printExport';

function printFormat(id: string): PrintCanvasFormat {
  const f = getCanvasFormat(id);
  if (!f || !isPrintFormat(f)) throw new Error(id);
  return f;
}

function jpeg(): Uint8Array {
  const canvas = createCanvas(8, 8);
  canvas.getContext('2d').fillRect(0, 0, 8, 8);
  return new Uint8Array(canvas.toBuffer('image/jpeg'));
}

const a3 = printFormat('print-a3-hoch');
const card = printFormat('print-visitenkarte-quer');

describe('printPixelRatio', () => {
  it('maps the working resolution to the export dpi', () => {
    expect(printPixelRatio(a3)).toBeCloseTo(300 / 25.4 / mmToPx(a3, 1), 10);
    // one stage px at that ratio is ~1/300 inch per output px
    expect(mmToPx(a3, 1) * printPixelRatio(a3)).toBeCloseTo(300 / 25.4, 10);
  });
});

describe('planPrintPage', () => {
  it('places tiles seam-free from their output pixel rects', () => {
    const { tiles, pixelRatio } = planPrintPage(a3);
    expect(tiles.length).toBeGreaterThan(1);
    const widthMm = a3.print.trimMm.w + 2 * a3.print.bleedMm;
    const heightMm = a3.print.trimMm.h + 2 * a3.print.bleedMm;
    expect(pixelRatio).toBeGreaterThan(0);
    for (const t of tiles) {
      const right = tiles.find(
        (o) => o.tile.outY === t.tile.outY && o.tile.outX === t.tile.outX + t.tile.outWidth
      );
      if (right) expect(right.xMm).toBeCloseTo(t.xMm + t.wMm, 9);
      const below = tiles.find(
        (o) => o.tile.outX === t.tile.outX && o.tile.outY === t.tile.outY + t.tile.outHeight
      );
      if (below) expect(below.yMm).toBeCloseTo(t.yMm + t.hMm, 9);
    }
    const last = tiles[tiles.length - 1];
    expect(last.xMm + last.wMm).toBeCloseTo(widthMm, 9);
    expect(last.yMm + last.hMm).toBeCloseTo(heightMm, 9);
  });
});

describe('exportPrintPdf', () => {
  it('writes one PDF page per editor page, in order', async () => {
    const order: number[] = [];
    const page = (n: number): PrintExportPage => ({
      captureTile: vi.fn(async () => {
        order.push(n);
        return jpeg();
      }),
      getImages: () => [],
    });
    const pdf = await exportPrintPdf({ format: card, pages: [page(1), page(2)] });
    const doc = await PDFDocument.load(pdf);
    expect(doc.getPageCount()).toBe(2);
    expect(order[0]).toBe(1);
    expect(order[order.length - 1]).toBe(2);
  });

  it('fails when a tile cannot be captured', async () => {
    const page: PrintExportPage = { captureTile: async () => null, getImages: () => [] };
    await expect(exportPrintPdf({ format: card, pages: [page] })).rejects.toThrow('Seite 1');
  });
});

describe('lowResolutionWarnings', () => {
  const pxPerMm = mmToPx(card, 1);
  const pageWith = (naturalWidthPx: number): Pick<PrintExportPage, 'getImages'> => ({
    getImages: () => [{ naturalWidthPx, displayedWidthPx: 50 * pxPerMm }],
  });

  it('warns below 150 dpi with the rounded dpi', () => {
    // 50 mm wide with 200 px = ~102 dpi
    expect(lowResolutionWarnings(card, [pageWith(200)])).toEqual([
      'Foto 1 ist für den Druck zu klein (ca. 102 dpi, empfohlen 300).',
    ]);
  });

  it('stays quiet at sufficient resolution', () => {
    expect(lowResolutionWarnings(card, [pageWith(1000)])).toEqual([]);
  });
});

describe('printPdfFilename', () => {
  it('uses the title and strips path characters', () => {
    expect(printPdfFilename('Plakat / Herbst')).toBe('Plakat Herbst.pdf');
    expect(printPdfFilename(null)).toBe('gruenerator-druck.pdf');
  });
});
