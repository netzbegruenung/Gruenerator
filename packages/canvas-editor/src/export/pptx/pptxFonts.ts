/**
 * Canvas-Schriftnamen → Schriftnamen für PowerPoint.
 *
 * Der Canvas spricht Schriften über die `@font-face`-Aliase aus
 * `styles/typography.css` an (`GrueneTypeNeue`, `GothamNarrow-Ultra` …).
 * PowerPoint sucht eine Schrift über den Familiennamen der installierten
 * Datei (Name-ID 1) plus fett/kursiv. Die Namen unten stehen so in den
 * Name-Tabellen der Dateien unter `packages/canvas-editor/fonts/` (mit
 * fontkit ausgelesen, 22.10.2026).
 */

export interface PptxFontFace {
  fontFace: string;
  bold: boolean;
  italic: boolean;
}

type FontMapper = (bold: boolean, italic: boolean) => PptxFontFace;

/**
 * Bei Gotham Narrow und GrueneType ist jede Datei ein eigener Schnitt mit
 * eigener Familie (ID 1) und Unterfamilie „Regular“; fett/kursiv vom Canvas
 * gehen dann wie im Browser als künstlicher Schnitt mit.
 */
const family =
  (name: string): FontMapper =>
  (bold, italic) => ({ fontFace: name, bold, italic });

const PPTX_FONTS: Record<string, FontMapper> = {
  // PT Sans: eine Familie mit Regular, Bold, Italic.
  'PT Sans': family('PT Sans'),
  GrueneTypeNeue: family('GrueneType Neue'),
  // Die Datei ist selbst der kursive Black-Condensed-Schnitt.
  GrueneType: family('GrueneType Black Cond Italic'),
  'GothamNarrow-Ultra': family('Gotham Narrow Ultra'),
  'GothamNarrow-Book': family('Gotham Narrow Book'),
  'GothamNarrow-Bold': family('Gotham Narrow Bold'),
  // typography.css: Vollkorn kursiv = Datei BoldItalic (Familie „Vollkorn“,
  // Bold Italic), fett kursiv = Datei BlackItalic (Familie „Vollkorn Black“).
  Vollkorn: (bold) =>
    bold
      ? { fontFace: 'Vollkorn Black', bold: false, italic: true }
      : { fontFace: 'Vollkorn', bold: true, italic: true },
  Raleway: family('Raleway'),
};

/** Der erste Eintrag eines CSS-Stacks, ohne Anführungszeichen. */
function primaryFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Unbekannte Namen gehen unverändert durch (ohne Fallback-Stack). */
export function pptxFont(fontFamily: string, bold: boolean, italic: boolean): PptxFontFace {
  const name = primaryFamily(fontFamily);
  return (PPTX_FONTS[name] ?? family(name))(bold, italic);
}

/** Die Aliase, die die Tabelle kennt (für den Test gegen `typography.css`). */
export const PPTX_FONT_ALIASES = Object.keys(PPTX_FONTS);
