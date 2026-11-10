import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { ExpandedChunkResult } from '../../../services/search/types.js';

/**
 * `gruenerator_search` fragt die Abrufhälfte der Notebook-Suche und bringt sie
 * in die Werkzeugform: eine Zeile je QUELLE, ihre Passagen im `excerpt`.
 * Ersetzt sind nur `getSearchContext` und der Reranker; die Sammlungs-Tabelle
 * (`COLLECTION_MAP`) und das Budget-Profil bleiben echt.
 */
const getSearchContext = vi.fn();
const rerankNotebookResults = vi.fn();

vi.mock('../../../services/notebook/index.js', () => ({
  notebookQAService: { getSearchContext },
}));
vi.mock('../../../services/notebook/rerankNotebookResults.js', () => ({
  rerankNotebookResults,
}));

const { searchCollectionAsNotebook, MAX_PASSAGES_PER_SOURCE } =
  await import('./notebookCollectionSearch.js');
const { COLLECTION_MAP } = await import('../../../config/collectionMap.js');
const { getLoopToolProfile } = await import('../../../config/notebookDepthProfiles.js');

function passage(url: string, chunk: number, similarity: number, extra = {}): ExpandedChunkResult {
  return {
    document_id: `doc:${url}`,
    source_url: url,
    title: `Titel ${url}`,
    snippet: `Passage ${chunk} aus ${url}`,
    filename: null,
    similarity,
    chunk_index: chunk,
    page_number: null,
    ...extra,
  } as ExpandedChunkResult;
}

function context(sortedResults: ExpandedChunkResult[]) {
  return {
    sortedResults,
    referencesMap: {},
    evidenceTop: null,
    systemPrompt: '',
    contextSummary: '',
    isMulti: false,
  };
}

const run = (over: Record<string, unknown> = {}) =>
  searchCollectionAsNotebook({
    query: 'Windkraft',
    collection: 'hessen',
    members: ['hessen'],
    limit: 8,
    ...over,
  });

beforeEach(() => {
  getSearchContext.mockReset();
  rerankNotebookResults.mockReset();
});

describe('searchCollectionAsNotebook — Abruf', () => {
  it('fragt die Notebook-Suche mit der System-Id und dem Loop-Budget', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.8)]));
    await run();
    const args = getSearchContext.mock.calls[0]?.[0];
    expect(args.collectionId).toBe(COLLECTION_MAP.hessen?.systemId);
    expect(args.profile).toBe(getLoopToolProfile());
    expect(args).not.toHaveProperty('collectionIds');
    expect(args).not.toHaveProperty('requestFilters');
  });

  it('durchsucht ein Bündel als EIN Mehrsammlungs-Notebook', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.8)]));
    await run({ collection: 'oesterreich', members: ['oesterreich', 'gruene-at'] });
    const args = getSearchContext.mock.calls[0]?.[0];
    expect(args.collectionIds).toEqual([
      COLLECTION_MAP.oesterreich?.systemId,
      COLLECTION_MAP['gruene-at']?.systemId,
    ]);
    expect(args).not.toHaveProperty('collectionId');
  });

  it('filtert den Inhaltstyp auf der Landesverbands-Sammlung', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.8)]));
    await run({ lvContentType: ['beschluss'] });
    expect(getSearchContext.mock.calls[0]?.[0].requestFilters).toEqual({
      content_type: ['beschluss'],
    });
  });

  it('lässt den Inhaltstyp weg, wo die Sammlung keinen führt', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.8)]));
    await run({
      collection: 'deutschland',
      members: ['deutschland'],
      lvContentType: ['beschluss'],
    });
    expect(getSearchContext.mock.calls[0]?.[0]).not.toHaveProperty('requestFilters');
  });
});

