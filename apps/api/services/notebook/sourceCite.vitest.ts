/**
 * Ein Zitat im Quelltext wiederfinden (`locateQuote`: exakt → normalisiert →
 * unscharf) und Belegsätze für eine Behauptung auswählen. Offsets zeigen
 * immer in den Originaltext — sie werden zur Fundstelle im Zitat.
 */
import { describe, expect, it } from 'vitest';

import { fakeChunk, fakeNotebookDeps } from './__fixtures__/fakeNotebookSources.js';
import { citeQuote, locateQuote, supportClaim } from './sourceCite.js';

describe('locateQuote', () => {
  it('finds an exact quote', () => {
    const text = 'Einleitung. Der Radweg kommt 2027. Ende.';
    expect(locateQuote(text, 'Der Radweg kommt 2027.')).toEqual({
      found: true,
      method: 'exact',
      charStart: 12,
      charEnd: 34,
      matched: 'Der Radweg kommt 2027.',
      score: 1,
    });
  });

  it('finds a quote across quotes, dashes, case, line breaks and soft hyphens', () => {
    const text = 'Sie sagte: „Der Rad\u00ADweg –\n  kommt SICHER“, und ging.';
    const r = locateQuote(text, '"der radweg - kommt sicher"');
    expect(r.found).toBe(true);
    expect(r.method).toBe('normalized');
    expect(r.matched).toBe('„Der Rad\u00ADweg –\n  kommt SICHER“');
    expect(text.slice(r.charStart!, r.charEnd!)).toBe(r.matched);
  });

  const LONG =
    'Wir wollen bis zum Jahr 2030 den Anteil erneuerbarer Energien im Landkreis deutlich steigern und dabei Bürgerinnen und Bürger beteiligen';

  it('finds a slightly misquoted passage fuzzily', () => {
    const text = `Vorspann. ${LONG}. Nachspann.`;
    const misquoted = LONG.replace('deutlich', 'massiv');
    const r = locateQuote(text, misquoted);
    expect(r.found).toBe(true);
    expect(r.method).toBe('fuzzy');
    expect(r.matched).toBe(LONG);
    expect(r.score).toBeGreaterThanOrEqual(0.9);
  });

  it('does not accept a quote that differs too much', () => {
    const text = `Vorspann. ${LONG}. Nachspann.`;
    const wrong = LONG.replace('deutlich', 'massiv')
      .replace('Landkreis', 'Kreis')
      .replace('beteiligen', 'enteignen')
      .replace('erneuerbarer', 'fossiler');
    expect(locateQuote(text, wrong)).toEqual({
      found: false,
      method: null,
      charStart: null,
      charEnd: null,
      matched: null,
      score: null,
    });
  });
});

describe('citeQuote', () => {
  const CHUNKS = [
    fakeChunk({ index: 0, text: 'Einleitung.', charStart: 0, charEnd: 11, pageNumber: 1 }),
    fakeChunk({
      index: 1,
      text: 'Der Radweg kommt 2027.',
      charStart: 12,
      charEnd: 34,
      pageNumber: 2,
    }),
  ];

  it('locates the quote in the one source that has it, with page and chunk', async () => {
    const { deps } = fakeNotebookDeps([
      { id: 'd1', title: 'Antrag', text: 'Einleitung. Der Radweg kommt 2027.', chunks: CHUNKS },
      { id: 'd2', title: 'Protokoll', text: 'Nichts dazu.' },
    ]);
    const out = await citeQuote(
      { collectionId: 'n1', userId: 'u1', quote: 'Der Radweg kommt 2027' },
      deps
    );
    expect(out).toMatchObject({
      found: true,
      method: 'exact',
      sourceId: 'd1',
      title: 'Antrag',
      charStart: 12,
      charEnd: 33,
      pageNumber: 2,
      chunkIndex: 1,
      matched: 'Der Radweg kommt 2027',
      context: 'Einleitung. Der Radweg kommt 2027.',
      exhaustive: true,
    });
  });

  it('returns both sources as candidates when the quote is in two', async () => {
    const { deps } = fakeNotebookDeps([
      { id: 'd1', title: 'Antrag', text: 'Der Radweg kommt 2027.' },
      { id: 'd2', title: 'Kopie', text: 'Vorab: Der Radweg kommt 2027.' },
    ]);
    const out = await citeQuote(
      { collectionId: 'n1', userId: 'u1', quote: 'Der Radweg kommt 2027' },
      deps
    );
    expect(out.found).toBe(false);
    if (out.found) return;
    expect(out.candidates.map((c) => [c.sourceId, c.charStart])).toEqual([
      ['d1', 0],
      ['d2', 7],
    ]);
  });

  it('reports not found together with exhaustive', async () => {
    const { deps } = fakeNotebookDeps([{ id: 'd1', text: 'Nichts dazu.' }]);
    const out = await citeQuote(
      { collectionId: 'n1', userId: 'u1', quote: 'Der Radweg kommt 2027' },
      deps
    );
    expect(out).toEqual({
      found: false,
      method: null,
      exhaustive: true,
      incompleteReason: null,
      sourcesScanned: 1,
      candidates: [],
    });
  });
});

describe('supportClaim', () => {
  it('picks the sentences that share content words with the claim', async () => {
    const { deps, documentService } = fakeNotebookDeps([{ id: 'd1', text: 'x' }], {
      searchResults: [
        {
          document_id: 'd1',
          title: 'Antrag',
          similarity_score: 0.7,
          top_chunks: [
            {
              chunk_index: 4,
              page_number: 3,
              preview: '',
              char_start: 100,
              char_end: 180,
              text: 'Das Wetter war gut. Der Kreistag beschließt den Radweg nach Nordheim. Sonst nichts.',
            },
          ],
        },
      ],
    });
    const out = await supportClaim(
      { collectionId: 'n1', userId: 'u1', claim: 'Der Kreistag hat den Radweg beschlossen' },
      deps
    );
    if ('error' in out) throw new Error(out.error);
    expect(out.candidates).toEqual([
      {
        sourceId: 'd1',
        title: 'Antrag',
        sentence: 'Der Kreistag beschließt den Radweg nach Nordheim.',
        charStart: 120,
        charEnd: 169,
        pageNumber: 3,
        chunkIndex: 4,
        // kreistag, radweg von kreistag, radweg, beschlossen
        score: 0.67,
      },
    ]);
    expect(documentService.search).toHaveBeenCalledWith(
      expect.objectContaining({ query: 'Der Kreistag hat den Radweg beschlossen' })
    );
  });
});
