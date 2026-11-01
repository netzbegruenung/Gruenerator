// SPDX-License-Identifier: MPL-2.0
/**
 * Canvas-Schriftnamen → Schriftnamen für PowerPoint.
 *
 * Der Canvas spricht Schriften über ihre `@font-face`-Aliase an. PowerPoint
 * sucht eine Schrift über den Familiennamen der installierten Datei (Name-ID 1)
 * plus fett/kursiv. Die offenen Familien stehen hier; die Tabelle der Markenschriften
 * trägt der Host ein (`registerPptxFonts`).
 */

export interface PptxFontFace {
  fontFace: string;
  bold: boolean;
  italic: boolean;
}

export type PptxFontMapper = (bold: boolean, italic: boolean) => PptxFontFace;

/**
 * Ist jede Datei ein eigener Schnitt mit eigener Familie (ID 1) und
 * Unterfamilie „Regular“, gehen fett/kursiv vom Canvas wie im Browser als
 * künstlicher Schnitt mit.
 */
export const pptxFamily =
  (name: string): PptxFontMapper =>
  (bold, italic) => ({ fontFace: name, bold, italic });

const OPEN_FONTS: Record<string, PptxFontMapper> = {
  // PT Sans: eine Familie mit Regular, Bold, Italic.
  'PT Sans': pptxFamily('PT Sans'),
  Raleway: pptxFamily('Raleway'),
};

let hostFonts: Record<string, PptxFontMapper> = {};

/** Die Schriften des Hosts, zusätzlich zu den offenen Familien oben. */
export function registerPptxFonts(table: Record<string, PptxFontMapper>): void {
  hostFonts = table;
}

/** Der erste Eintrag eines CSS-Stacks, ohne Anführungszeichen. */
function primaryFamily(fontFamily: string): string {
  return (fontFamily.split(',')[0] ?? '').trim().replace(/^['"]|['"]$/g, '');
}

/** Unbekannte Namen gehen unverändert durch (ohne Fallback-Stack). */
export function pptxFont(fontFamily: string, bold: boolean, italic: boolean): PptxFontFace {
  const name = primaryFamily(fontFamily);
  return (hostFonts[name] ?? OPEN_FONTS[name] ?? pptxFamily(name))(bold, italic);
}

/** Die Aliase, die die Tabellen kennen (für den Test gegen `typography.css`). */
export function pptxFontAliases(): string[] {
  return Object.keys({ ...OPEN_FONTS, ...hostFonts });
}
