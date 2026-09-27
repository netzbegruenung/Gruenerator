import { describe, expect, it } from 'vitest';

import { TABLE_CHUNK_MAX_CHARS } from '../services/document-services/TextChunker/blockSegmentation.js';
import { PROSE_CHUNK_MAX_CHARS } from '../services/document-services/TextChunker/chunkBudget.js';

import { vectorConfig } from './vectorConfig.js';

describe('Ausschnittsgrenze der Suche', () => {
  /**
   * Der Fehler, gegen den dieser Test steht, sah an keiner der beiden Stellen
   * falsch aus: indexiert wird in Chunks von bis zu 1600 (Fließtext) bzw. 1800
   * Zeichen (Tabelle), ausgeschnitten wurde mit 300 ZEICHEN. Erst zusammen
   * ergibt sich, dass das Modell ein Fünftel jedes Chunks zurückbekam — die
   * Einheit, die eingebettet, gesucht und bewertet wurde, erreichte es nie ganz.
   *
   * Live am 24.08.2026: Frage nach den Löschfristen, der Treffer war die
   * Tabelle mit acht Zeilen, das Fenster endete nach der zweiten. Die Antwort
   * war nicht falsch, nur unvollständig — die teuerste Ausfallart, weil ihr
   * nichts anzusehen ist.
   *
   * Gemessen wird gegen die GRÖSSTE Einheit, die der Chunker heute wirklich
   * ausliefert, nicht gegen die nominelle Token-Zahl: die Umrechnung Token →
   * Zeichen hat den Deckel jahrelang zu klein geschätzt (400 × 3,3 = 1320) und
   * eine Ausschnittsgrenze von 1500 grün gemeldet, obwohl schon der
   * Fließtext-Pfad 1600 Zeichen schneidet.
   */
  it('schneidet einen ganzen Chunk nicht an', () => {
    const chunkChars = Math.max(PROSE_CHUNK_MAX_CHARS, TABLE_CHUNK_MAX_CHARS);
    expect(
      vectorConfig.get('content').maxExcerptLength,
      `Ausschnitt unter Chunk-Größe (${chunkChars} Zeichen): das Modell sähe nur einen Teil jedes Treffers`
    ).toBeGreaterThanOrEqual(chunkChars);
  });
});
