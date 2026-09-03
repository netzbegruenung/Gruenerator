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
  filterAndSortResults,
  selectAcrossQueryGroups,
  sourceTextForPrompt,
} from './SearchResultProcessor.js';

import type { ExpandedChunkResult } from './types.js';

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

/**
 * #3166: Auf einer server-seitig fusionierten Sammlung ist `similarity` ein
 * Fusionswert und kein Kosinus — die 0,35 in `filterAndSortResults` ist aber
 * als Kosinus geschrieben (dieselbe Zahl steht in den Tiefenprofilen und in
 * NotebookQAService). Geschnitten wird deshalb auf dem gemessenen dichten
 * Kosinus, wo einer vorliegt, und sonst wie bisher.
 */
const cut = (
  doc: string,
  similarity: number,
  denseSimilarity?: number | null
): ExpandedChunkResult => ({
  document_id: doc,
  source_url: null,
  title: doc,
  snippet: doc,
  filename: null,
  similarity,
  chunk_index: 0,
  page_number: null,
  ...(denseSimilarity !== undefined && { dense_similarity: denseSimilarity }),
});

describe('filterAndSortResults schneidet auf dem dichten Kosinus', () => {
  it('wirft einen hohen Fusionswert mit zu kleinem Kosinus weg', () => {
    // Genau die Naht aus #3166: RRF liefert auf Rang 1 ≈ 1,0, der Chunk ist
    // aber nur zu 0,21 ähnlich. Vor der Reparatur überlebte er die Schwelle.
    const results = filterAndSortResults([cut('a', 0.98, 0.21)], { threshold: 0.35 });
    expect(results).toHaveLength(0);
  });

  it('behält einen niedrigen Fusionswert mit ausreichendem Kosinus', () => {
    // Und die Gegenrichtung: DBSF läuft nahe 0 aus, der Chunk ist trotzdem nah.
    const results = filterAndSortResults([cut('b', 0.04, 0.62)], { threshold: 0.35 });
    expect(results.map((r) => r.document_id)).toEqual(['b']);
  });

  it('fällt ohne dichten Kosinus auf similarity zurück', () => {
    // Der Alt-Pfad und jedes Dokument, dessen Chunks alle aus der BM25-Lane
    // stammen. Beide Formen der Abwesenheit müssen gleich behandelt werden.
    const results = filterAndSortResults(
      [cut('kein-feld', 0.4), cut('null-feld', 0.4, null), cut('zu-klein', 0.2)],
      { threshold: 0.35 }
    );
    expect(results.map((r) => r.document_id)).toEqual(['kein-feld', 'null-feld']);
  });

  it('behandelt einen Kosinus von exakt 0 als Messwert, nicht als Abwesenheit', () => {
    const results = filterAndSortResults([cut('c', 0.9, 0)], { threshold: 0.35 });
    expect(results).toHaveLength(0);
  });

  it('sortiert weiter auf similarity, nicht auf dem Kosinus', () => {
    // Der Fusionswert bleibt das Ranking-Signal — sonst wäre der auf dem
    // qa-Pfad gemessene dbsf-Vorsprung weg. Neu ist nur, WORAUF geschnitten
    // wird.
    const results = filterAndSortResults(
      [cut('niedriger-fusionswert', 0.5, 0.95), cut('hoeherer-fusionswert', 0.9, 0.5)],
      { threshold: 0.35 }
    );
    expect(results.map((r) => r.document_id)).toEqual([
      'hoeherer-fusionswert',
      'niedriger-fusionswert',
    ]);
  });
});

/**
 * `maxPerDocument` (Phase 2, #3181): sechs von neun Notebook-Fällen liefern
 * fünf Chunks EINES Dokuments als Top-5-Treffer, Hit@3 kann Hit@1 dann nicht
 * überbieten. Der Deckel muss VOR dem `limit`-Schnitt greifen, damit das
 * Budget auf verschiedene Dokumente verteilt wird.
 */
