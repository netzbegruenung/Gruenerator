/**
 * Die Leseseite muss alte und neue Chunks in derselben Sammlung vertragen.
 *
 * Alte Punkte tragen kein `chunk_type` (Qdrant-Payloads sind schemalos, ein
 * fehlendes Feld kommt als `undefined` zurück). Ein Treffer darauf muss
 * unverändert durchlaufen — nicht mit `undefined` in der Referenz landen und
 * nicht werfen.
 */

import { describe, expect, it } from 'vitest';

import { buildReferencesMap, expandResultsToChunks } from './SearchResultProcessor.js';

describe('expandResultsToChunks', () => {
  it('reicht chunk_type eines neuen Chunks durch', () => {
    const [expanded] = expandResultsToChunks([
      {
        document_id: 'doc-1',
        title: 'Wahlprogramm',
        top_chunks: [
          {
            chunk_index: 0,
            preview: 'Vorschau',
            text: '| A | B |\n| --- | --- |\n| 1 | 2 |',
            chunk_type: 'table',
          },
        ],
      },
    ]);
    expect(expanded.chunk_type).toBe('table');
  });

  it('bildet einen alten Punkt ohne chunk_type unverändert ab', () => {
    const [expanded] = expandResultsToChunks([
      {
        document_id: 'doc-2',
        title: 'Altbestand',
        top_chunks: [{ chunk_index: 3, preview: 'Vorschau', text: 'Fließtext.' }],
      },
    ]);
    expect(expanded.chunk_type).toBeNull();
    expect(expanded.chunk_text).toBe('Fließtext.');
    expect(expanded.chunk_index).toBe(3);
  });

  it('bildet auch den Zweig ohne top_chunks ab', () => {
    const [expanded] = expandResultsToChunks([
      { document_id: 'doc-3', title: 'Ohne Chunks', chunk_text: 'Text.' },
    ]);
    expect(expanded.chunk_type).toBeNull();
  });
});

describe('buildReferencesMap', () => {
  it('trägt chunk_type in die Referenz', () => {
    const map = buildReferencesMap([
      {
        document_id: 'doc-1',
        source_url: null,
        title: 'T',
        snippet: 's',
        chunk_text: '| A |',
        filename: null,
        similarity: 0.9,
        chunk_index: 0,
        page_number: null,
        chunk_type: 'table',
      },
    ]);
    expect(map['1'].chunk_type).toBe('table');
  });

  it('lässt chunk_type null, wenn der Punkt es nicht trägt', () => {
    const map = buildReferencesMap([
      {
        document_id: 'doc-2',
        source_url: null,
        title: 'T',
        snippet: 's',
        chunk_text: 'Fließtext.',
        filename: null,
        similarity: 0.5,
        chunk_index: 1,
        page_number: null,
      },
    ]);
    expect(map['1'].chunk_type).toBeNull();
  });
});
