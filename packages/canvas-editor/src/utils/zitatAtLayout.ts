/**
 * Zitat-AT Layout (Österreich / de-AT)
 *
 * Eigene Geometrie statt der deutschen ZITAT_CONFIG. Die CI 2026 setzt das
 * Zitat mittig statt linksbündig, das Anführungszeichen gelb und mittig über
 * den Text, das Logo rechts oben — und sie ankert den Block nicht am unteren
 * Rand, sondern zentriert ihn als Gruppe im unteren Bilddrittel.
 *
 * Spiegelbild von apps/api/routes/sharepic/sharepic_canvas/at/zitat_at_canvas.ts.
 */

import { SYSTEM_ASSETS } from './canvasAssets';
import { wrapTextAccurate } from './textUtils';

export const ZITAT_AT_CONFIG = {
  canvas: { width: 1080, height: 1350 },
  /** Seitenrand des Satzspiegels — deutlich breiter als die deutschen 50 px. */
  margin: 130,
  maxWidth: 820,
  /**
   * Der Textblock hängt nicht am Bildboden, sondern wird als Gruppe
   * (Anführungszeichen + Zitat + Name) um diese Höhe zentriert.
   */
  groupCenterRatio: 0.48,
  quotationMark: {
    src: SYSTEM_ASSETS.quote.gelb.src,
    /** markSize = fontSize * sizeRatio */
    sizeRatio: 1.15,
    gapToText: 22,
  },
  quote: {
    fontSize: 56,
    minFontSize: 40,
    maxFontSize: 72,
    lineHeightRatio: 1.15,
  },
  author: {
    /** nameFontSize = fontSize * fontSizeRatio */
    fontSizeRatio: 0.6,
    /** Abstand über dem Namen = fontSize * gapFromQuoteRatio */
    gapFromQuoteRatio: 0.75,
  },
  logo: {
    width: 150,
    /** Höhe folgt dem nativen Seitenverhältnis des Assets (1239 × 1410). */
    height: Math.round(150 * (1410 / 1239)),
    margin: 70,
  },
  /**
   * Nur ein leichter grauer Schleier über dem Foto — die österreichische CI
   * kennt keinen grünen oder schwarzen Verlauf. Der Text trägt seinen
   * Kontrast über die eigene Farbe (Weiß/Gelb), nicht über abgedunkeltes Foto.
   */
  gradient: {
    color: '229, 231, 233',
    bottomOpacity: 0.35,
  },
} as const;

export interface ZitatAtLayoutResult {
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

/**
 * Setzt den Block und zentriert ihn anschließend um `groupCenterRatio`.
 * Ohne Name entfällt dessen Zeile aus der Gruppenhöhe, damit kurze Zitate
 * nicht nach oben rutschen.
 */
export function calculateZitatAtLayout(
  quoteText: string,
  name: string,
  fontSize: number = ZITAT_AT_CONFIG.quote.fontSize,
  fontFamily = 'GothamNarrow-Ultra'
): ZitatAtLayoutResult {
  const c = ZITAT_AT_CONFIG;
  const quoteFontSize = Math.max(
    c.quote.minFontSize,
    Math.min(c.quote.maxFontSize, Math.round(fontSize))
  );
  const lineHeight = Math.round(quoteFontSize * c.quote.lineHeightRatio);
  const authorFontSize = Math.round(quoteFontSize * c.author.fontSizeRatio);
  const quoteMarkSize = Math.round(quoteFontSize * c.quotationMark.sizeRatio);
  const nameGap = Math.round(quoteFontSize * c.author.gapFromQuoteRatio);

  const quoteLines = wrapTextAccurate(quoteText, c.maxWidth, quoteFontSize, fontFamily);
  const quoteHeight = quoteLines.length * lineHeight;
  const nameHeight = name ? nameGap + authorFontSize : 0;

  const groupHeight = quoteMarkSize + c.quotationMark.gapToText + quoteHeight + nameHeight;
  const groupTop = Math.round(c.canvas.height * c.groupCenterRatio - groupHeight / 2);

  const quoteY = groupTop + quoteMarkSize + c.quotationMark.gapToText;

  return {
    quoteFontSize,
    authorFontSize,
    lineHeight,
    quoteMarkSize,
    quoteMarkX: Math.round((c.canvas.width - quoteMarkSize) / 2),
    quoteMarkY: groupTop,
    quoteY,
    authorY: quoteY + quoteHeight + nameGap,
    quoteLines,
  };
}
