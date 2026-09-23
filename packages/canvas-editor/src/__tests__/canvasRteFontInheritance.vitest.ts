import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Der Editor muss die Schrift des Feldes zeigen, nicht die der Web-App.
 *
 * Das Overlay setzt `font-family` als Inline-Style auf den Rahmen und lässt
 * sie nach innen erben. Die globale Typografie der Web-App trägt jedoch
 *
 *   p, li, div, span { font-family: 'PT Sans', Arial, sans-serif; }
 *
 * und ein Treffer AUF dem Element schlägt immer den geerbten Wert, egal wie
 * niedrig seine Spezifität ist. Der ProseMirror-Knoten ist ein `div`, seine
 * Absätze sind `p` — der Editor zeigte damit PT Sans, während die Leinwand
 * daneben die Hausschrift zeichnete.
 *
 * Im lebenden Chrome gemessen, an genau diesem Aufbau:
 *   Rahmen          font-family: GrueneTypeNeue   (Inline-Style)
 *   .canvas-rte__content   →  "PT Sans", Arial, sans-serif
 *   darin  <p>             →  "PT Sans", Arial, sans-serif
 * Nach der Regel unten steht auf allen dreien GrueneTypeNeue; nimmt man sie
 * wieder weg, kippt es sofort zurück. Nur `font-family` war betroffen: für
 * Größe, Farbe und Zeilenhöhe gibt es keine solche Regel, deshalb stimmte
 * alles andere und ausgerechnet die Schrift nicht.
 *
 * Der alte `<textarea>`-Editor war immun — `textarea` steht in jener Liste
 * nicht. Der Fehler kam also nicht mit tiptap, sondern mit dem Wechsel auf
 * ein `contenteditable`-Element.
 *
 * Bewacht wird die QUELLE, nicht `getComputedStyle`: jsdom bringt keine
 * belastbare Kaskade mit, und bei der Kurzform `list-style` hat es schon
 * einmal das Gegenteil der Wahrheit bestätigt (siehe canvasRteListStyles).
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const CSS = path.resolve(HIER, '../canvas-editor.css');

describe('Schriftvererbung im Rich-Text-Feld', () => {
  const css = readFileSync(CSS, 'utf8');

  /** Der Regelblock, der den Inhalt und alles darin auf `inherit` stellt. */
  const regel = /\.canvas-rte__content\s*,\s*\.canvas-rte__content\s+\*\s*\{([^}]*)\}/.exec(css);

  it('stellt Inhalt und alle Kinder wieder auf die geerbte Schrift', () => {
    expect(regel, 'Regel für .canvas-rte__content und deren Kinder fehlt').not.toBeNull();
    expect(regel![1]).toMatch(/font-family:\s*inherit/);
  });

  it('trifft auch die Kinder — der Absatz ist ein eigenes Element', () => {
    // Ohne den `*`-Teil erbte zwar der Inhalt, nicht aber das <p> darin:
    // dieses trifft die globale `p`-Regel selbst.
    expect(regel![0]).toMatch(/\.canvas-rte__content\s+\*/);
  });
});
