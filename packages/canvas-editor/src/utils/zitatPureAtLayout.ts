/**
 * Zitat-Pur AT Layout (Österreich / de-AT)
 *
 * Eigene Geometrie statt der deutschen ZITAT_PURE_CONFIG. Aus der Guideline
 * zurückgerechnet: Satzmaß ~0,79 der Blattbreite, Schriftgrad ~72 px,
 * Anführungszeichen weiß und mittig darüber, Name gelb dicht darunter, der
 * ganze Block mittig auf dem Blatt.
 *
 * Anders als beim Foto-Sujet (zitatAtLayout) steht das Anführungszeichen hier
 * in Weiß — die Guideline zeigt Gelb nur auf dem Foto.
 *
 * Spiegelbild von
 * apps/api/routes/sharepic/sharepic_canvas/at/zitat_pure_at_canvas.ts.
 */

import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapTextAccurate } from './textUtils';

export const ZITAT_PURE_AT_CONFIG = {
  canvas: { width: 1080, height: 1350 },
  margin: 115,
  maxWidth: 850,
  /** Ohne Foto trägt die Fläche allein — der Block sitzt genau mittig. */
  groupCenterRatio: 0.5,
  quotationMark: {
    src: SYSTEM_ASSETS.quote.white.src,
    /**
     * markSize = fontSize * sizeRatio. Das Asset hat rundum Luft: die sichtbare
     * Tinte misst nur ~0,7 der Kastenhöhe, deshalb der Faktor über 1.
     */
    sizeRatio: 1.47,
    gapToText: 26,
  },
  quote: {
    fontFamily: 'GothamNarrow-Ultra',
    fontSize: 72,
    minFontSize: 46,
    maxFontSize: 88,
    lineHeightRatio: 1.15,
    /** Ab dieser Zeilenzahl wird verkleinert, darunter darf vergrößert werden. */
    maxLines: 5,
    growBelowLines: 3,
  },
  author: {
    /** nameFontSize = fontSize * fontSizeRatio → ~34 px bei Grundgröße. */
    fontSizeRatio: 0.47,
    /**
     * Abstand über dem Namen = fontSize * gapFromQuoteRatio. Aus der Guideline
     * gemessen: ~77 px sichtbare Lücke zwischen Zitat-Unterlänge und Name; die
     * Zeilenkästen tragen davon rund 33 px, der Rest steht hier.
     */
    gapFromQuoteRatio: 0.61,
  },
  /** Der Block darf diese Ränder nicht verlassen. */
  topBoundary: 120,
  bottomBoundary: 1230,
} as const;

export interface ZitatPureAtLayoutResult {
  quoteFontSize: number;
  authorFontSize: number;
  lineHeight: number;
  quoteMarkSize: number;
  quoteMarkX: number;
  quoteMarkY: number;
  quoteY: number;
  authorY: number;
  quoteLines: string[];
}

const C = ZITAT_PURE_AT_CONFIG;

const measure = (text: string, fontSize: number) =>
  wrapTextAccurate(text, C.maxWidth, fontSize, C.quote.fontFamily);

/**
 * Sucht den Schriftgrad, mit dem der Block in die Satzhöhe passt, und
 * zentriert ihn dann als Gruppe.
 *
 * Die Zeilenzahl wird mit der echten Schrift gemessen, nicht mit der
 * 0,5-Zeichenbreiten-Schätzung: bei Gotham Narrow Ultra liegt die um mehrere
 * Zeilen daneben, wodurch der Name im alten Aufbau frei unter dem Zitat
 * schwebte.
 */
export function calculateZitatPureAtLayout(
  quoteText: string,
  name: string,
  // Die Faktory setzt den Schlüssel auf `null`, nicht auf `undefined` — auf
  // `undefined` zu prüfen hätte das Autofit stumm nie laufen lassen.
  customFontSize?: number | null
): ZitatPureAtLayoutResult {
  let fontSize = Math.max(
    C.quote.minFontSize,
    Math.min(C.quote.maxFontSize, Math.round(customFontSize ?? C.quote.fontSize))
  );
  let lines = measure(quoteText, fontSize);

  if (customFontSize == null) {
    // Kurze Zitate dürfen wachsen, lange müssen weichen.
    while (lines.length <= C.quote.growBelowLines && fontSize < C.quote.maxFontSize) {
      const next = measure(quoteText, fontSize + 4);
      if (next.length > C.quote.growBelowLines) break;
      fontSize += 4;
      lines = next;
    }
    while (lines.length > C.quote.maxLines && fontSize > C.quote.minFontSize) {
      fontSize -= 4;
      lines = measure(quoteText, fontSize);
    }
  }

  const lineHeight = Math.round(fontSize * C.quote.lineHeightRatio);
  const authorFontSize = Math.round(fontSize * C.author.fontSizeRatio);
  const quoteMarkSize = Math.round(fontSize * C.quotationMark.sizeRatio);
  const nameGap = Math.round(fontSize * C.author.gapFromQuoteRatio);

  const quoteHeight = lines.length * lineHeight;
  const nameHeight = name ? nameGap + authorFontSize : 0;
  const groupHeight = quoteMarkSize + C.quotationMark.gapToText + quoteHeight + nameHeight;

  const centred = Math.round(C.canvas.height * C.groupCenterRatio - groupHeight / 2);
  const groupTop = Math.max(C.topBoundary, Math.min(centred, C.bottomBoundary - groupHeight));
  const quoteY = groupTop + quoteMarkSize + C.quotationMark.gapToText;

  return {
    quoteFontSize: fontSize,
    authorFontSize,
    lineHeight,
    quoteMarkSize,
    quoteMarkX: Math.round((C.canvas.width - quoteMarkSize) / 2),
    quoteMarkY: groupTop,
    quoteY,
    authorY: quoteY + quoteHeight + nameGap,
    quoteLines: lines,
  };
}
