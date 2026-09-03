import { describe, expect, it, vi } from 'vitest';

import { EMBED_CANDIDATES, evalCollectionName } from './embedCandidates.js';
import {
  buildTargetConfig,
  createTargetCollection,
  deleteEvalCollections,
  EVAL_TTL_DAYS,
  expiresAtIso,
  guardDelete,
  planPages,
  pointText,
  resolveSourceCollections,
  SCROLL_PAGE,
  toEvalPoint,
  type TargetCollectionWriter,
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

describe('resolveSourceCollections', () => {
  it('accepts a system collection id and its physical name alike', () => {
    expect(resolveSourceCollections(['grundsatz-system', 'kommunalwiki_documents'])).toEqual([
      'grundsatz_documents',
      'kommunalwiki_documents',
    ]);
  });

  it('rejects the user-content collections, naming the allowed set', () => {
    expect(() => resolveSourceCollections(['documents'])).toThrow(/not an allowed source/);
    expect(() => resolveSourceCollections(['documents'])).toThrow(/grundsatz_documents/);
    expect(() => resolveSourceCollections(['user_knowledge'])).toThrow(/not an allowed source/);
  });

  it('rejects an unknown name and fails the whole list, not just that entry', () => {
    expect(() => resolveSourceCollections(['grundsatz_documents', 'nonsense'])).toThrow(
      /"nonsense"/
    );
  });
});

/**
 * `getCollectionConfig` deklariert IMMER `sparse_vectors.bm25`. Auf einer
 * Quelle ohne Sparse-Vektor hätte die Kopie damit einen — und
 * `collectionSupportsBm25` schickt sie über den server-seitigen Fusions-Pfad,
 * also über eine andere Fusion als die Basis. Das wäre eine zweite Variable im
 * Vergleich und stünde in der Tabelle als Modellbefund.
 */
describe('buildTargetConfig / createTargetCollection', () => {
  function fakeWriter() {
    const creates: Array<{ name: string; config: Record<string, unknown> }> = [];
    const indexes: Array<{ name: string; field: string }> = [];
    const writer: TargetCollectionWriter = {
      createCollection: async (name, config) => {
        creates.push({ name, config });
        return undefined;
      },
      createPayloadIndex: async (name, params) => {
        indexes.push({ name, field: params.field_name });
        return undefined;
      },
    };
    return { creates, indexes, writer };
  }

  it('declares no sparse vector when the source has none', async () => {
    const { creates, writer } = fakeWriter();
    await createTargetCollection(
      writer,
      'eval_embed_bge-m3__grundsatz_documents',
      'grundsatz_documents',
      1024,
      false
    );
    expect(creates).toHaveLength(1);
    expect(creates[0].name).toBe('eval_embed_bge-m3__grundsatz_documents');
    expect(creates[0].config).not.toHaveProperty('sparse_vectors');
    expect(creates[0].config.vectors).toEqual({ size: 1024, distance: 'Cosine' });
  });

  it('declares the sparse vector when the source has one', async () => {
    const { creates, writer } = fakeWriter();
    await createTargetCollection(
      writer,
      'eval_embed_bge-m3__kommunalwiki_documents',
      'kommunalwiki_documents',
      1024,
      true
    );
    expect(creates[0].config.sparse_vectors).toEqual({ bm25: { modifier: 'idf' } });
  });

  it('carries the dimension of the candidate, not of the source', () => {
    expect(buildTargetConfig(4096, 'grundsatz_documents', false).vectors).toEqual({
      size: 4096,
      distance: 'Cosine',
    });
  });

  it("recreates the source's payload indexes", async () => {
    const { indexes, writer } = fakeWriter();
    await createTargetCollection(
      writer,
      'eval_embed_x__grundsatz_documents',
      'grundsatz_documents',
      1024,
      false
    );
    expect(indexes.map((i) => i.field)).toContain('chunk_text');
  });

  it('creates the collection even for a source without a schema entry', async () => {
    const { creates, indexes, writer } = fakeWriter();
    const warnings: string[] = [];
    await createTargetCollection(
      writer,
      'eval_embed_x__unknown_collection',
      'unknown_collection',
      1024,
      false,
      (m) => warnings.push(m)
    );
    expect(creates).toHaveLength(1);
    expect(indexes).toHaveLength(0);
    expect(warnings.join(' ')).toMatch(/COLLECTION_SCHEMAS/);
  });
});

describe('the delete guard, scoped to one candidate', () => {
  const names = [
    'grundsatz_documents',
    'eval_embed_bge-m3__grundsatz_documents',
    'eval_embed_bge-m3__kommunalwiki_documents',
    'eval_embed_qwen3-8b-regolo__grundsatz_documents',
  ];

  it('drops only the named candidate, never a sibling still being measured', async () => {
    const deleteFn = vi.fn(async () => undefined);
    const dropped = await deleteEvalCollections(names, deleteFn, 'bge-m3');

    expect(dropped).toEqual([
      'eval_embed_bge-m3__grundsatz_documents',
      'eval_embed_bge-m3__kommunalwiki_documents',
    ]);
    expect(deleteFn.mock.calls.map((c) => c[0])).toEqual(dropped);
  });

  it('does not match a slug by prefix alone', () => {
    // `bge` darf nicht die Sammlungen von `bge-m3` treffen.
    expect(guardDelete(names, 'bge')).toEqual([]);
  });

  it('still drops everything when no slug is given', () => {
    expect(guardDelete(names)).toHaveLength(3);
  });
});
