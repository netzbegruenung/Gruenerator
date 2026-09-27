/**
 * Zusammensetzen der pdfjs-Text-Items über die Seiten-Geometrie.
 *
 * pdfjs gibt Binde-/Gedankenstriche und Wortfragmente als eigene Items aus;
 * ein `join(' ')` erfindet dort Leerzeichen, wo im PDF keine sind — daraus
 * wurde `KI - Anfragen` und `Zwe i - Faktor` (#2830). Ob zwischen zwei Items
 * Leerraum gehört, entscheidet deshalb die Geometrie: beginnt das nächste Item
 * (`transform[4]`) dort, wo das vorige endete (`transform[4] + width`), wird
 * nahtlos angefügt. Zeilenwechsel kommen als `hasEOL`-Items bzw. als Sprung der
 * Grundlinie und werden zu `\n` — damit arbeitet `applyMarkdownFormatting`
 * auf echten Zeilen statt auf einer Seite als Einzeiler.
 *
 * Was hier NICHT reparierbar ist: gesperrt gesetzter Text (`D a t e n a r t`).
 * pdfjs baut diese Leerzeichen bereits INNERHALB eines Items in `str` ein;
 * zwischen den Items ist nichts mehr zu entscheiden.
 */

export interface PdfTextItem {
  str?: string;
  transform?: number[];
  width?: number;
  hasEOL?: boolean;
}

/** Ab dieser Lücke (in em der aktuellen Schriftgröße) gilt: Wortzwischenraum.
 *  Gemessene Fragment-Lücken innerhalb von Wörtern liegen bei ≤ 0,03 em,
 *  echte Wortabstände bei ≥ 0,25 em. */
const SPACE_GAP_EM = 0.15;

export function joinPdfTextItems(items: PdfTextItem[]): string {
  let out = '';
  let prevEndX = 0;
  let prevY: number | null = null;
  let atLineStart = true;

  for (const item of items) {
    const str = item.str ?? '';
    const t = item.transform;

    if (!t || t.length < 6) {
      // Ohne Geometrie bleibt nur der alte Weg: mit Leerzeichen anfügen.
      if (str) {
        if (!atLineStart) out += ' ';
        out += str;
        atLineStart = false;
      }
      if (item.hasEOL && !atLineStart) {
        out += '\n';
        atLineStart = true;
      }
      prevY = null;
      continue;
    }

    const x = t[4];
    const y = t[5];
    const fontSize = Math.hypot(t[2], t[3]) || 1;

    if (prevY !== null && Math.abs(y - prevY) > fontSize * 0.5 && !atLineStart) {
      out += '\n';
      atLineStart = true;
    }

    if (str) {
      if (!atLineStart && x - prevEndX > fontSize * SPACE_GAP_EM && !out.endsWith(' ')) {
        out += ' ';
      }
      out += str;
      atLineStart = false;
    }

    if (item.hasEOL && !atLineStart) {
      out += '\n';
      atLineStart = true;
    }

    prevEndX = x + (item.width ?? 0);
    prevY = y;
  }

  return out
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();
}
