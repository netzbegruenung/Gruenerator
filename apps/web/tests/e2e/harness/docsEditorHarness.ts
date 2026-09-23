/**
 * Bridge zwischen Harness-Seite und Playwright-Test. Eigenes Modul, damit der
 * Spec die Typen bekommt, ohne die tsx (und damit BlockNote) zu importieren.
 */
export interface DocsEditorHarness {
  /** Wählt das erste Vorkommen von `text` im Editor aus. */
  selectText: (text: string) => boolean;
}

declare global {
  interface Window {
    __docsEditorHarness?: DocsEditorHarness;
  }
}
