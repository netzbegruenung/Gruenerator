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

import { MAX_SOURCES } from './citableSources.js';
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

  // Das Fenster ist die eigentliche Aussage dieses Knotens: es entscheidet,
  // wie viele Kandidaten der Cross-Encoder überhaupt zu Gesicht bekommt. Vorher
  // war es an `MAX_SOURCES` (20) geknüpft — die Prompt-Decke — und damit auf
  // einem notebook-gebundenen Turn immer so groß wie das Ergebnis selbst.
  describe('Fenster', () => {
    const windowOf = () => {
      const call = rerankPipelineMock.mock.calls[0]?.[0] as {
        inputLimit: number;
        outputLimit: number;
      };
      return { inputLimit: call.inputLimit, outputLimit: call.outputLimit };
    };

    beforeEach(() => {
      rerankPipelineMock.mockResolvedValue({
        rankedIndices: [0, 1, 2],
        scores: new Map([
          [0, 0.9],
          [1, 0.8],
          [2, 0.7],
        ]),
        rerankTimeMs: 12,
      });
    });

    it('nimmt für ein @erwähntes Notebook die Zahlen der Stufe, nicht MAX_SOURCES', async () => {
      await rerankNode(makeState({ notebookCollectionIds: ['hessen'] }));

      expect(windowOf()).toEqual({ inputLimit: 40, outputLimit: 18 });
    });

    // Der Fall, für den das hier gebaut wurde: ein LV-Agent bindet sein
    // Notebook über `defaultNotebookIds`, ohne dass jemand es erwähnt hat.
    it('gilt genauso für einen an ein Notebook gebundenen Agenten', async () => {
      await rerankNode(makeState({ defaultNotebookCollectionIds: ['hessen'] }));

      expect(windowOf()).toEqual({ inputLimit: 40, outputLimit: 18 });
    });

    // Das Eingabefenster DARF über der Prompt-Decke liegen — genau das war die
    // Entkopplung. Beschnitten wird erst in `buildCitableSources`.
    it('lässt das Eingabefenster über MAX_SOURCES hinausgehen', async () => {
      await rerankNode(makeState({ notebookCollectionIds: ['hessen'] }));

      expect(windowOf().inputLimit).toBeGreaterThan(MAX_SOURCES);
      // …die Ausgabe aber nicht: sonst fielen Quellen zwischen Reranker und
      // Prompt still unter den Tisch.
      expect(windowOf().outputLimit).toBeLessThanOrEqual(MAX_SOURCES);
    });

    it('lässt Turns ohne Notebook-Bezug unverändert', async () => {
      await rerankNode(makeState({ searchResults: makeResults(6) }));

      expect(windowOf()).toEqual({ inputLimit: 16, outputLimit: 8 });
    });
  });
});
