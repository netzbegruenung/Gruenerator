import { describe, expect, it, vi } from 'vitest';

import { type DocumentResult } from '../../BaseSearchService/types.js';

import {
  expandDependents,
  insertDependents,
  MAX_DEPENDENTS_PER_ORIGIN,
  type DependentPoint,
} from './dependentExpansion.js';

import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

const hit = (id: string, score: number, dense: number | null = null): DocumentResult => ({
  document_id: id,
  title: `Titel ${id}`,
  relevant_content: '',
  similarity_score: score,
  dense_similarity_score: dense,
  max_similarity: score,
  avg_similarity: score,
  top_chunks: [],
  chunk_count: 1,
  term_chunk_count: 0,
  relevance_info: '',
});

const dep = (id: string, vorgang_id: string, published_at = '2025-01-01'): DependentPoint => ({
  document_id: id,
  vorgang_id,
  title: `EA ${id}`,
  source_url: null,
  published_at,
  content_type: 'drucksache',
  chunk_text: `# EA ${id}`,
});

describe('insertDependents', () => {
  it('puts a dependent directly behind its origin, just below its score', () => {
    const out = insertDependents(
      [hit('gesetz', 0.9, 0.84), hit('anderes', 0.8)],
      new Map([['gesetz', '1810968']]),
      [dep('ea', '1810968')],
      10
    );
    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'ea', 'anderes']);
    expect(out[1].similarity_score).toBeLessThan(0.9);
    expect(out[1].similarity_score).toBeGreaterThan(0.8);
    expect(out[1].dense_similarity_score).toBeLessThan(0.84);
    expect(out[1].top_chunks[0].text).toBe('# EA ea');
  });

  it('moves a dependent up from a lower rank, but never down from a higher one', () => {
    const order = (results: DocumentResult[]) =>
      insertDependents(results, new Map([['gesetz', '1800001']]), [dep('ea', '1800001')], 10).map(
        (r) => r.document_id
      );
    expect(order([hit('gesetz', 0.9), hit('x', 0.8), hit('ea', 0.1)])).toEqual([
      'gesetz',
      'ea',
      'x',
    ]);
    expect(order([hit('ea', 0.95), hit('gesetz', 0.9)])).toEqual(['ea', 'gesetz']);
  });

  it('takes at most the newest few per origin and keeps the limit', () => {
    const many = Array.from({ length: MAX_DEPENDENTS_PER_ORIGIN + 2 }, (_, i) =>
      dep(`ea${i}`, '1800001', `2025-0${i + 1}-01`)
    );
    const out = insertDependents(
      [hit('gesetz', 0.9), hit('x', 0.5)],
      new Map([['gesetz', '1800001']]),
      many,
      3
    );
    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'ea4', 'ea3']);
  });

  it('leaves results without origins untouched', () => {
    const results = [hit('a', 0.9), hit('b', 0.8)];
    expect(insertDependents(results, new Map(), [dep('ea', '1800001')], 10)).toEqual(results);
  });
});

describe('expandDependents', () => {
  it('asks only Drucksachen for origins and passes the active filters to the dependents', async () => {
    const scrollDocuments = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, payload: { document_id: 'gesetz', vorgang_id: '1810968' } }])
      .mockResolvedValueOnce([{ id: 2, payload: { ...dep('ea', '1810968') } }]);
    const ops = { scrollDocuments } as unknown as QdrantOperations;
    const partei = { key: 'party', match: { value: 'GRÜNE' } };

    const out = await expandDependents(
      ops,
      'landtag_nrw_documents',
      ['Entschließungsantrag'],
      [hit('gesetz', 0.9), hit('protokoll', 0.8)],
      { must: [partei] },
      10
    );

    expect(out.map((r) => r.document_id)).toEqual(['gesetz', 'ea', 'protokoll']);
    const [originFilter, originOpts] = scrollDocuments.mock.calls[0].slice(1);
    expect(originFilter.must).toContainEqual({
      key: 'content_type',
      match: { value: 'drucksache' },
    });
    expect(originFilter.must_not).toEqual([
      { key: 'doc_type', match: { any: ['Entschließungsantrag'] } },
    ]);
    expect(originOpts.withPayload).toEqual(['document_id', 'vorgang_id']);
    const [dependentFilter, dependentOpts] = scrollDocuments.mock.calls[1].slice(1);
    expect(dependentFilter.must).toContainEqual(partei);
    expect(dependentFilter.must).toContainEqual({
      key: 'doc_type',
      match: { any: ['Entschließungsantrag'] },
    });
    expect(dependentOpts.withPayload).not.toContain('full_text');
  });

  it('forwards must_not and should of the active filters', async () => {
    const scrollDocuments = vi
      .fn()
      .mockResolvedValueOnce([{ id: 1, payload: { document_id: 'g', vorgang_id: '1800001' } }])
      .mockResolvedValueOnce([]);
    const ops = { scrollDocuments } as unknown as QdrantOperations;
    const ohneAfd = { key: 'party', match: { value: 'AfD' } };
    const gruenOderSpd = [
      { key: 'party', match: { value: 'GRÜNE' } },
      { key: 'party', match: { value: 'SPD' } },
    ];
    await expandDependents(
      ops,
      'c',
      ['Entschließungsantrag'],
      [hit('g', 0.9)],
      { must_not: [ohneAfd], should: gruenOderSpd },
      10
    );
    const dependentFilter = scrollDocuments.mock.calls[1][1];
    expect(dependentFilter.must_not).toEqual([ohneAfd]);
    expect(dependentFilter.should).toEqual(gruenOderSpd);
  });

  it('asks again with a larger limit when the first answer comes back full', async () => {
    const many = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: i,
        payload: { ...dep(`ea${i}`, '1800001', `2025-01-${String(i + 1).padStart(2, '0')}`) },
      }));
    const scrollDocuments = vi
      .fn()
      .mockResolvedValueOnce([{ id: 0, payload: { document_id: 'g', vorgang_id: '1800001' } }])
      .mockImplementation((_c: string, _f: unknown, opts: { limit: number }) =>
        Promise.resolve(many(Math.min(opts.limit, 9)))
      );
    const ops = { scrollDocuments } as unknown as QdrantOperations;

    const out = await expandDependents(
      ops,
      'c',
      ['Entschließungsantrag'],
      [hit('g', 0.9)],
      null,
      10
    );

    expect(scrollDocuments).toHaveBeenCalledTimes(3);
    expect(scrollDocuments.mock.calls[2][2].limit).toBeGreaterThan(9);
    // die neuesten drei, nicht die ersten drei der Antwort
    expect(out.map((r) => r.document_id)).toEqual(['g', 'ea8', 'ea7', 'ea6']);
  });

  it('skips the second query when no hit is a Drucksache', async () => {
    const scrollDocuments = vi.fn().mockResolvedValueOnce([]);
    const ops = { scrollDocuments } as unknown as QdrantOperations;
    const results = [hit('protokoll', 0.8)];
    expect(await expandDependents(ops, 'c', ['Entschließungsantrag'], results, null, 10)).toEqual(
      results
    );
    expect(scrollDocuments).toHaveBeenCalledTimes(1);
  });
});
