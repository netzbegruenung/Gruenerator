/**
 * Brücke zwischen Karten-Harness und Playwright-Test. Eigenes Modul, damit der
 * Spec die Typen bekommt, ohne die tsx (und damit React) zu importieren.
 */
export interface NotebookCardHarness {
  /** Was ein Klick ausgelöst hat, in Reihenfolge: 'cover-image' | 'cover-node' | 'action'. */
  hits: string[];
}

declare global {
  interface Window {
    __notebookCardHarness?: NotebookCardHarness;
  }
}
