/**
 * Riegel für die Rückabbildung eines Chunks auf den Rohtext (#3223).
 *
 * Der wichtigste Test steht ganz unten: der Rundlauf über die ECHTE
 * Chunker-Ausgabe. Ein Offset ist erst dann etwas wert, wenn
 * `raw.slice(start, end)` wieder den Chunk ergibt — alles davor prüft nur die
 * Einzelregeln, aus denen diese Zusicherung zusammengesetzt ist.
 *
 * Die Normalform enthält KEINEN Leerraum. Warum das keine Bequemlichkeit,
 * sondern die Bedingung für Idempotenz ist, steht im Kopfkommentar von
 * `sourceOffsets.ts`.
 */

import { describe, expect, it } from 'vitest';

import {
  LONG_TABLE_FIXTURE,
  PROSE_FIXTURE,
  SHORT_SECTIONS_FIXTURE,
  STRUCTURED_FIXTURE,
  TABLE_ONLY_FIXTURE,
} from './chunkFixtures.js';
import { buildOffsetMap, locateChunk, normalizeForLookup } from './sourceOffsets.js';
import { smartChunkDocument } from './TextChunker.js';

import type { Chunk } from './types.js';

describe('buildOffsetMap', () => {
  it('bildet jedes Zeichen der Normalform auf seinen Rohindex ab', () => {
    const raw = 'Ein Satz.';
    const map = buildOffsetMap(raw);

    expect(map.normalized).toBe('EinSatz.');
    expect(map.toRaw).toHaveLength(map.normalized.length);
    for (let i = 0; i < map.normalized.length; i++) {
      expect(raw[map.toRaw[i]]).toBe(map.normalized[i]);
    }
  });

  it('entfernt Leerraum ersatzlos, statt ihn zusammenzuziehen', () => {
    const map = buildOffsetMap('Erster Absatz.\n\n\nZweiter Absatz.');
    expect(map.normalized).toBe('ErsterAbsatz.ZweiterAbsatz.');
  });

  it('macht jede Umschreibung von Leerraum folgenlos', () => {
    // Genau die Formen, die zwischen Rohtext und Chunk-Text entstehen:
    // zusammengezogen, mit `\n\n` verbunden, satzweise gefügt, ge`trim`t.
    const varianten = [
      'Erster Absatz.\n\nZweiter Absatz.',
      'Erster Absatz. Zweiter Absatz.',
      '  Erster   Absatz.\n\n\n  Zweiter Absatz.  ',
      'Erster\nAbsatz.\tZweiter Absatz.',
    ];
    const normalisiert = varianten.map(normalizeForLookup);
    expect(new Set(normalisiert).size).toBe(1);
  });

  it('entfernt das weiche Trennzeichen, ohne die Abbildung zu verschieben', () => {
    const raw = `Fo­rderung`;
    const map = buildOffsetMap(raw);

    expect(map.normalized).toBe('Forderung');
    expect(raw.slice(map.toRaw[0], map.toRaw[map.normalized.length - 1] + 1)).toBe(raw);
  });

  it('heilt einen Trennstrich am Zeilenumbruch zwischen zwei Buchstaben', () => {
    expect(normalizeForLookup('Förde-\n   rung ist teuer.')).toBe('Förderungistteuer.');
  });

  it('lässt einen Bindestrich stehen, wenn kein Buchstabe folgt', () => {
    // Keine Sonderbehandlung heißt hier: auf beiden Seiten gleich, also
    // unschädlich. Ein Bindestrich mitten in der Zeile bleibt ohnehin.
    expect(normalizeForLookup('Das Ziel -\n\n1998 gesetzt.')).toContain('-');
    expect(normalizeForLookup('Nord-Süd-Achse')).toBe('Nord-Süd-Achse');
  });

  it('macht den OCR-Zusammenzieher des Reinigers gegenstandslos', () => {
    // `cleaning.ts` macht aus `No  vember` ein `November`. Ohne Leerraum in
    // der Normalform sind beide Formen ohnehin identisch — genau deshalb
    // braucht dieser Helfer die Regel nicht nachzubauen.
    expect(normalizeForLookup('im No  vember')).toBe(normalizeForLookup('im November'));
  });

  it('wirft Markdown-Bilder ganz heraus', () => {
    expect(normalizeForLookup('Vorher ![img-0](img-0.jpeg) nachher')).toBe('Vorhernachher');
  });
});

