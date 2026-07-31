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

  const flatScores = (n: number) =>
    new Map(Array.from({ length: n }, (_, i) => [i, 0.8] as [number, number]));

  describe('distilled candidates', () => {
    // A distilled page was assembled by taking the passages this same
    // cross-encoder scored highest against this same query — re-scoring it is a
    // biased maximum, and it competes against raw party documents.
    it('damps a distilled candidate against an undistilled one', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const results = makeResults(3);
      results[0]!.distilled = true;
      const out = await rerankNode(makeState({ searchResults: results }));
      const [first, second] = out.searchResults ?? [];
      expect(first?.relevance).toBeLessThan(second?.relevance as number);
      expect(first?.relevance).toBeCloseTo(0.8 * 0.85, 5);
    });

    it('scores the best passage, not the head of the digest', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const results = makeResults(3);
      results[0]!.content = `${'HEAD '.repeat(300)}${'TAIL '.repeat(300)}`;
      results[0]!.distilledChunks = [
        { text: 'HEAD '.repeat(300).trim(), score: 0.1, order: 0, start: 0 },
        { text: 'TAIL '.repeat(300).trim(), score: 0.9, order: 1, start: 1500 },
      ];
      await rerankNode(makeState({ searchResults: results }));
      const items = rerankPipelineMock.mock.calls[0]?.[0]?.items as Array<{ content: string }>;
      expect(items[0]?.content.startsWith('TAIL')).toBe(true);
    });

    it('leaves an undistilled candidate on a plain head slice', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const results = makeResults(3);
      results[0]!.content = 'ANFANG '.repeat(400);
      await rerankNode(makeState({ searchResults: results }));
      const items = rerankPipelineMock.mock.calls[0]?.[0]?.items as Array<{ content: string }>;
      expect(items[0]?.content.startsWith('ANFANG')).toBe(true);
      expect(items[0]?.content.length).toBe(1200);
    });
  });

  describe('recency', () => {
    const withDates = (): SearchResult[] => {
      const r = makeResults(3);
      r[0]!.publishedDate = new Date(Date.now() - 5 * 86_400_000).toISOString();
      r[1]!.publishedDate = new Date(Date.now() - 900 * 86_400_000).toISOString();
      return r;
    };

    it('lifts a fresh source above a stale one on a temporal question', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const out = await rerankNode(makeState({ searchResults: withDates(), hasTemporal: true }));
      const [fresh, stale] = out.searchResults ?? [];
      expect(fresh?.relevance).toBeGreaterThan(stale?.relevance as number);
    });

    // For "wer war Marilyn Monroe" preferring recent material is actively wrong.
    it('changes nothing when the question is not temporal', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const out = await rerankNode(makeState({ searchResults: withDates(), hasTemporal: false }));
      expect((out.searchResults ?? []).map((r) => r.relevance)).toEqual([0.8, 0.8, 0.8]);
    });

    // A provider not reporting a date says nothing about the source.
    it('does not penalise a source without a date', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const out = await rerankNode(makeState({ searchResults: withDates(), hasTemporal: true }));
      expect(out.searchResults?.[2]?.relevance).toBe(0.8);
    });

    it('ignores an unparseable date instead of throwing', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      const results = makeResults(3);
      results[0]!.publishedDate = 'letzte Woche';
      const out = await rerankNode(makeState({ searchResults: results, hasTemporal: true }));
      expect(out.searchResults?.[0]?.relevance).toBe(0.8);
    });

    it('no longer asks the cross-encoder for recency it cannot see', async () => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: flatScores(3),
        rerankTimeMs: 4,
      });
      await rerankNode(makeState({ hasTemporal: true }));
      const instruct = rerankPipelineMock.mock.calls[0]?.[0]?.instruct as string;
      expect(instruct).not.toContain('recent');
    });
  });
});
