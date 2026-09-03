import { describe, it, expect, vi, beforeEach } from 'vitest';

const rerankPipeline = vi.fn();

vi.mock('../search/rerankPipeline.js', () => ({
  rerankPipeline: (...args: unknown[]) => rerankPipeline(...args),
}));

import { rerankNotebookResults } from './rerankNotebookResults.js';

import type { ExpandedChunkResult, ReferencesMap } from '../search/types.js';

function makeResult(n: number): ExpandedChunkResult {
  return {
    document_id: `doc-${n}`,
    source_url: null,
    title: `Dokument ${n}`,
    snippet: `Vorschau ${n}`,
    chunk_text: `Chunk ${n}`,
    filename: null,
    similarity: 0.5 + n / 100,
    chunk_index: n,
    page_number: null,
  };
}

function makeReferencesMap(results: ExpandedChunkResult[]): ReferencesMap {
  const map: ReferencesMap = {};
  results.forEach((r, i) => {
    map[String(i + 1)] = {
      title: r.title,
      snippets: [[r.snippet]],
      description: null,
      date: null,
      source: 'qa_documents',
      document_id: r.document_id,
      source_url: null,
      filename: null,
      similarity_score: r.similarity,
      chunk_index: r.chunk_index,
      page_number: null,
    };
  });
  return map;
}

const results = [0, 1, 2, 3, 4].map(makeResult);
const referencesMap = makeReferencesMap(results);

beforeEach(() => {
  rerankPipeline.mockReset();
});

describe('rerankNotebookResults', () => {
  /**
   * Die Quellenkarte zeigt „x % Relevanz" aus `similarity_score` der Zitation,
   * sortiert wird die Liste aber vom Cross-Encoder. Bleibt der Retrieval-Wert
   * stehen, trägt Platz 1 eine kleinere Zahl als Platz 3.
   */
  it('carries the reranker score into results and references', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [3, 0, 2],
      scores: new Map([
        [0, 0.71],
        [1, 0.2],
        [2, 0.63],
        [3, 0.94],
        [4, 0.1],
      ]),
      rerankTimeMs: 5,
    });

    const out = await rerankNotebookResults({ results, referencesMap, question: 'Warum?' });

    expect(out.results.map((r) => r.similarity)).toEqual([0.94, 0.71, 0.63]);
    const scoresInOrder = out.results.map((r) => r.similarity);
    expect(scoresInOrder).toEqual([...scoresInOrder].sort((a, b) => b - a));

    const byDoc = new Map(
      Object.values(out.referencesMap).map((ref) => [ref.document_id, ref.similarity_score])
    );
    expect(byDoc.get('doc-3')).toBe(0.94);
    expect(byDoc.get('doc-0')).toBe(0.71);
    expect(byDoc.get('doc-2')).toBe(0.63);
  });

  it('keeps the retrieval score when the rerank call failed', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [0, 1, 2],
      scores: new Map([
        [0, 0.9],
        [1, 0.8],
        [2, 0.7],
      ]),
      rerankTimeMs: 5,
      failed: true,
      error: 'boom',
    });

    const out = await rerankNotebookResults({ results, referencesMap, question: 'Warum?' });

    expect(out.results.map((r) => r.similarity)).toEqual([0.5, 0.51, 0.52]);
    expect(Object.values(out.referencesMap).map((r) => r.similarity_score)).toEqual([
      0.5, 0.51, 0.52,
    ]);
  });

  it('keeps the retrieval score on the skip path', async () => {
    const few = results.slice(0, 3);
    const out = await rerankNotebookResults({
      results: few,
      referencesMap: makeReferencesMap(few),
      question: 'Warum?',
    });

    expect(rerankPipeline).not.toHaveBeenCalled();
    expect(out.results.map((r) => r.similarity)).toEqual([0.5, 0.51, 0.52]);
  });

  it('forwards mode and instruct when given', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [0, 1, 2],
      scores: new Map([
        [0, 0.9],
        [1, 0.8],
        [2, 0.7],
      ]),
      rerankTimeMs: 5,
    });

    await rerankNotebookResults({
      results,
      referencesMap,
      question: 'Warum?',
      mode: 'filter',
      instruct: 'Bevorzuge amtliche Quellen',
    });

    const call = rerankPipeline.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call.mode).toBe('filter');
    expect(call.instruct).toBe('Bevorzuge amtliche Quellen');
  });

  it('omits mode and instruct when absent', async () => {
    rerankPipeline.mockResolvedValue({
      rankedIndices: [0, 1, 2],
      scores: new Map([
        [0, 0.9],
        [1, 0.8],
        [2, 0.7],
      ]),
      rerankTimeMs: 5,
    });

    await rerankNotebookResults({ results, referencesMap, question: 'Warum?' });

    const call = rerankPipeline.mock.calls.at(-1)?.[0] as Record<string, unknown>;
    expect(call).not.toHaveProperty('mode');
    expect(call).not.toHaveProperty('instruct');
  });
});