describe('searchCollectionAsNotebook — Form', () => {
  it('fasst die Passagen einer Quelle in einer Zeile zusammen, beste zuerst', async () => {
    getSearchContext.mockResolvedValue(
      context([
        passage('https://a', 4, 0.9),
        passage('https://b', 2, 0.8),
        passage('https://a', 9, 0.7),
      ])
    );
    const out = await run();
    expect(out.results.map((r) => r.url)).toEqual(['https://a', 'https://b']);
    expect(out.results[0]?.excerpt).toMatch(/Passage 4 .*\n\[…\]\nPassage 9/s);
    expect(out.results[0]).toMatchObject({
      rank: 1,
      chunkIndex: 4,
      score: 0.9,
      collectionId: 'hessen',
    });
    expect(out.resultsCount).toBe(2);
  });

  it(`nimmt höchstens ${MAX_PASSAGES_PER_SOURCE} Passagen je Quelle`, async () => {
    getSearchContext.mockResolvedValue(
      context([1, 2, 3, 4, 5].map((c) => passage('https://a', c, 0.9 - c / 100)))
    );
    const out = await run();
    expect(out.results[0]?.excerpt.split('[…]')).toHaveLength(MAX_PASSAGES_PER_SOURCE);
  });

  it('begrenzt auf limit QUELLEN, nicht Passagen', async () => {
    getSearchContext.mockResolvedValue(
      context(
        ['a', 'b', 'c'].flatMap((u) => [
          passage(`https://${u}`, 1, 0.8),
          passage(`https://${u}`, 2, 0.7),
        ])
      )
    );
    const out = await run({ limit: 2 });
    expect(out.results.map((r) => r.url)).toEqual(['https://a', 'https://b']);
  });

  it('trägt das Datum der Quelle mit', async () => {
    getSearchContext.mockResolvedValue(
      context([passage('https://a', 1, 0.8, { published_at: '2025-03-01' })])
    );
    expect((await run()).results[0]?.date).toBe('2025-03-01');
  });
});

describe('searchCollectionAsNotebook — leer und Fehler', () => {
  it('meldet „keine Treffer" ohne Fehler', async () => {
    getSearchContext.mockResolvedValue(null);
    const out = await run();
    expect(out.error).toBeUndefined();
    expect(out).toMatchObject({ resultsCount: 0, message: 'Keine Ergebnisse gefunden.' });
  });

  it('macht aus einem Wurf einen Fehler, den das Modell sieht', async () => {
    getSearchContext.mockRejectedValue(new Error('qdrant weg'));
    const out = await run();
    expect(out).toMatchObject({ error: true, message: 'Suche fehlgeschlagen: qdrant weg' });
  });

  it('meldet eine unbekannte Sammlung als Fehler', async () => {
    const out = await run({ collection: 'gibt-es-nicht', members: ['gibt-es-nicht'] });
    expect(out.error).toBe(true);
    expect(getSearchContext).not.toHaveBeenCalled();
  });
});

describe('searchCollectionAsNotebook — Reranker', () => {
  it('ordnet mit dem Notebook-Reranker neu, wenn der Schalter an ist', async () => {
    const a = passage('https://a', 1, 0.9);
    const b = passage('https://b', 1, 0.5);
    getSearchContext.mockResolvedValue(context([a, b]));
    rerankNotebookResults.mockResolvedValue({ results: [b, a], reranked: true });
    const out = await run({ rerankChunks: true });
    expect(out.results.map((r) => r.url)).toEqual(['https://b', 'https://a']);
    expect(out).not.toHaveProperty('rerankDegraded');
  });

  it('meldet den Rückfall, wenn der Cross-Encoder ausfiel', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.9)]));
    rerankNotebookResults.mockResolvedValue({
      results: [passage('https://a', 1, 0.9)],
      reranked: false,
    });
    expect((await run({ rerankChunks: true })).rerankDegraded).toBe(true);
  });

  it('ruft ohne Schalter keinen Reranker', async () => {
    getSearchContext.mockResolvedValue(context([passage('https://a', 1, 0.9)]));
    await run();
    expect(rerankNotebookResults).not.toHaveBeenCalled();
  });
});
