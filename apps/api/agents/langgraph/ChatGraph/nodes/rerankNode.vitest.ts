import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../../../../config/vectorConfig.js', () => ({
  vectorConfig: {
    get: () => ({
      inputLimit: 16,
      outputLimit: 8,
      minRelevance: 0.2,
      mmrLambda: 0.7,
      mmrKeepTop: 8,
      webScoreCeiling: 0.65,
      mergeOverfetch: 16,
    }),
  },
}));

const rerankPipelineMock = vi.fn();
vi.mock('../../../../services/search/rerankPipeline.js', () => ({
  rerankPipeline: (opts: unknown) => rerankPipelineMock(opts),
  DEFAULT_RELEVANCE: 0.5,
}));

import { rerankNode } from './rerankNode.js';

import type { ChatGraphState, SearchResult } from '../types.js';

function makeResults(n: number): SearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    source: `gruenerator:test-${i}`,
    title: `Result ${i}`,
    content: `Content for result ${i}`,
    relevance: 0.5 + i * 0.05,
    url: `https://example.com/${i}`,
  }));
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    searchResults: makeResults(6),
    searchQuery: 'Klimapolitik',
    hasTemporal: false,
    researchBrief: null,
    researchMeta: null,
    notebookCollectionIds: [],
    notebookDocumentIds: [],
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('rerankNode', () => {
  beforeEach(() => {
    rerankPipelineMock.mockReset();
  });

  it('returns reranked results without rerankFailed flag on happy path', async () => {
    rerankPipelineMock.mockResolvedValue({
      rankedIndices: [0, 1, 2],
      scores: new Map([
        [0, 0.9],
        [1, 0.8],
        [2, 0.7],
      ]),
      rerankTimeMs: 12,
    });

    const state = makeState();
    const result = await rerankNode(state);

    expect(result.searchResults).toHaveLength(3);
    expect(result.rerankFailed).toBeUndefined();
    expect(result.searchErrors).toBeUndefined();
  });

  it('sets rerankFailed=true and records error when pipeline reports failure', async () => {
    rerankPipelineMock.mockResolvedValue({
      rankedIndices: [0, 1, 2, 3, 4, 5],
      scores: new Map(),
      rerankTimeMs: 5,
      failed: true,
      error: 'regolo cross-encoder unreachable',
    });

    const state = makeState();
    const result = await rerankNode(state);

    expect(result.searchResults).toHaveLength(6);
    expect(result.rerankFailed).toBe(true);
    expect(result.searchErrors).toEqual([
      { source: 'rerank', message: 'regolo cross-encoder unreachable' },
    ]);
  });

  it('skips reranking entirely when there are 2 or fewer results', async () => {
    const state = makeState({ searchResults: makeResults(2) });
    const result = await rerankNode(state);

    expect(rerankPipelineMock).not.toHaveBeenCalled();
    expect(result.searchResults).toBeUndefined();
    expect(result.rerankFailed).toBeUndefined();
  });
});