describe('locateChunk', () => {
  it('findet einen Chunk und liefert Grenzen, die ihn im Rohtext einschließen', () => {
    const raw = 'Erster Satz.\n\nZweiter Satz.\n\nDritter Satz.';
    const map = buildOffsetMap(raw);

    const hit = locateChunk(map, 'Zweiter Satz.');
    expect(hit).not.toBeNull();
    expect(raw.slice(hit!.start, hit!.end)).toBe('Zweiter Satz.');
  });

  it('findet einen Chunk, dessen Absätze im Rohtext anders getrennt sind', () => {
    const raw = 'Erster Absatz.\n\nZweiter Absatz.';
    const map = buildOffsetMap(raw);

    // So sieht der Chunk nach `sentenceRepack` aus: mit Leerzeichen gefügt.
    const hit = locateChunk(map, 'Erster Absatz. Zweiter Absatz.');
    expect(hit).not.toBeNull();
    expect(raw.slice(hit!.start, hit!.end)).toBe(raw);
  });

  /**
   * Der Fall, für den der Cursor überhaupt existiert. `fallbackSplit` hängt das
   * Ende des Vorgängerchunks vorne an den nächsten — derselbe Satz steht also
   * zweimal im Strom. Ohne mitlaufenden Cursor fände der zweite Chunk das
   * ERSTE Vorkommen und bekäme Offsets aus dem falschen Teil des Dokuments.
   */
  it('wählt bei wiederholtem Text das richtige Vorkommen, nicht das erste', () => {
    const raw = 'Wiederholung. Teil A. Wiederholung. Teil B.';
    const map = buildOffsetMap(raw);

    const first = locateChunk(map, 'Wiederholung.');
    expect(first!.start).toBe(0);

    const second = locateChunk(map, 'Wiederholung.', first!.cursor);
    expect(second!.start).toBe(raw.lastIndexOf('Wiederholung.'));
    expect(raw.slice(second!.start, second!.end)).toBe('Wiederholung.');
  });

  it('liefert null statt einer Vermutung, wenn der Text nicht vorkommt', () => {
    const map = buildOffsetMap('Ein kurzer Text.');
    expect(locateChunk(map, 'Etwas ganz anderes.')).toBeNull();
    expect(locateChunk(map, '   ')).toBeNull();
  });

  /**
   * Der bekannte, richtige Fehlschlag. `splitTableBlock` stellt jedem Teilstück
   * einer langen Tabelle die Kopfzeile VORAN — diese Zusammensetzung steht im
   * Rohtext nirgends zusammenhängend. `null` ist hier die ehrliche Antwort.
   */
  it('gibt für ein Tabellen-Teilstück mit wiederholter Kopfzeile null zurück', () => {
    const raw = ['| A | B |', '| --- | --- |', '| 1 | 2 |', '| 3 | 4 |'].join('\n');
    const map = buildOffsetMap(raw);

    // Kopfzeile + eine spätere Zeile, wie `assemble()` sie baut.
    expect(locateChunk(map, '| A | B |\n| --- | --- |\n| 3 | 4 |')).toBeNull();
  });
});

/**
 * Die eigentliche Zusicherung: der vollständige Chunker über jedes Fixture,
 * und für jeden Chunk MIT Offsets muss der ausgeschnittene Rohbereich wieder
 * derselbe Text sein.
 *
 * Die Trefferquote wird mitgeprüft, damit ein künftiger Rückschritt als
 * gesunkene Quote auffällt statt als stilles `null`.
 */
describe('Rundlauf über die echte Chunker-Ausgabe', () => {
  const roundTrip = (raw: string, chunks: Chunk[]): number => {
    let located = 0;
    for (const chunk of chunks) {
      const start = chunk.metadata.startPosition;
      const end = chunk.metadata.endPosition;
      if (start === undefined || end === undefined) continue;

      located += 1;
      expect(end).toBeGreaterThan(start);
      expect(end).toBeLessThanOrEqual(raw.length);
      expect(
        normalizeForLookup(raw.slice(start, end)),
        `Chunk ${chunk.index} schneidet den falschen Bereich aus`
      ).toBe(normalizeForLookup(chunk.text));
    }
    return located;
  };

  // Alles ohne überlange Tabelle muss vollständig auffindbar sein.
  for (const [name, raw] of Object.entries({
    PROSE_FIXTURE,
    STRUCTURED_FIXTURE,
    TABLE_ONLY_FIXTURE,
    SHORT_SECTIONS_FIXTURE,
  })) {
    it(`${name}: jeder Chunk trägt Offsets, die ihn zurückliefern`, async () => {
      const chunks = await smartChunkDocument(raw, { baseMetadata: { title: 'Test' } });
      expect(chunks.length).toBeGreaterThan(0);
      expect(roundTrip(raw, chunks)).toBe(chunks.length);
    });
  }

  it('LONG_TABLE_FIXTURE: die auffindbaren Chunks stimmen, die Teilstücke fehlen bewusst', async () => {
    const chunks = await smartChunkDocument(LONG_TABLE_FIXTURE);
    const located = roundTrip(LONG_TABLE_FIXTURE, chunks);

    // Das erste Teilstück trägt die Kopfzeile an ihrer echten Stelle und ist
    // auffindbar; jedes weitere wiederholt sie und ist es nicht.
    expect(located).toBeGreaterThan(0);
    expect(located).toBeLessThan(chunks.length);
  });

  it('vergibt die Offsets in Dokumentreihenfolge', async () => {
    const chunks = await smartChunkDocument(STRUCTURED_FIXTURE);
    const starts = chunks
      .map((c) => c.metadata.startPosition)
      .filter((s): s is number => s !== undefined);

    expect(starts.length).toBeGreaterThan(1);
    expect([...starts].sort((a, b) => a - b)).toEqual(starts);
  });

  it('kommt mit Seitenmarkern zurecht, die vor dem Chunken entfernt werden', async () => {
    const raw = [
      '## Seite 1',
      '',
      PROSE_FIXTURE,
      '',
      '## Seite 2',
      '',
      SHORT_SECTIONS_FIXTURE,
    ].join('\n');
    const chunks = await smartChunkDocument(raw);

    expect(roundTrip(raw, chunks)).toBe(chunks.length);
  });
});
