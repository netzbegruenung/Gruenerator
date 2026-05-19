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

function makeMockQdrantOps(): { ops: QdrantOperations; captured: { filter: CapturedFilter } } {
  const captured: { filter: CapturedFilter } = { filter: undefined };
  const ops = {
    searchWithQuality: vi.fn(async (_collection, _vec, filter) => {
      captured.filter = filter;
      return [];
    }),
    searchWithIntent: vi.fn(async (_collection, _vec, _intent, filter) => {
      captured.filter = filter;
      return [];
    }),
    hybridSearch: vi.fn(async (_collection, _vec, _query, filter) => {
      captured.filter = filter;
      return { results: [] };
    }),
    performTextSearch: vi.fn(async (_collection, _query, filter) => {
      captured.filter = filter;
      return [];
    }),
  } as unknown as QdrantOperations;
  return { ops, captured };
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
  });
});
