import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, it, expect } from 'vitest';

/**
 * Die globale Typografie darf keine Schrift auf blanke Elemente legen.
 *
 * Bis #3399 stand hier
 *
 *   p, li, div, span { font-family: 'PT Sans', Arial, sans-serif; }
 *
 * und damit konnte kein Bauteil mehr eine Schrift nach innen vererben: ein
 * Treffer AUF dem Element schlägt den geerbten Wert immer — unabhängig von der
 * Spezifität und auch dann, wenn die Schrift oben als Inline-Style steht.
 * Vererbung liefert einen Wert ja nur, wenn gar keine Regel greift.
 *
 * `body` weiter oben setzt PT Sans bereits; für den Normalfall war die Regel
 * also wirkungslos und wurde ausschließlich da wirksam, wo sie schadete.
 *
 * Das Symptom führt zuverlässig in die Irre: `font-family` ist die einzige
 * Eigenschaft mit so einer Pauschalregel, also kamen Größe, Farbe und
 * Zeilenhöhe AUS DEMSELBEN Style-Objekt korrekt an und nur die Schrift nicht.
 * Das sieht aus wie eine verlorene Deklaration oder eine fehlende Schriftdatei;
 * beides wurde untersucht, beides war falsch. Ein `<textarea>` war immun, weil
 * es in der Liste nicht steht — der Wechsel auf ein `contenteditable` reichte
 * daher aus, den Fehler auszulösen (#3398).
 *
 * Bewacht wird die QUELLE, nicht `getComputedStyle`: jsdom bringt keine
 * belastbare Kaskade mit (siehe canvasRteFontInheritance im canvas-editor).
 */
const HIER = path.dirname(fileURLToPath(import.meta.url));
const CSS = readFileSync(path.join(HIER, 'typography.css'), 'utf8');

/** Selektoren der Regelblöcke auf oberster Ebene, die `font-family` setzen. */
function selektorenMitSchrift(css: string): string[] {
  // Kommentare raus, sonst zählt die Begründung in typography.css als Treffer.
  const ohneKommentare = css.replace(/\/\*[\s\S]*?\*\//g, '');
  return [...ohneKommentare.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .filter(([, , block]) => /font-family\s*:/.test(block))
    .map(([, selektor]) => selektor.trim())
    .filter((selektor) => !selektor.startsWith('@'));
}

describe('globale Typografie', () => {
  it('legt außer auf body und den Überschriften keine Schrift auf blanke Elemente', () => {
    const blank = /^[a-z][a-z0-9]*$/;
    const erlaubt = new Set(['body', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6']);

    const treffer = selektorenMitSchrift(CSS).flatMap((selektor) =>
      selektor
        .split(',')
        .map((teil) => teil.trim())
        .filter((teil) => blank.test(teil) && !erlaubt.has(teil))
    );

    expect(
      treffer,
      'Schrift auf einem blanken Element-Selektor — das schlägt jede geerbte ' +
        'Schrift und nimmt Bauteilen die Vererbung (#3399)'
    ).toEqual([]);
  });

  it('setzt die Grundschrift weiterhin auf body, damit sie überall ankommt', () => {
    const body = /(^|})\s*body\s*\{([^{}]*)\}/.exec(CSS.replace(/\/\*[\s\S]*?\*\//g, ''));
    expect(body, 'body-Regel fehlt').not.toBeNull();
    expect(body![2]).toMatch(/font-family:\s*'PT Sans'/);
  });
});
