/**
 * Server-side format registry.
 *
 * The full format registry is the editor's built-ins plus the Grünerator's own
 * formats (`registerGrueneFormats` in packages/canvas-editor) and drives the
 * frontend UI. This file mirrors the server-known format ids — no
 * react-konva, no react. Keep in sync when the registry is changed.
 */

export type CanvasFormatCategoryLite = 'digital' | 'print';

export interface CanvasPrintSpecLite {
  trimMm: { w: number; h: number };
  bleedMm: number;
  safeMm: number;
  exportDpi: number;
  pageCount: number;
  imprint: 'every-page' | 'first-page' | 'last-page' | null;
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
  pageCount: number,
  exportDpi = 300,
  imprint: CanvasPrintSpecLite['imprint'] = pageCount === 1 ? 'every-page' : null
): CanvasFormatLite => ({
  id,
  category: 'print',
  width,
  height,
  dpi: exportDpi,
  print: { trimMm, bleedMm: 3, safeMm, exportDpi, pageCount, imprint },
});

/**
 * Format-id → server-known dimensions. Matches `@ggraphic/editor/formats`.
 */
export const SERVER_FORMATS: Readonly<Record<string, CanvasFormatLite>> = {
  'post-portrait': digital('post-portrait', 1080, 1350),
  'post-portrait-tall': digital('post-portrait-tall', 1080, 1440),
  'profile-square': digital('profile-square', 1080, 1080),
  'slide-16-9': digital('slide-16-9', 1920, 1080),
  'print-visitenkarte-quer': print('print-visitenkarte-quer', 2000, 1341, { w: 85, h: 55 }, 3, 2),
  'print-visitenkarte-hoch': print('print-visitenkarte-hoch', 1341, 2000, { w: 55, h: 85 }, 3, 2),
  'print-a3-hoch': print('print-a3-hoch', 1423, 2000, { w: 297, h: 420 }, 4, 1),
  'print-a4-hoch': print('print-a4-hoch', 1426, 2000, { w: 210, h: 297 }, 4, 1),
  'print-a3-quer': print('print-a3-quer', 2000, 1423, { w: 420, h: 297 }, 4, 1),
  'print-a1-hoch': print('print-a1-hoch', 1417, 2000, { w: 594, h: 841 }, 10, 1, 150),
  'print-a1-quer': print('print-a1-quer', 2000, 1417, { w: 841, h: 594 }, 10, 1, 150),
  'print-grossflaeche': print('print-grossflaeche', 2000, 1420, { w: 594, h: 420 }, 10, 1, 150),
  'print-citylight': print('print-citylight', 1365, 2000, { w: 237, h: 350 }, 8, 1, 150),
  'print-flyer-dinlang': print(
    'print-flyer-dinlang',
    2000,
    1426,
    { w: 297, h: 210 },
    4,
    2,
    300,
    'first-page'
  ),
  'print-a6-hoch': print('print-a6-hoch', 1442, 2000, { w: 105, h: 148 }, 3, 2, 300, 'last-page'),
  'print-a6-quer': print('print-a6-quer', 2000, 1442, { w: 148, h: 105 }, 3, 2, 300, 'last-page'),
  'print-briefbogen-a4': print('print-briefbogen-a4', 1426, 2000, { w: 210, h: 297 }, 5, 2),
  'print-zeitung-a4': print(
    'print-zeitung-a4',
    1426,
    2000,
    { w: 210, h: 297 },
    5,
    4,
    300,
    'last-page'
  ),
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
