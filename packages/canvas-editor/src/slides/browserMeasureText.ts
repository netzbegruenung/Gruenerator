/**
 * Textmesser für den Browser: dieselbe Form wie `serverMeasureText` (API),
 * damit `restyleDeck` zu langen Text in die Box des neuen Stils einpasst.
 * Gemessen wird mit der Zeilenumbruch-Logik der Fläche (`wrapTextAccurate`).
 */
import { ensureFontsReady } from '@ggraphic/editor/utils/ensureFontsReady';
import { measureTextWidthWithFont, wrapTextAccurate } from '@ggraphic/editor/utils/textUtils';

import type { MeasureText } from '@gruenerator/contracts/slides';

/** Wartet auf die Schriften, damit nicht in der Ersatzschrift gemessen wird. */
export async function browserMeasureText(): Promise<MeasureText> {
  await ensureFontsReady();
  return (text, font, width) => {
    // Ein Wort, das breiter ist als die Box, bricht Konva mitten im Wort um:
    // so eine Größe passt nicht (wie `serverMeasureText`).
    for (const word of text.split(/\s+/)) {
      if (word !== '' && measureTextWidthWithFont(word, font.size, font.family, 'normal') > width) {
        return { height: Infinity };
      }
    }
    const lines = wrapTextAccurate(text, width, font.size, font.family, 'normal');
    return { height: lines.length * font.size * font.lineHeight };
  };
}