const chunk = (
  documentId: string,
  similarity: number,
  chunkIndex: number
): ExpandedChunkResult => ({
  document_id: documentId,
  source_url: null,
  title: documentId,
  snippet: documentId,
  filename: null,
  similarity,
  chunk_index: chunkIndex,
  page_number: null,
});

describe('filterAndSortResults deckelt Chunks je Dokument', () => {
  it('hält höchstens maxPerDocument Treffer je document_id, Reihenfolge bleibt erhalten', () => {
    const results = [
      chunk('a', 0.9, 0),
      chunk('a', 0.8, 1),
      chunk('a', 0.7, 2),
      chunk('a', 0.6, 3),
      chunk('a', 0.5, 4),
      chunk('b', 0.45, 0),
      chunk('b', 0.42, 1),
      chunk('b', 0.4, 2),
    ];
    const out = filterAndSortResults(results, { threshold: 0.35, maxPerDocument: 2 });
    expect(out.map((r) => `${r.document_id}:${r.chunk_index}`)).toEqual([
      'a:0',
      'a:1',
      'b:0',
      'b:1',
    ]);
  });

  it('lässt die Liste bei cap 0 unverändert', () => {
    const results = [chunk('a', 0.9, 0), chunk('a', 0.8, 1), chunk('a', 0.7, 2)];
    const out = filterAndSortResults(results, { threshold: 0.35, maxPerDocument: 0 });
    expect(out).toHaveLength(3);
  });

  it('deckelt Treffer ohne document_id nie', () => {
    const results = [chunk('', 0.9, 0), chunk('', 0.8, 1), chunk('', 0.7, 2)];
    const out = filterAndSortResults(results, { threshold: 0.35, maxPerDocument: 1 });
    expect(out).toHaveLength(3);
  });
});

describe('selectAcrossQueryGroups deckelt über die gemergte Auswahl', () => {
  it('lässt ein in zwei Gruppen führendes Dokument bei cap 1 nur einmal durch', () => {
    // Jede Gruppe für sich hält den Deckel bereits ein (nur ein "a"-Chunk je
    // Gruppe) — der Fall, den nur der zweite Zähler über die gemergte Auswahl
    // sieht, ist "a" führt in BEIDEN Gruppen.
    const groupOne = [chunk('a', 0.9, 0), chunk('c', 0.5, 0)];
    const groupTwo = [chunk('a', 0.85, 1), chunk('d', 0.5, 0)];
    const out = selectAcrossQueryGroups([groupOne, groupTwo], {
      threshold: 0.35,
      maxPerDocument: 1,
    });
    expect(out.filter((r) => r.document_id === 'a')).toHaveLength(1);
  });
});

describe('expandResultsToChunks reicht den dichten Kosinus durch', () => {
  it('trägt dense_similarity_score in dense_similarity, im Zweig mit top_chunks', () => {
    const [expanded] = expandResultsToChunks([
      {
        document_id: 'doc-1',
        title: 'Wahlprogramm',
        similarity_score: 0.98,
        dense_similarity_score: 0.42,
        top_chunks: [{ chunk_index: 0, preview: 'Vorschau', text: 'Fließtext.' }],
      },
    ]);
    expect(expanded?.similarity).toBe(0.98);
    expect(expanded?.dense_similarity).toBe(0.42);
  });

  it('trägt ihn auch im Zweig ohne top_chunks', () => {
    const [expanded] = expandResultsToChunks([
      {
        document_id: 'doc-2',
        title: 'Ohne Chunks',
        chunk_text: 'Text.',
        similarity_score: 0.5,
        dense_similarity_score: 0.31,
      },
    ]);
    expect(expanded?.dense_similarity).toBe(0.31);
  });

  it('lässt das Feld weg, wo die Suchschicht keinen Kosinus geliefert hat', () => {
    const [expanded] = expandResultsToChunks([
      { document_id: 'doc-3', title: 'Alt-Pfad', chunk_text: 'Text.', similarity_score: 0.5 },
    ]);
    expect(expanded).not.toHaveProperty('dense_similarity');
  });
});
