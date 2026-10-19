/**
 * Ein Text über der Schwelle läuft abschnittsweise durch die Kette. Verloren
 * gehen darf dabei keine Zeile: die Abschnitte, mit '\n' wieder zusammengesetzt,
 * sind der Eingabetext.
 */

import { describe, expect, it } from 'vitest';

import { SECTION_THRESHOLD, splitForTransfer } from './sections.js';

const ABSATZ = 'Dies ist ein ganz normaler Satz im Fließtext des Antrags.';
/** Eine Überschrift im Sinn von `isHeading`: kurz, ohne Satzzeichen am Ende. */
const titel = (n: number) => `Abschnitt Nummer ${n}`;

/** `n` Absätze zu je ~60 Zeichen, alle ohne Überschrift-Look (Punkt am Ende). */
const fliesstext = (n: number) => Array.from({ length: n }, () => ABSATZ).join('\n');

describe('splitForTransfer', () => {
  it('lässt einen Text unter der Schwelle als einen Abschnitt', () => {
    const text = fliesstext(100);
    expect(text.length).toBeLessThan(SECTION_THRESHOLD);
    expect(splitForTransfer(text)).toEqual([text]);
  });

  it('teilt erst oberhalb der Schwelle', () => {
    const genau = 'x'.repeat(SECTION_THRESHOLD);
    expect(splitForTransfer(genau)).toEqual([genau]);
  });

  it('teilt einen langen Text in Abschnitte von höchstens ~12k Zeichen plus eine Zeile', () => {
    const text = fliesstext(800); // ~47k
    expect(text.length).toBeGreaterThan(SECTION_THRESHOLD);
    const parts = splitForTransfer(text);
    expect(parts.length).toBeGreaterThan(2);
    for (const p of parts.slice(0, -1))
      expect(p.length).toBeLessThanOrEqual(12_000 + ABSATZ.length);
  });

  it('verliert keine Zeile: mit \\n zusammengesetzt ist es der Eingabetext', () => {
    const mitTiteln = Array.from({ length: 40 }, (_, i) => `${titel(i)}\n${fliesstext(20)}`).join(
      '\n\n'
    );
    expect(mitTiteln.length).toBeGreaterThan(SECTION_THRESHOLD);
    expect(splitForTransfer(mitTiteln).join('\n')).toBe(mitTiteln);
    const glatt = fliesstext(800);
    expect(splitForTransfer(glatt).join('\n')).toBe(glatt);
  });

  it('bricht bevorzugt an einer Überschrift, sobald ein Abschnitt genug Umfang hat', () => {
    // Blöcke zu ~7,2k: ab 6k darf die nächste Überschrift trennen, bevor 12k erreicht sind.
    const block = (i: number) => `${titel(i)}\n${fliesstext(120)}`;
    const text = Array.from({ length: 8 }, (_, i) => block(i)).join('\n');
    const parts = splitForTransfer(text);
    expect(parts.length).toBeGreaterThan(1);
    for (const p of parts.slice(1)) expect(p.startsWith('Abschnitt Nummer')).toBe(true);
  });

  it('erkennt auch Markdown-Überschriften', () => {
    const block = (i: number) => `## Teil ${i}\n${fliesstext(120)}`;
    const text = Array.from({ length: 8 }, (_, i) => block(i)).join('\n');
    const parts = splitForTransfer(text);
    for (const p of parts.slice(1)) expect(p.startsWith('## Teil')).toBe(true);
  });

  it('hängt einen winzigen Rest an den vorigen Abschnitt', () => {
    // Ein Rest von wenigen Zeilen nach dem letzten harten Schnitt.
    const text = `${fliesstext(430)}\n${ABSATZ}\n${ABSATZ}`;
    expect(text.length).toBeGreaterThan(SECTION_THRESHOLD);
    const parts = splitForTransfer(text);
    // Zwei volle Abschnitte plus ~2,4k Rest wären drei; der Rest wird angehängt.
    expect(parts).toHaveLength(2);
    expect(parts.join('\n')).toBe(text);
  });
});
