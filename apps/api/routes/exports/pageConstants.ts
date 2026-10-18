/**
 * Server-side format registry.
 *
 * The full format registry lives in `packages/canvas-editor/src/formats/index.ts`
 * and drives the frontend UI. This file mirrors the server-known format ids — no
 * react-konva, no react. Keep in sync when the registry is changed.
 */

export type CanvasFormatCategoryLite = 'digital' | 'print';

export interface CanvasPrintSpecLite {
  trimMm: { w: number; h: number };
  bleedMm: number;
  safeMm: number;
  exportDpi: number;
  seiten: 1 | 2;
}

export interface CanvasFormatLite {
  id: string;
  category: CanvasFormatCategoryLite;
  width: number; // pixels
  height: number; // pixels
  dpi: number;
  print: CanvasPrintSpecLite | null;
}

const digital = (id: string, width: number, height: number): CanvasFormatLite => ({
  id,
  category: 'digital',
  width,
  height,
  dpi: 72,
  print: null,
});

const print = (
  id: string,
  width: number,
  height: number,
  trimMm: { w: number; h: number },
  safeMm: number,
  seiten: 1 | 2,
  exportDpi = 300
): CanvasFormatLite => ({
  id,
  category: 'print',
  width,
  height,
  dpi: exportDpi,
  print: { trimMm, bleedMm: 3, safeMm, exportDpi, seiten },
});

/**
 * Format-id → server-known dimensions. Matches packages/canvas-editor/src/formats/index.ts.
 */
export const SERVER_FORMATS: Readonly<Record<string, CanvasFormatLite>> = {
  'post-portrait': digital('post-portrait', 1080, 1350),
  'post-portrait-tall': digital('post-portrait-tall', 1080, 1440),
  'profile-square': digital('profile-square', 1080, 1080),
  'print-visitenkarte-quer': print('print-visitenkarte-quer', 2000, 1341, { w: 85, h: 55 }, 3, 2),
  'print-visitenkarte-hoch': print('print-visitenkarte-hoch', 1341, 2000, { w: 55, h: 85 }, 3, 2),
  'print-a3-hoch': print('print-a3-hoch', 1423, 2000, { w: 297, h: 420 }, 4, 1),
  'print-a4-hoch': print('print-a4-hoch', 1426, 2000, { w: 210, h: 297 }, 4, 1),
  'print-a3-quer': print('print-a3-quer', 2000, 1423, { w: 420, h: 297 }, 4, 1),
  'print-a1-hoch': print('print-a1-hoch', 1417, 2000, { w: 594, h: 841 }, 10, 1, 150),
  'print-a1-quer': print('print-a1-quer', 2000, 1417, { w: 841, h: 594 }, 10, 1, 150),
  'print-grossflaeche': print('print-grossflaeche', 2000, 1420, { w: 594, h: 420 }, 10, 1, 150),
  'print-citylight': print('print-citylight', 1365, 2000, { w: 237, h: 350 }, 8, 1, 150),
};

export function getServerFormat(id: string): CanvasFormatLite | null {
  return SERVER_FORMATS[id] ?? null;
}

/**
 * Category of a stored format id. By prefix, not by lookup: a canvas saved by a
 * newer client with a print id this server does not know is still print, and
 * legacy/absent ids render as the digital default.
 */
export function formatCategory(id: string | null): CanvasFormatCategoryLite {
  return id?.startsWith('print-') ? 'print' : 'digital';
}

/** Would moving a canvas from `stored` to `next` cross between digital and print? */
export function crossesFormatCategory(stored: string | null, next: string): boolean {
  return formatCategory(stored) !== formatCategory(next);
}
