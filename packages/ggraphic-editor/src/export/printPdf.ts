// SPDX-License-Identifier: MPL-2.0
/**
 * Druckfertiges PDF aus gerasterten Kacheln: Endformat + Beschnitt +
 * Markenrand mit Schnittmarken. Reine Funktionen über explizite Parameter —
 * kein Bezug zum Formatmodell. `pdf-lib` wird erst in `buildPrintPdf` per
 * dynamischem `import()` geladen, die Geometrie bleibt ohne die Bibliothek.
 *
 * Koordinaten der Kacheln: mm, relativ zur äußeren Beschnittkante, Ursprung
 * oben links, y nach unten (wie die Stage). PDF rechnet von unten links.
 */

export const PT_PER_MM = 72 / 25.4;

const MM_PER_INCH = 25.4;
const DEFAULT_MARK_MM = 5;
/** Abstand der Schnittmarken zur Beschnittkante, damit sie nie hineinragen. */
const MARK_GAP_MM = 1;
const MARK_STROKE_PT = 0.25;

export interface SizeMm {
  width: number;
  height: number;
}

export interface BoxPt {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PdfPageGeometry {
  mediaBox: BoxPt;
  bleedBox: BoxPt;
  trimBox: BoxPt;
}

export interface PrintTile {
  /** Stage-px (Eingabe für `toCanvas({ x, y, width, height, pixelRatio })`). */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Ganze Ziel-Pixel im Gesamtbild. */
  outX: number;
  outY: number;
  outWidth: number;
  outHeight: number;
}

export interface PrintPdfTile {
  jpeg: Uint8Array;
  xMm: number;
  yMm: number;
  wMm: number;
  hMm: number;
}

export interface PrintPdfPage {
  tiles: PrintPdfTile[];
}

function splitEvenly(total: number, maxPart: number): number[] {
  const parts = Math.max(1, Math.ceil(total / maxPart));
  const edges: number[] = [];
  for (let i = 0; i <= parts; i++) edges.push(Math.round((i * total) / parts));
  return edges;
}

/**
 * Teilt eine Stage von `widthPx × heightPx` (Stage-px) für den Export mit
 * `pixelRatio` in Kacheln von höchstens `maxTilePx` Ziel-Pixeln Kantenlänge.
 *
 * Gerechnet wird im Zielraster: Gesamtgröße `round(px * pixelRatio)`, je
 * Achse gleichmäßig in `ceil(gesamt / maxTilePx)` Teile, jede Grenze auf eine
 * ganze Ziel-Pixel-Zahl gerundet. Die Stage-Rechtecke sind diese Grenzen
 * geteilt durch `pixelRatio` (dürfen also gebrochen sein). Benachbarte Kacheln
 * teilen sich exakt dieselbe Grenze, keine wird interpoliert — das verhindert
 * Haarfugen und Überlappungen; die Summe der Kachelbreiten ist die Gesamtbreite.
 */
export function planTiles({
  widthPx,
  heightPx,
  pixelRatio,
  maxTilePx = 4096,
}: {
  widthPx: number;
  heightPx: number;
  pixelRatio: number;
  maxTilePx?: number;
}): PrintTile[] {
  const xs = splitEvenly(Math.round(widthPx * pixelRatio), maxTilePx);
  const ys = splitEvenly(Math.round(heightPx * pixelRatio), maxTilePx);
  const tiles: PrintTile[] = [];
  for (let row = 0; row < ys.length - 1; row++) {
    for (let col = 0; col < xs.length - 1; col++) {
      const outX = xs[col];
      const outY = ys[row];
      const outWidth = xs[col + 1] - outX;
      const outHeight = ys[row + 1] - outY;
      tiles.push({
        x: outX / pixelRatio,
        y: outY / pixelRatio,
        width: outWidth / pixelRatio,
        height: outHeight / pixelRatio,
        outX,
        outY,
        outWidth,
        outHeight,
      });
    }
  }
  return tiles;
}

/** Seitengeometrie in pt: MediaBox = Endformat + 2× Beschnitt + 2× Markenrand. */
export function pdfPageGeometry({
  trimMm,
  bleedMm,
  markMm = DEFAULT_MARK_MM,
}: {
  trimMm: SizeMm;
  bleedMm: number;
  markMm?: number;
}): PdfPageGeometry {
  const k = PT_PER_MM;
  return {
    mediaBox: {
      x: 0,
      y: 0,
      width: (trimMm.width + 2 * bleedMm + 2 * markMm) * k,
      height: (trimMm.height + 2 * bleedMm + 2 * markMm) * k,
    },
    bleedBox: {
      x: markMm * k,
      y: markMm * k,
      width: (trimMm.width + 2 * bleedMm) * k,
      height: (trimMm.height + 2 * bleedMm) * k,
    },
    trimBox: {
      x: (markMm + bleedMm) * k,
      y: (markMm + bleedMm) * k,
      width: trimMm.width * k,
      height: trimMm.height * k,
    },
  };
}

/** Effektive Auflösung eines Bildes, das `displayedWidthMm` breit gedruckt wird. */
export function effectiveDpi({
  naturalWidthPx,
  displayedWidthMm,
}: {
  naturalWidthPx: number;
  displayedWidthMm: number;
}): number {
  return naturalWidthPx / (displayedWidthMm / MM_PER_INCH);
}

/**
 * Schnittmarken in pt (PDF-Koordinaten): je Ecke des Endformats eine
 * waagerechte und eine senkrechte Linie, ganz im Markenrand — sie beginnen
 * `MARK_GAP_MM` außerhalb der Beschnittkante und laufen bis zum Seitenrand.
 */
export function cropMarkLines({
  trimMm,
  bleedMm,
  markMm = DEFAULT_MARK_MM,
}: {
  trimMm: SizeMm;
  bleedMm: number;
  markMm?: number;
}): Array<{ start: { x: number; y: number }; end: { x: number; y: number } }> {
  const k = PT_PER_MM;
  const { mediaBox, trimBox } = pdfPageGeometry({ trimMm, bleedMm, markMm });
  const inner = (markMm - MARK_GAP_MM) * k;
  const left = trimBox.x;
  const right = trimBox.x + trimBox.width;
  const bottom = trimBox.y;
  const top = trimBox.y + trimBox.height;
  const W = mediaBox.width;
  const H = mediaBox.height;
  return [
    // waagerecht, links und rechts auf Höhe der oberen/unteren Schnittkante
    { start: { x: 0, y: top }, end: { x: inner, y: top } },
    { start: { x: 0, y: bottom }, end: { x: inner, y: bottom } },
    { start: { x: W - inner, y: top }, end: { x: W, y: top } },
    { start: { x: W - inner, y: bottom }, end: { x: W, y: bottom } },
    // senkrecht, oben und unten auf Höhe der linken/rechten Schnittkante
    { start: { x: left, y: H - inner }, end: { x: left, y: H } },
    { start: { x: right, y: H - inner }, end: { x: right, y: H } },
    { start: { x: left, y: 0 }, end: { x: left, y: inner } },
    { start: { x: right, y: 0 }, end: { x: right, y: inner } },
  ];
}

/**
 * Baut das Druck-PDF: eine Seite je Eintrag in `pages`, jede Kachel als JPEG
 * platziert, TrimBox/BleedBox gesetzt, Schnittmarken 0,25 pt in 100 % K.
 */
export async function buildPrintPdf({
  pages,
  trimMm,
  bleedMm,
}: {
  pages: PrintPdfPage[];
  trimMm: SizeMm;
  bleedMm: number;
}): Promise<Uint8Array> {
  const { PDFDocument, cmyk } = await import('pdf-lib');
  const k = PT_PER_MM;
  const markMm = DEFAULT_MARK_MM;
  const { mediaBox, bleedBox, trimBox } = pdfPageGeometry({ trimMm, bleedMm, markMm });
  const marks = cropMarkLines({ trimMm, bleedMm, markMm });

  const doc = await PDFDocument.create();
  for (const page of pages) {
    const pdfPage = doc.addPage([mediaBox.width, mediaBox.height]);
    pdfPage.setBleedBox(bleedBox.x, bleedBox.y, bleedBox.width, bleedBox.height);
    pdfPage.setTrimBox(trimBox.x, trimBox.y, trimBox.width, trimBox.height);

    for (const tile of page.tiles) {
      const image = await doc.embedJpg(tile.jpeg);
      pdfPage.drawImage(image, {
        x: (markMm + tile.xMm) * k,
        y: mediaBox.height - (markMm + tile.yMm + tile.hMm) * k,
        width: tile.wMm * k,
        height: tile.hMm * k,
      });
    }

    for (const line of marks) {
      pdfPage.drawLine({ ...line, thickness: MARK_STROKE_PT, color: cmyk(0, 0, 0, 1) });
    }
  }
  return doc.save();
}
