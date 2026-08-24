import { describe, expect, it } from 'vitest';

import {
  CHARS_PER_TOKEN_DE,
  DOCUMENT_CHUNK_MAX_TOKENS,
} from '../services/document-services/TextChunker/chunkBudget.js';

import { vectorConfig } from './vectorConfig.js';

describe('Ausschnittsgrenze der Suche', () => {
  /**
   * Der Fehler, gegen den dieser Test steht, sah an keiner der beiden Stellen
   * falsch aus: indexiert wird mit 400 Token, ausgeschnitten wurde mit 300
   * ZEICHEN. Erst zusammen ergibt sich, dass das Modell ein Fünftel jedes
   * Chunks zurückbekam — die Einheit, die eingebettet, gesucht und bewertet
   * wurde, erreichte es nie ganz.
   *
   * Live am 24.08.2026: Frage nach den Löschfristen, der Treffer war die
   * Tabelle mit acht Zeilen, das Fenster endete nach der zweiten. Die Antwort
   * war nicht falsch, nur unvollständig — die teuerste Ausfallart, weil ihr
   * nichts anzusehen ist.
   */
  it('schneidet einen ganzen Chunk nicht an', () => {
    const chunkChars = DOCUMENT_CHUNK_MAX_TOKENS * CHARS_PER_TOKEN_DE;
    expect(
      vectorConfig.get('content').maxExcerptLength,
      `Ausschnitt unter Chunk-Größe (~${Math.round(chunkChars)} Zeichen): das Modell sähe nur einen Teil jedes Treffers`
    ).toBeGreaterThanOrEqual(chunkChars);
  });
});
