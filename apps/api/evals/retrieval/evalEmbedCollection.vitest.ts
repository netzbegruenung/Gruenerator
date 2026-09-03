import { describe, expect, it, vi } from 'vitest';

import { EMBED_CANDIDATES, evalCollectionName } from './embedCandidates.js';
import {
  deleteEvalCollections,
  EVAL_TTL_DAYS,
  expiresAtIso,
  guardDelete,
  planPages,
  pointText,
  SCROLL_PAGE,
  toEvalPoint,
} from './evalEmbedCollection.js';

import { getSystemQdrantCollections } from '../../config/systemCollectionsConfig.js';

describe('planPages', () => {
  it('returns null for an unbounded run', () => {
    expect(planPages(null)).toBeNull();
  });

  it('splits a limit into full pages plus a remainder', () => {
    expect(planPages(600, 256)).toEqual([256, 256, 88]);
    expect(planPages(256, 256)).toEqual([256]);
    expect(planPages(10, 256)).toEqual([10]);
    expect(planPages(0, 256)).toEqual([]);
  });

  it('never plans more points than the limit — the pages are what gets paid for', () => {
    for (const limit of [1, 7, 255, 256, 257, 1000]) {
      const pages = planPages(limit, SCROLL_PAGE);
      expect(pages).not.toBeNull();
      expect(pages!.reduce((a, b) => a + b, 0)).toBe(limit);
      expect(Math.max(...pages!, 0)).toBeLessThanOrEqual(SCROLL_PAGE);
    }
  });

  it('refuses nonsense instead of looping forever', () => {
    expect(() => planPages(10, 0)).toThrow();
    expect(() => planPages(-1, 256)).toThrow();
    expect(() => planPages(1.5, 256)).toThrow();
  });
});

describe('pointText', () => {
  it('prefers chunk_text, falls back to content', () => {
    expect(pointText({ chunk_text: 'a', content: 'b' })).toBe('a');
    expect(pointText({ content: 'b' })).toBe('b');
  });

  it('treats blank and missing text as no text', () => {
    expect(pointText({ chunk_text: '   ' })).toBeNull();
    expect(pointText({})).toBeNull();
    expect(pointText(null)).toBeNull();
    expect(pointText({ chunk_text: 42 })).toBeNull();
  });
});

describe('toEvalPoint', () => {
  const expiresAt = '2026-09-10T00:00:00.000Z';

  it('keeps the id and the whole payload, and adds the expiry', () => {
    const point = toEvalPoint(
      {
        id: 'abc-123',
        payload: { title: 'Grundsatzprogramm', chunk_text: 'x', quality_score: 0.9 },
      },
      [0.1, 0.2],
      expiresAt
    );
    expect(point.id).toBe('abc-123');
    expect(point.payload).toEqual({
      title: 'Grundsatzprogramm',
      chunk_text: 'x',
      quality_score: 0.9,
      eval_expires_at: expiresAt,
    });
  });

  it('puts the new dense vector under the unnamed key, as production does', () => {
    const point = toEvalPoint({ id: 1, payload: {} }, [0.1, 0.2, 0.3], expiresAt);
    expect(point.vector).toEqual({ '': [0.1, 0.2, 0.3] });
  });

  it('copies the sparse vector when the source point carries one', () => {
    const sparse = { indices: [1, 5], values: [0.4, 0.6] };
    const point = toEvalPoint({ id: 1, payload: {}, vector: { bm25: sparse } }, [0.1], expiresAt);
    expect(point.vector).toEqual({ '': [0.1], bm25: sparse });
  });

  it('does not invent a sparse vector when the source has none', () => {
    expect(toEvalPoint({ id: 1, payload: {} }, [0.1], expiresAt).vector).toEqual({ '': [0.1] });
    expect(toEvalPoint({ id: 1, payload: {}, vector: undefined }, [0.1], expiresAt).vector).toEqual(
      { '': [0.1] }
    );
    // Ein unbenannter (dichter) Quellvektor ist kein Sparse-Vektor.
    expect(toEvalPoint({ id: 1, payload: {}, vector: [9, 9] }, [0.1], expiresAt).vector).toEqual({
      '': [0.1],
    });
  });
});

describe('expiresAtIso', () => {
  it('is seven days out, in ISO form', () => {
    expect(expiresAtIso(new Date('2026-09-03T12:00:00.000Z'))).toBe('2026-09-10T12:00:00.000Z');
    expect(EVAL_TTL_DAYS).toBe(7);
  });
});

describe('the delete guard', () => {
  const productionNames = [
    ...getSystemQdrantCollections(),
    'documents',
    'user_knowledge',
    'user_memories',
    'chat_thread_recall',
  ];

  it('accepts only the names the builder creates', () => {
    const evalNames = EMBED_CANDIDATES.map((c) =>
      evalCollectionName(c.slug, 'grundsatz_documents')
    );
    expect(guardDelete([...productionNames, ...evalNames])).toEqual(evalNames);
  });

  it('never lets a production name reach deleteCollection', async () => {
    const deleteFn = vi.fn(async () => undefined);
    const dropped = await deleteEvalCollections(productionNames, deleteFn);

    expect(dropped).toEqual([]);
    expect(deleteFn).not.toHaveBeenCalled();
  });

  it('deletes exactly the eval collections in a mixed list', async () => {
    const deleteFn = vi.fn(async () => undefined);
    const dropped = await deleteEvalCollections(
      [
        'grundsatz_documents',
        'eval_embed_bge-m3__grundsatz_documents',
        'documents',
        'eval_embed_qwen3-8b-regolo__kommunalwiki_documents',
        'eval_embed_',
        'eval_embed_broken',
      ],
      deleteFn
    );

    expect(dropped).toEqual([
      'eval_embed_bge-m3__grundsatz_documents',
      'eval_embed_qwen3-8b-regolo__kommunalwiki_documents',
    ]);
    expect(deleteFn.mock.calls.map((c) => c[0])).toEqual(dropped);
  });
});
