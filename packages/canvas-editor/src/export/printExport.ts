import { mmToPx, type PrintCanvasFormat } from '@ggraphic/editor/formats/index';

import {
  buildPrintPdf,
  effectiveDpi,
  planTiles,
  type PrintPdfPage,
  type PrintTile,
} from './printPdf';

export const PRINT_JPEG_QUALITY = 0.92;
/** A photo warns below this share of its format's export resolution (150 of 300 dpi). */
const MIN_PRINT_DPI_SHARE = 0.5;

export interface PrintExportImage {
  naturalWidthPx: number;
  displayedWidthPx: number;
}

/** What the export needs from one editor page. */
export interface PrintExportPage {
  captureTile: (tile: PrintTile, pixelRatio: number) => Promise<Uint8Array | null>;
  getImages: () => PrintExportImage[];
}

/** Stage px → output px so that the canvas comes out at `exportDpi`. */
export function printPixelRatio(format: PrintCanvasFormat): number {
  return format.print.exportDpi / 25.4 / mmToPx(format, 1);
}

/** The PDF filename for a document title (no path characters, never empty). */
export function printPdfFilename(title: string | null): string {
  const cleaned = Array.from(title ?? '')
    .map((ch) => (ch.charCodeAt(0) < 32 || /[\\/:*?"<>|]/.test(ch) ? ' ' : ch))
    .join('')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .trim();
  return `${cleaned || 'gruenerator-druck'}.pdf`;
}

/**
 * Tiles of one page with their mm placement. The placement comes from the
 * whole-pixel output rects relative to the total output size, never from the
 * fractional stage rects — those would open seams between tiles.
 */
export function planPrintPage(format: PrintCanvasFormat): {
  tiles: Array<{ tile: PrintTile; xMm: number; yMm: number; wMm: number; hMm: number }>;
  pixelRatio: number;
} {
  const pixelRatio = printPixelRatio(format);
  const { trimMm, bleedMm } = format.print;
  const canvasWidthMm = trimMm.w + 2 * bleedMm;
  const canvasHeightMm = trimMm.h + 2 * bleedMm;
  const totalW = Math.round(format.width * pixelRatio);
  const totalH = Math.round(format.height * pixelRatio);
  const tiles = planTiles({ widthPx: format.width, heightPx: format.height, pixelRatio }).map(
    (tile) => ({
      tile,
      xMm: (tile.outX / totalW) * canvasWidthMm,
      yMm: (tile.outY / totalH) * canvasHeightMm,
      wMm: (tile.outWidth / totalW) * canvasWidthMm,
      hMm: (tile.outHeight / totalH) * canvasHeightMm,
    })
  );
  return { tiles, pixelRatio };
}

export async function exportPrintPdf({
  format,
  pages,
  onProgress,
}: {
  format: PrintCanvasFormat;
  pages: PrintExportPage[];
  onProgress?: (done: number, total: number) => void;
}): Promise<Uint8Array> {
  const { tiles, pixelRatio } = planPrintPage(format);
  const pdfPages: PrintPdfPage[] = [];
  const total = pages.length * tiles.length;
  let done = 0;

  for (let p = 0; p < pages.length; p++) {
    const out: PrintPdfPage = { tiles: [] };
    for (const planned of tiles) {
      const jpeg = await pages[p].captureTile(planned.tile, pixelRatio);
      if (!jpeg) throw new Error(`Seite ${p + 1} konnte nicht exportiert werden`);
      out.tiles.push({
        jpeg,
        xMm: planned.xMm,
        yMm: planned.yMm,
        wMm: planned.wMm,
        hMm: planned.hMm,
      });
      onProgress?.(++done, total);
    }
    pdfPages.push(out);
  }

  return buildPrintPdf({
    pages: pdfPages,
    trimMm: { width: format.print.trimMm.w, height: format.print.trimMm.h },
    bleedMm: format.print.bleedMm,
  });
}

/** One notice per photo that prints below half the format's export resolution. */
export function lowResolutionWarnings(
  format: PrintCanvasFormat,
  pages: Array<Pick<PrintExportPage, 'getImages'>>
): string[] {
  const pxPerMm = mmToPx(format, 1);
  const warnings: string[] = [];
  let n = 0;
  for (const page of pages) {
    for (const image of page.getImages()) {
      n += 1;
      const dpi = effectiveDpi({
        naturalWidthPx: image.naturalWidthPx,
        displayedWidthMm: image.displayedWidthPx / pxPerMm,
      });
      if (Number.isFinite(dpi) && dpi < format.print.exportDpi * MIN_PRINT_DPI_SHARE) {
        warnings.push(
          `Foto ${n} ist für den Druck zu klein (ca. ${Math.round(dpi)} dpi, empfohlen ${format.print.exportDpi}).`
        );
      }
    }
  }
  return warnings;
}
