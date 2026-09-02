/**
 * Die Leseseite muss alte und neue Chunks in derselben Sammlung vertragen.
 *
 * Alte Punkte tragen kein `chunk_type` (Qdrant-Payloads sind schemalos, ein
 * fehlendes Feld kommt als `undefined` zurück). Ein Treffer darauf muss
 * unverändert durchlaufen — nicht mit `undefined` in der Referenz landen und
 * nicht werfen.
 */

import { describe, expect, it } from 'vitest';

import {
  buildReferencesMap,
  expandResultsToChunks,
  sourceTextForPrompt,
} from './SearchResultProcessor.js';

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

describe('sourceTextForPrompt', () => {
  const tabelle = '| Programm | Satz |\n| --- | --- |\n| Heizungstausch | 30 Prozent |';

  const ref = (extra: Record<string, unknown>) => ({
    title: 'T',
    snippets: [['Vorschau']],
    description: null,
    date: null,
    source: 'qa_documents',
    document_id: 'doc-1',
    source_url: null,
    filename: null,
    similarity_score: 0.9,
    chunk_index: 0,
    page_number: null,
    ...extra,
  });

  it('behält die Zeilenumbrüche eines Tabellen-Chunks', () => {
    const out = sourceTextForPrompt(ref({ chunk_text: tabelle, chunk_type: 'table' }));
    expect(out.split('\n')).toHaveLength(3);
    expect(out).toContain('| Heizungstausch | 30 Prozent |');
  });

  it('kollabiert Fließtext weiterhin auf eine Zeile', () => {
    const out = sourceTextForPrompt(
      ref({ chunk_text: 'Erster Satz.\n\nZweiter   Satz.', chunk_type: 'text' })
    );
    expect(out).toBe('Erster Satz. Zweiter Satz.');
  });

  it('kollabiert einen alten Punkt ohne chunk_type wie bisher', () => {
    const out = sourceTextForPrompt(ref({ chunk_text: 'Erster Satz.\nZweiter Satz.' }));
    expect(out).toBe('Erster Satz. Zweiter Satz.');
  });

  it('deckelt eine Tabelle weiter bei maxChars', () => {
    const lang = ['| A | B |', '| --- | --- |', ...Array(200).fill('| x | y |')].join('\n');
    const out = sourceTextForPrompt(ref({ chunk_text: lang, chunk_type: 'table' }));
    expect(out.length).toBeLessThanOrEqual(1800);
  });

  it('wirft leere Zeilen aus der Tabelle', () => {
    const out = sourceTextForPrompt(
      ref({ chunk_text: '| A |\n\n| --- |\n\n| 1 |', chunk_type: 'table' })
    );
    expect(out.split('\n')).toHaveLength(3);
  });
});
