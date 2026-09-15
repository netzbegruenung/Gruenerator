/**
 * Pins one security-relevant invariant of the document-search filter builder:
 *
 *   When the caller passes `documentIds`, the upstream code path has already
 *   authorised the viewer for exactly that document set (see
 *   `checkNotebookAccess` in `NotebookQAService._getSingleCollectionSearchContext`).
 *   The Qdrant filter must therefore NOT additionally pin `user_id == viewer` —
 *   doing so excludes documents owned by someone who shared their notebook
 *   with the viewer, breaking shared-notebook search.
 *
 *   When `documentIds` is absent (e.g. personal-library "find anything I own"),
 *   the `user_id` filter MUST remain, since there is no authorised id-set to
 *   substitute for it.
 *
 * Regression context: viewers of shared notebooks were getting 0 hits because
 * chunks were indexed with `payload.user_id = owner`, but the search was
 * filtering by `payload.user_id = viewer`. See plan
 * `~/.claude/plans/embeddingcache-cache-miss-for-tranquil-puzzle.md`.
 *
 * Run: `pnpm --filter @gruenerator/api test`
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: () => undefined,
  },
}));

import { findSimilarChunks, findHybridChunks, performTextSearch } from './searchOperations.js';
import type { QdrantFilter } from '../../../database/services/QdrantService/types.js';
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';

type CapturedFilter = QdrantFilter | undefined;

function makeMockQdrantOps(): {
  ops: QdrantOperations;
  captured: { filter: CapturedFilter; collection: string | undefined };
} {
  const captured: { filter: CapturedFilter; collection: string | undefined } = {
    filter: undefined,
    collection: undefined,
  };
  const ops = {
    searchWithQuality: vi.fn(async (collection, _vec, filter) => {
      captured.filter = filter;
      captured.collection = collection;
      return [];
    }),
    searchWithIntent: vi.fn(async (collection, _vec, _intent, filter) => {
      captured.filter = filter;
      captured.collection = collection;
      return [];
    }),
    hybridSearch: vi.fn(async (collection, _vec, _query, filter) => {
      captured.filter = filter;
      captured.collection = collection;
      return { results: [] };
    }),
    performTextSearch: vi.fn(async (collection, _query, filter) => {
      captured.filter = filter;
      captured.collection = collection;
      return [];
    }),
  } as unknown as QdrantOperations;
  return { ops, captured };
}

function hasClause(filter: CapturedFilter, key: string): boolean {
  if (!filter?.must) return false;
  return filter.must.some((clause) => 'key' in clause && (clause as { key: string }).key === key);
}

function hasUserIdClause(filter: CapturedFilter): boolean {
  if (!filter?.must) return false;
  return filter.must.some(
    (clause) => 'key' in clause && (clause as { key: string }).key === 'user_id'
  );
}

function hasDocumentIdClause(filter: CapturedFilter): boolean {
  if (!filter?.must) return false;
  return filter.must.some(
    (clause) => 'key' in clause && (clause as { key: string }).key === 'document_id'
  );
}

describe('searchOperations — document scoping vs. user scoping invariant', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('findSimilarChunks (vector search)', () => {
    it('omits user_id filter when documentIds is supplied (shared-notebook path)', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await findSimilarChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        userId: 'viewer-id',
        filters: {
          searchCollection: 'documents',
          documentIds: ['doc-1', 'doc-2'],
        },
        limit: 10,
        threshold: 0.35,
      });

      expect(hasUserIdClause(captured.filter)).toBe(false);
      expect(hasDocumentIdClause(captured.filter)).toBe(true);
    });

    it('includes user_id filter when no documentIds (personal-library scan)', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await findSimilarChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        userId: 'viewer-id',
        filters: { searchCollection: 'documents' },
        limit: 10,
        threshold: 0.35,
      });

      expect(hasUserIdClause(captured.filter)).toBe(true);
      expect(hasDocumentIdClause(captured.filter)).toBe(false);
    });

    it('omits user_id filter for system collections regardless of documentIds', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await findSimilarChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        userId: null,
        filters: { searchCollection: 'grundsatz_documents' },
        limit: 10,
        threshold: 0.35,
      });

      expect(hasUserIdClause(captured.filter)).toBe(false);
    });
  });

  describe('findHybridChunks', () => {
    it('omits user_id filter when documentIds is supplied', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await findHybridChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        query: 'q',
        userId: 'viewer-id',
        filters: {
          searchCollection: 'documents',
          documentIds: ['doc-1'],
        },
        limit: 10,
        threshold: 0.35,
        hybridOptions: {},
      });

      expect(hasUserIdClause(captured.filter)).toBe(false);
      expect(hasDocumentIdClause(captured.filter)).toBe(true);
    });

    it('includes user_id filter when no documentIds', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await findHybridChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        query: 'q',
        userId: 'viewer-id',
        filters: { searchCollection: 'documents' },
        limit: 10,
        threshold: 0.35,
        hybridOptions: {},
      });

      expect(hasUserIdClause(captured.filter)).toBe(true);
    });
  });

  // #3166 Fix-Runde 1, t3-fix1-review finding 3: the discriminator
  // (`fusionMethod?.endsWith('-server')`) had zero coverage — the mock above
  // never returns `metadata`, so only the `?? false` fallback arm ever ran.
  describe('findHybridChunks — der -server-Diskriminator', () => {
    function makeHybridResultOps(
      fusionMethod: string,
      originalVectorScore: number | null
    ): QdrantOperations {
      return {
        hybridSearch: vi.fn().mockResolvedValue({
          results: [
            {
              id: 'p1',
              score: 0.9,
              payload: { document_id: 'doc-1', chunk_text: 'text' },
              searchMethod: 'hybrid',
              originalVectorScore,
              originalTextScore: null,
            },
          ],
          metadata: { fusionMethod },
        }),
      } as unknown as QdrantOperations;
    }

    it('trägt den Kosinus in denseSimilarityScore, wenn fusionMethod auf -server endet', async () => {
      const ops = makeHybridResultOps('rrf-server', 0.42);
      const [chunk] = await findHybridChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        query: 'q',
        userId: 'viewer-id',
        filters: { searchCollection: 'documents' },
        limit: 10,
        threshold: 0.35,
        hybridOptions: {},
      });

      expect(chunk?.denseSimilarityScore).toBe(0.42);
    });

    it('bleibt null, wenn fusionMethod von der Alt-Fusion kommt (RRF)', async () => {
      const ops = makeHybridResultOps('RRF', 0.42);
      const [chunk] = await findHybridChunks(ops, true, {
        embedding: [0.1, 0.2, 0.3],
        query: 'q',
        userId: 'viewer-id',
        filters: { searchCollection: 'documents' },
        limit: 10,
        threshold: 0.35,
        hybridOptions: {},
      });

      expect(chunk?.denseSimilarityScore).toBeNull();
    });
  });

  describe('performTextSearch (keyword search)', () => {
    it('omits user_id filter when documentIds is supplied', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await performTextSearch(
        ops,
        'query',
        'viewer-id',
        { documentIds: ['doc-1'], limit: 5 },
        1,
        async () => []
      );

      expect(hasUserIdClause(captured.filter)).toBe(false);
      expect(hasDocumentIdClause(captured.filter)).toBe(true);
    });

    it('includes user_id filter when no documentIds', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await performTextSearch(ops, 'query', 'viewer-id', { limit: 5 }, 1, async () => []);

      expect(hasUserIdClause(captured.filter)).toBe(true);
      expect(hasDocumentIdClause(captured.filter)).toBe(false);
    });

    // Regression: "Volltext" on LV notebooks searched the per-user 'documents'
    // collection with a user_id filter (always zero hits for system content).
    // It must instead query the requested system collection with its scoping.
    it('searches the requested searchCollection, not hardcoded "documents"', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await performTextSearch(
        ops,
        'query',
        '',
        { limit: 5, searchCollection: 'landesverbaende_documents' },
        1,
        async () => []
      );

      expect(captured.collection).toBe('landesverbaende_documents');
    });

    it('omits user_id filter for system collections', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await performTextSearch(
        ops,
        'query',
        '',
        { limit: 5, searchCollection: 'landesverbaende_documents' },
        1,
        async () => []
      );

      expect(hasUserIdClause(captured.filter)).toBe(false);
    });

    it('applies additionalFilter clauses (Landesverband scoping)', async () => {
      const { ops, captured } = makeMockQdrantOps();
      await performTextSearch(
        ops,
        'query',
        '',
        {
          limit: 5,
          searchCollection: 'landesverbaende_documents',
          additionalFilter: { must: [{ key: 'landesverband', match: { value: 'bayern' } }] },
        },
        1,
        async () => []
      );

      expect(hasClause(captured.filter, 'landesverband')).toBe(true);
    });
  });
});
