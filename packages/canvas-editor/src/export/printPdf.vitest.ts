import { createCanvas } from '@napi-rs/canvas';
import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  type PDFObject,
  PDFRawStream,
  PDFRef,
  decodePDFRawStream,
} from 'pdf-lib';
import { describe, expect, it } from 'vitest';

import {
  PT_PER_MM,
  buildPrintPdf,
  cropMarkLines,
  effectiveDpi,
  pdfPageGeometry,
  planTiles,
} from './printPdf';

const BUSINESS_CARD = { width: 85, height: 55 };

function jpeg(width = 8, height = 8): Uint8Array {
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#005538';
  ctx.fillRect(0, 0, width, height);
  return new Uint8Array(canvas.toBuffer('image/jpeg'));
}

describe('planTiles', () => {
  it('returns a single tile when the output fits', () => {
    const tiles = planTiles({ widthPx: 1000, heightPx: 600, pixelRatio: 2 });
    expect(tiles).toEqual([
      {
        x: 0,
        y: 0,
        width: 1000,
        height: 600,
        outX: 0,
        outY: 0,
        outWidth: 2000,
        outHeight: 1200,
      },
    ]);
  });

  it('splits on whole output pixels when the size is not a multiple', () => {
    // 1414 × 2000 stage px at 3.3 → 4666 × 6600 output px, max 4096 → 2 × 2.
    const pixelRatio = 3.3;
    const tiles = planTiles({ widthPx: 1414, heightPx: 2000, pixelRatio });
    expect(tiles).toHaveLength(4);
    for (const t of tiles) {
      expect(Number.isInteger(t.outX)).toBe(true);
      expect(Number.isInteger(t.outWidth)).toBe(true);
      expect(t.outWidth).toBeLessThanOrEqual(4096);
      expect(t.outHeight).toBeLessThanOrEqual(4096);
      expect(t.x * pixelRatio).toBeCloseTo(t.outX, 9);
      expect(t.width * pixelRatio).toBeCloseTo(t.outWidth, 9);
    }
    const [a, b] = tiles;
    expect(a.outX + a.outWidth).toBe(b.outX);
    expect(a.outWidth + b.outWidth).toBe(4666);
    expect(tiles[0].outHeight + tiles[2].outHeight).toBe(6600);
  });

  it('respects a smaller maxTilePx with an odd remainder', () => {
    const tiles = planTiles({ widthPx: 1001, heightPx: 10, pixelRatio: 1, maxTilePx: 500 });
    expect(tiles.map((t) => t.outWidth)).toEqual([334, 333, 334]);
    expect(tiles.map((t) => t.outX)).toEqual([0, 334, 667]);
  });
});

describe('pdfPageGeometry', () => {
  it('adds bleed and mark margin on every side', () => {
    const g = pdfPageGeometry({ trimMm: BUSINESS_CARD, bleedMm: 3 });
    expect(g.mediaBox.width).toBeCloseTo((85 + 6 + 10) * PT_PER_MM, 6);
    expect(g.mediaBox.height).toBeCloseTo((55 + 6 + 10) * PT_PER_MM, 6);
    expect(g.bleedBox).toEqual({
      x: 5 * PT_PER_MM,
      y: 5 * PT_PER_MM,
      width: 91 * PT_PER_MM,
      height: 61 * PT_PER_MM,
    });
    expect(g.trimBox.x).toBeCloseTo(8 * PT_PER_MM, 6);
    expect(g.trimBox.width).toBeCloseTo(85 * PT_PER_MM, 6);
  });
});

describe('effectiveDpi', () => {
  it('computes pixels per inch at the printed width', () => {
    expect(effectiveDpi({ naturalWidthPx: 1004, displayedWidthMm: 85 })).toBeCloseTo(300, 0);
    expect(effectiveDpi({ naturalWidthPx: 600, displayedWidthMm: 25.4 })).toBe(600);
  });
});

describe('cropMarkLines', () => {
  it('keeps every mark inside the mark margin, outside the bleed box', () => {
    const { mediaBox, bleedBox } = pdfPageGeometry({ trimMm: BUSINESS_CARD, bleedMm: 3 });
    const lines = cropMarkLines({ trimMm: BUSINESS_CARD, bleedMm: 3 });
    expect(lines).toHaveLength(8);
    const inBleed = (p: { x: number; y: number }) =>
      p.x > bleedBox.x &&
      p.x < bleedBox.x + bleedBox.width &&
      p.y > bleedBox.y &&
      p.y < bleedBox.y + bleedBox.height;
    for (const { start, end } of lines) {
      for (const p of [start, end]) {
        expect(inBleed(p)).toBe(false);
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThanOrEqual(mediaBox.width + 1e-9);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThanOrEqual(mediaBox.height + 1e-9);
      }
      const horizontal = start.y === end.y;
      const length = horizontal ? Math.abs(end.x - start.x) : Math.abs(end.y - start.y);
      expect(length).toBeCloseTo(4 * PT_PER_MM, 6);
    }
  });
});

