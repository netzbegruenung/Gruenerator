import { pptxFamily, type PptxFontMapper } from '@ggraphic/editor/export/pptx/pptxFonts';

/**
 * Die Markenschriften des Grünerators → PowerPoint. Die Namen stehen so in den
 * Name-Tabellen der Dateien unter `packages/canvas-editor/fonts/` (mit fontkit
 * ausgelesen, 22.10.2026). Bei Gotham Narrow und GrueneType ist jede Datei ein
 * eigener Schnitt mit eigener Familie.
 */
export const GRUENE_PPTX_FONTS: Record<string, PptxFontMapper> = {
  GrueneTypeNeue: pptxFamily('GrueneType Neue'),
  // Die Datei ist selbst der kursive Black-Condensed-Schnitt.
  GrueneType: pptxFamily('GrueneType Black Cond Italic'),
  'GothamNarrow-Ultra': pptxFamily('Gotham Narrow Ultra'),
  'GothamNarrow-Book': pptxFamily('Gotham Narrow Book'),
  'GothamNarrow-Bold': pptxFamily('Gotham Narrow Bold'),
  // typography.css: Vollkorn kursiv = Datei BoldItalic (Familie „Vollkorn“,
  // Bold Italic), fett kursiv = Datei BlackItalic (Familie „Vollkorn Black“).
  Vollkorn: (bold) =>
    bold
      ? { fontFace: 'Vollkorn Black', bold: false, italic: true }
      : { fontFace: 'Vollkorn', bold: true, italic: true },
};
