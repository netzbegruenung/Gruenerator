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

  it('lässt eine gedeckelte Tabelle mit einer ganzen Zeile enden', () => {
    // Der Schnitt bei maxChars landet mitten in einer Zeile; die angeschnittene
    // Zeile ordnet keine Zelle mehr einer Spalte zu und muss wegfallen.
    const lang = [
      '| Kommune | Betrag |',
      '| --- | --- |',
      ...Array(200).fill('| Musterstadt | 125000 Euro |'),
    ].join('\n');
    const out = sourceTextForPrompt(ref({ chunk_text: lang, chunk_type: 'table' }));
    const zeilen = out.split('\n');

    expect(zeilen[zeilen.length - 1].endsWith('|')).toBe(true);
    expect(zeilen[zeilen.length - 1]).toBe('| Musterstadt | 125000 Euro |');
  });

  it('wirft eine Zeile weg, deren Schnitt hinter einem inneren Trenner liegt', () => {
    // Fünf Spalten; der Deckel sitzt genau hinter dem vierten `|` der letzten
    // Zeile. Die Zeile endet dann sauber auf `|` und hat trotzdem die Spalte E
    // verloren — sie darf nicht als ganze Zeile durchgehen.
    const kopf = '| A | B | C | D | E |';
    const trenner = '| --- | --- | --- | --- | --- |';
    const zeile = '| 1 | 2 | 3 | 4 | 5 |';
    const text = [kopf, trenner, zeile, zeile].join('\n');
    const maxChars = text.lastIndexOf('| 5 |') + 1;
    expect(text.slice(0, maxChars).endsWith('| 4 |')).toBe(true);

    const out = sourceTextForPrompt(ref({ chunk_text: text, chunk_type: 'table' }), maxChars);
    expect(out.split('\n')).toEqual([kopf, trenner, zeile]);
  });

  it('behält die letzte Zeile, wenn der Schnitt genau auf einem Zeilenende liegt', () => {
    const text = [tabelle, '| Dämmung | 20 Prozent |'].join('\n');
    const maxChars = tabelle.length;
    const out = sourceTextForPrompt(ref({ chunk_text: text, chunk_type: 'table' }), maxChars);
    expect(out.split('\n')).toHaveLength(3);
  });

  it('kürzt eine Tabelle, die ganz ins Fenster passt, um keine Zeile', () => {
    const out = sourceTextForPrompt(ref({ chunk_text: tabelle, chunk_type: 'table' }));
    expect(out.split('\n')).toHaveLength(3);
  });

  it('wirft leere Zeilen aus der Tabelle', () => {
    const out = sourceTextForPrompt(
      ref({ chunk_text: '| A |\n\n| --- |\n\n| 1 |', chunk_type: 'table' })
    );
    expect(out.split('\n')).toHaveLength(3);
  });
});