describe('buildPrintPdf', () => {
  it('writes one page per entry with boxes and placed tiles', async () => {
    const bytes = await buildPrintPdf({
      trimMm: BUSINESS_CARD,
      bleedMm: 3,
      pages: [
        {
          tiles: [
            { jpeg: jpeg(), xMm: 0, yMm: 0, wMm: 45.5, hMm: 61 },
            { jpeg: jpeg(), xMm: 45.5, yMm: 0, wMm: 45.5, hMm: 61 },
          ],
        },
        { tiles: [{ jpeg: jpeg(), xMm: 0, yMm: 0, wMm: 91, hMm: 61 }] },
      ],
    });

    const doc = await PDFDocument.load(bytes);
    expect(doc.getPageCount()).toBe(2);
    const expected = pdfPageGeometry({ trimMm: BUSINESS_CARD, bleedMm: 3 });

    const counts: number[] = [];
    for (const page of doc.getPages()) {
      const media = page.getMediaBox();
      expect(media.width).toBeCloseTo(expected.mediaBox.width, 3);
      expect(media.height).toBeCloseTo(expected.mediaBox.height, 3);
      const trim = page.getTrimBox();
      expect(trim.x).toBeCloseTo(expected.trimBox.x, 3);
      expect(trim.y).toBeCloseTo(expected.trimBox.y, 3);
      expect(trim.width).toBeCloseTo(expected.trimBox.width, 3);
      expect(trim.height).toBeCloseTo(expected.trimBox.height, 3);
      const bleed = page.getBleedBox();
      expect(bleed.x).toBeCloseTo(expected.bleedBox.x, 3);
      expect(bleed.width).toBeCloseTo(expected.bleedBox.width, 3);
      expect(bleed.height).toBeCloseTo(expected.bleedBox.height, 3);

      const xObjects = page.node.Resources()?.lookup(PDFName.of('XObject'), PDFDict);
      counts.push(xObjects ? xObjects.keys().length : 0);
    }
    expect(counts).toEqual([2, 1]);
  });

  it('places tiles with a top-left origin offset by the mark margin', async () => {
    const bytes = await buildPrintPdf({
      trimMm: BUSINESS_CARD,
      bleedMm: 3,
      pages: [{ tiles: [{ jpeg: jpeg(), xMm: 10, yMm: 20, wMm: 30, hMm: 15 }] }],
    });
    const doc = await PDFDocument.load(bytes);
    const page = doc.getPage(0);
    const contents = page.node.Contents();
    const items: PDFObject[] =
      contents instanceof PDFArray ? contents.asArray() : contents ? [contents] : [];
    const ops = items
      .map((item) => (item instanceof PDFRef ? doc.context.lookup(item) : item))
      .map((obj) =>
        obj instanceof PDFRawStream
          ? new TextDecoder().decode(decodePDFRawStream(obj).decode())
          : ''
      )
      .join('\n');
    // drawImage emits `1 0 0 1 x y cm` (translate) followed by `w 0 0 h 0 0 cm` (scale).
    const matrices = [...ops.matchAll(/(-?[\d.]+) 0 0 (-?[\d.]+) (-?[\d.]+) (-?[\d.]+) cm/g)].map(
      (m) => m.slice(1).map(Number)
    );
    const translate = matrices.find(([a, d, e, f]) => a === 1 && d === 1 && (e !== 0 || f !== 0));
    const scale = matrices.find(([a, , e, f]) => a !== 1 && e === 0 && f === 0);
    expect(translate).toBeDefined();
    expect(scale).toBeDefined();
    expect(translate?.[2]).toBeCloseTo((5 + 10) * PT_PER_MM, 2);
    expect(translate?.[3]).toBeCloseTo(page.getHeight() - (5 + 20 + 15) * PT_PER_MM, 2);
    expect(scale?.[0]).toBeCloseTo(30 * PT_PER_MM, 2);
    expect(scale?.[1]).toBeCloseTo(15 * PT_PER_MM, 2);
    expect(ops).toMatch(/\/\S+ Do/);
  });
});
