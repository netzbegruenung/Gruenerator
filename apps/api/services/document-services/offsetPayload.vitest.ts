/**
 * Der Helfer hat genau eine interessante Eigenschaft: er lässt nie ein halbes
 * Offset durch. Alles andere hier hält nur fest, dass Leerwerte `null` sind
 * und nie `undefined` — der Unterschied entscheidet, ob Qdrant das Feld
 * schreibt oder stillschweigend weglässt.
 */

import { describe, expect, it } from 'vitest';

import { offsetPayload } from './offsetPayload.js';

describe('offsetPayload', () => {
  it('reicht ein vollständiges Paar durch', () => {
    expect(offsetPayload({ metadata: { startPosition: 120, endPosition: 1580 } })).toEqual({
      char_start: 120,
      char_end: 1580,
    });
  });

  it('erlaubt den Anfang des Dokuments', () => {
    expect(offsetPayload({ metadata: { startPosition: 0, endPosition: 42 } })).toEqual({
      char_start: 0,
      char_end: 42,
    });
  });

  it('liefert für einen Chunk ohne Offsets lauter null, nie undefined', () => {
    for (const eingabe of [{}, { metadata: {} }, { metadata: { startPosition: 5 } }]) {
      expect(offsetPayload(eingabe)).toEqual({ char_start: null, char_end: null });
    }
  });

  it('verwirft ein halbes Paar vollständig, nicht nur die fehlende Hälfte', () => {
    // Ein Anfang ohne Ende würde eine Sprungmarke bis ans Dokumentende
    // markieren lassen. Beide Felder fallen deshalb zusammen aus.
    expect(offsetPayload({ metadata: { endPosition: 90 } })).toEqual({
      char_start: null,
      char_end: null,
    });
  });

  it('verwirft unmögliche Paare, statt sie zu speichern', () => {
    const unmoeglich = [
      { startPosition: 500, endPosition: 100 },
      { startPosition: 100, endPosition: 100 },
      { startPosition: -1, endPosition: 100 },
      { startPosition: 1.5, endPosition: 100 },
    ];
    for (const metadata of unmoeglich) {
      expect(offsetPayload({ metadata })).toEqual({ char_start: null, char_end: null });
    }
  });
});
