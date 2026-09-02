import { describe, it, expect, vi, beforeEach } from 'vitest';

import type { RerankPipelineResult } from '../search/rerankPipeline.js';
import type { ExpandedChunkResult } from '../search/types.js';

const rerankPipeline = vi.fn<() => Promise<RerankPipelineResult>>();
vi.mock('../search/rerankPipeline.js', () => ({
  rerankPipeline: () => rerankPipeline(),
}));

vi.mock('../../utils/logger.js', () => ({
  createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}));

const { rerankNotebookResults } = await import('./rerankNotebookResults.js');

function result(id: string): ExpandedChunkResult {
  return {
    document_id: id,
    source_url: null,
    title: `Doc ${id}`,
    snippet: 'text',
    filename: null,
    similarity: 0.5,
    chunk_index: 0,
    page_number: null,
  };
}

describe('rerankNotebookResults — topRelevance', () => {
  beforeEach(() => {
    rerankPipeline.mockClear();
  });

  it('returns the highest score when the pipeline scored results', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [0, 1],
      scores: new Map([
        [0, 0.72],
        [1, 0.31],
      ]),
      rerankTimeMs: 5,
    });
    const out = await rerankNotebookResults({
      results: [result('a'), result('b'), result('c'), result('d')],
      referencesMap: {},
      question: 'q',
    });
    expect(out.topRelevance).toBe(0.72);
  });

  it('returns null when reranking was skipped (≤3 results)', async () => {
    const out = await rerankNotebookResults({
      results: [result('a'), result('b')],
      referencesMap: {},
      question: 'q',
    });
    expect(out.topRelevance).toBeNull();
    expect(rerankPipeline).not.toHaveBeenCalled();
  });

  it('returns null when the pipeline failed', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [0, 1],
      scores: new Map(),
      rerankTimeMs: 5,
      failed: true,
      error: 'boom',
    });
    const out = await rerankNotebookResults({
      results: [result('a'), result('b'), result('c'), result('d')],
      referencesMap: {},
      question: 'q',
    });
    expect(out.topRelevance).toBeNull();
  });
});
