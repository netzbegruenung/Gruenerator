/**
 * Zusicherungen für `sentenceRepack` — die Stelle, an der am 17.08.2026 aus
 * einer 2,5-MB-CSV Chunks von über 20.000 Zeichen wurden.
 *
 * Beim Bauen dieser Tests eine Falle, die jeden davon lautlos wertlos macht:
 * `sentenceSegments` erkennt einen Satzschluss nur, wenn nach dem Punkt ein
 * GROSSBUCHSTABE (oder Ziffer/Anführungszeichen) folgt. Kleingeschriebener
 * Fülltext verschmilzt sonst zu einem einzigen Riesensegment, und die Prüfung
 * misst nur noch den Übergroß-Sonderfall statt des Pfades, den sie meint.
 * Deshalb beginnt hier jeder Satz mit einem Großbuchstaben.
 */

import { describe, it, expect } from 'vitest';

import { sentenceRepack } from './chunkPostProcessing.js';
import { sentenceSegments } from './sentenceSegmentation.js';

import type { Chunk } from './types.js';

const TARGET = 1600;
const OVERLAP = 400;

function asChunk(text: string): Chunk {
  return { text, index: 0, tokens: Math.ceil(text.length / 4), metadata: {} };
}

/** Ein echter Satz gegebener Länge: Großbuchstabe vorn, Punkt hinten. */
function sentence(chars: number, marker = 'A'): string {
  const body = `${marker}${'lorem ipsum '.repeat(Math.ceil(chars / 12))}`;
  return `${body.slice(0, Math.max(2, chars - 1)).trimEnd()}.`;
}

describe('sentenceRepack', () => {
  it('segmentiert die Testdaten wirklich in Sätze', () => {
    // Prüfmittel für die Prüfmittel: ohne diese Zusicherung testen die Fälle
    // unten etwas anderes als sie behaupten.
    const text = [sentence(500, 'A'), sentence(500, 'B'), sentence(500, 'C')].join(' ');
    expect(sentenceSegments(text)).toHaveLength(3);
  });

  it('schaukelt sich nicht auf, wenn kein Satz in das Überlappungsbudget passt', () => {
    // Jeder Satz ist länger als `overlapChars`, also liefert
    // `createSentenceOverlap` numSentences 0. `slice(-0)` ist in JS `slice(0)`
    // und gab damit den GANZEN Puffer zurück statt gar nichts — Chunk n enthielt
    // dann die Sätze 1..n. Genau so entstanden die 20.000-Zeichen-Brocken.
    const sentences = Array.from({ length: 30 }, (_, i) =>
      sentence(500, String.fromCharCode(65 + (i % 26)))
    );
    const input = sentences.join(' ');
    const chunks = sentenceRepack([asChunk(input)]);

    const emitted = chunks.reduce((sum, c) => sum + c.text.length, 0);

    // Etwas Duplikat ist die gewollte Überlappung. Das Doppelte der Eingabe ist
    // keine Überlappung mehr, sondern der Aufschaukel-Effekt.
    expect(emitted).toBeLessThan(input.length * 2);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET);
    }
  });

  it('hält die Obergrenze auch für einen langen Satz bei nicht leerem Puffer', () => {
    // Die beiden Übergroß-Zweige in der Schleife greifen nur bei LEEREM Puffer
    // bzw. am Dokumentende. Ein langer Satz mitten im Strom kam an beiden
    // vorbei und landete ungeteilt im nächsten Chunk.
    const text = [
      sentence(300, 'A'),
      sentence(300, 'B'),
      sentence(5000, 'C'),
      sentence(300, 'D'),
    ].join(' ');

    const chunks = sentenceRepack([asChunk(text)]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET);
    }
  });

  it('teilt auch Text ohne jede Wortgrenze', () => {
    // Eine CSV-Zeile ohne Leerzeichen ist für `split(/\s+/)` ein einziges Wort.
    const row = `A${'a,b,c,d,'.repeat(1200)}.`;
    const chunks = sentenceRepack([asChunk(row)]);

    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.text.length).toBeLessThanOrEqual(TARGET);
    }
    // Nichts geht verloren: aneinandergehängt ergeben die Teile die Zeile.
    expect(chunks.map((c) => c.text).join('')).toBe(row);
  });

  it('behält die Überlappung, wo sie in das Budget passt', () => {
    const sentences = Array.from({ length: 12 }, (_, i) => sentence(200, `S${i}`));
    const chunks = sentenceRepack([asChunk(sentences.join(' '))]);

    expect(chunks.length).toBeGreaterThan(1);
    const emitted = chunks.reduce((sum, c) => sum + c.text.length, 0);
    expect(emitted).toBeGreaterThan(sentences.join(' ').length);
    expect(emitted).toBeLessThan(sentences.join(' ').length + chunks.length * OVERLAP * 1.5);
  });

  it('lässt normalen Fließtext zusammenhängend', () => {
    const text = Array.from({ length: 6 }, (_, i) => `Das ist Satz Nummer ${i}.`).join(' ');
    const chunks = sentenceRepack([asChunk(text)]);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].text).toContain('Satz Nummer 0');
    expect(chunks[0].text).toContain('Satz Nummer 5');
  });
});
