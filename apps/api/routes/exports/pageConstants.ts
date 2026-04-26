/**
 * Server-side page-size helpers for canvas PDF export.
 *
 * The full format registry lives in `packages/canvas-editor/src/formats/index.ts`
 * and drives the frontend UI. This file mirrors only the paper sizes needed by
 * the backend PDF wrapper — no react-konva, no react. Keep these constants in
 * sync when the registry is changed.
 */

export const MM_TO_POINTS = 2.834645; // 1 mm = 1/25.4 inch * 72 points

const mm = (n: number): number => n * MM_TO_POINTS;

/** Paper sizes in PDF points. Portrait orientation. */
export const PAPER_SIZE_POINTS = {
  A5: [mm(148), mm(210)] as const,
  A4: [mm(210), mm(297)] as const,
  A3: [mm(297), mm(420)] as const,
};

export interface CanvasFormatLite {
  id: string;
  category: 'digital' | 'print';
  width: number; // pixels
  height: number; // pixels
  dpi: number;
  bleedPx?: number;
  paperMm?: { w: number; h: number };
}

/**
 * Format-id → server-known dimensions. Matches packages/canvas-editor/src/formats/index.ts.
 */
export const SERVER_FORMATS: Readonly<Record<string, CanvasFormatLite>> = {
  'post-portrait': {
    id: 'post-portrait',
    category: 'digital',
    width: 1080,
    height: 1350,
    dpi: 72,
  },
  story: {
    id: 'story',
    category: 'digital',
    width: 1080,
    height: 1920,
    dpi: 72,
  },
  'presentation-16-9': {
    id: 'presentation-16-9',
    category: 'digital',
    width: 1920,
    height: 1080,
    dpi: 72,
  },
  'presentation-4-3': {
    id: 'presentation-4-3',
    category: 'digital',
    width: 1600,
    height: 1200,
    dpi: 72,
  },
  'flyer-a5': {
    id: 'flyer-a5',
    category: 'print',
    width: 1748,
    height: 2480,
    dpi: 300,
    bleedPx: 36,
    paperMm: { w: 148, h: 210 },
  },
  'flyer-a4': {
    id: 'flyer-a4',
    category: 'print',
    width: 2480,
    height: 3508,
    dpi: 300,
    bleedPx: 36,
    paperMm: { w: 210, h: 297 },
  },
  'plakat-a3': {
    id: 'plakat-a3',
    category: 'print',
    width: 3508,
    height: 4961,
    dpi: 300,
    bleedPx: 36,
    paperMm: { w: 297, h: 420 },
  },
  'plakat-a2': {
    id: 'plakat-a2',
    category: 'print',
    width: 4961,
    height: 7016,
    dpi: 300,
    bleedPx: 36,
    paperMm: { w: 420, h: 594 },
  },
};

export function getServerFormat(id: string): CanvasFormatLite | null {
  return SERVER_FORMATS[id] ?? null;
}

/**
 * Returns the PDF page size [width, height] in points for a format.
 * Print formats use exact paper-mm dimensions (with optional bleed added);
 * digital formats use their pixel dimensions at 72 DPI (1 px = 1 point).
 */
export function paperSizeForFormat(
  format: CanvasFormatLite,
  withBleed = false
): readonly [number, number] {
  if (format.category === 'print' && format.paperMm) {
    const bleedMm = withBleed && format.bleedPx ? (format.bleedPx / format.dpi) * 25.4 : 0;
    return [mm(format.paperMm.w + bleedMm * 2), mm(format.paperMm.h + bleedMm * 2)];
  }
  return [format.width, format.height];
}
