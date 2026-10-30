/**
 * Messer für den Folien-Überlauf: Ein Zeichenbudget ist eine Schätzung der
 * Breite; `serverMeasureText` misst den umbrochenen Text in der Schrift des
 * Elements, `fitSlideTexts` (Contracts) passt ihn damit in seine Box ein.
 */

import { getBrandPack } from '@gruenerator/contracts/brand';
import { type MeasureText } from '@gruenerator/contracts/slides';

import {
  countLinesSync,
  deckFaces,
  faceRegistered,
  metricsReady,
  textWidthSync,
} from '../../routes/presentations/slideTextMetrics.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('canvasDeckOverflow');

type Brand = 'de-DE' | 'de-AT';

let warned = false;

/**
 * Measuring needs @napi-rs/canvas and the brand fonts (private content
 * checkout). Without them the budgets alone have to hold; says so once.
 */
export async function prepareOverflowMeasuring(brand: Brand): Promise<boolean> {
  const ready = await metricsReady();
  const faces = deckFaces(brand);
  const ok = ready && faceRegistered(faces.heading) && faceRegistered(faces.body);
  if (!ok && !warned) {
    warned = true;
    log.warn('Markenschrift nicht verfügbar — Überlauf wird nur über die Zeichenbudgets begrenzt');
  }
  return ok;
}

/**
 * Der Messer für `fitSlideTexts`: Zeilenzählung der Folien-Metriken, Schrift
 * nach Familie des Elements (Überschriftenschrift der Marke → Deck-Kopfschrift,
 * Betonungsschrift → Zitatschrift, sonst Fließschrift). Null, wenn Markenschrift
 * oder Canvas fehlen — dann gelten allein die Zeichenbudgets. Braucht
 * `prepareOverflowMeasuring` vorher.
 */
export function serverMeasureText(brand: Brand): MeasureText | null {
  const faces = deckFaces(brand);
  const fonts = getBrandPack(brand).fonts;
  const faceFor = (family: string) => {
    if (family === fonts.headline || family === fonts.quoteShort) return faces.heading;
    if (family === fonts.quoteEmphasis && faces.quote) return faces.quote;
    return faces.body;
  };
  const probe = countLinesSync([{ text: 'x' }], {
    maxWidthPx: 100,
    fontPx: 20,
    faces,
    face: faces.body,
  });
  if (probe === null || !faceRegistered(faces.heading) || !faceRegistered(faces.body)) return null;
  return (text, font, width) => {
    const opts = {
      maxWidthPx: width,
      fontPx: font.size,
      faces,
      face: faceFor(font.family),
    };
    // Ein Wort, das breiter ist als die Box, bricht Konva (wrap 'word') mitten im Wort um,
    // die Zeilenzählung (Browser-Verhalten) zählt es als eine Zeile. Beides ist für eine
    // Überschrift unbrauchbar: so eine Größe passt nicht, es wird weiter verkleinert und
    // am Ende als Überlauf gemeldet.
    for (const word of text.split(/\s+/)) {
      if (word !== '' && (textWidthSync(word, opts) ?? 0) > width) {
        return { height: Infinity };
      }
    }
    const lines = countLinesSync([{ text }], opts) ?? 1;
    return { height: lines * font.size * font.lineHeight };
  };
}
