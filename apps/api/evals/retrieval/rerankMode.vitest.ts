import { describe, it, expect } from 'vitest';

import { applyRerankMode } from './rerankMode.js';

describe('applyRerankMode', () => {
  it('sort returns the reranker order unchanged, ignoring retrieval order and keepHead', () => {
    const result = applyRerankMode('sort', [0, 1, 2], [2, 0, 1], 3);
    expect(result).toEqual([2, 0, 1]);
  });

  it('filter keeps retrieval order for the head and reranker order for the tail', () => {
    // Retrieval order 0..4; reranker dropped 4 and reordered the rest.
    const result = applyRerankMode('filter', [0, 1, 2, 3, 4], [3, 1, 0, 2], 3);
    // Head: first 3 retrieval-order candidates the reranker kept -> [0, 1, 2].
    // Tail: reranker order minus the head, in reranker order -> [3].
    expect(result).toEqual([0, 1, 2, 3]);
  });

  it('filter never lets a dropped candidate reappear, even when it led retrieval', () => {
    // Index 1 was dropped by the reranker.
    const result = applyRerankMode('filter', [0, 1, 2, 3], [3, 2, 0], 3);
    expect(result).not.toContain(1);
    expect(result).toEqual([0, 2, 3]);
  });

  it('filter falls back to a shorter head when fewer than keepHead candidates survived', () => {
    const result = applyRerankMode('filter', [0, 1, 2, 3], [1, 0], 3);
    expect(result).toEqual([0, 1]);
  });

  it('blend puts a candidate that is rank 1 in both orders first', () => {
    const result = applyRerankMode('blend', [0, 1, 2], [0, 2, 1], 3);
    expect(result[0]).toBe(0);
    expect(result).toEqual([0, 1, 2]);
  });

  it('blend keeps a dropped candidate in the list with no rerank term', () => {
    // Index 2 never appears in rerankOrder — it keeps only its retrieval term.
    const result = applyRerankMode('blend', [0, 1, 2], [1, 0], 3);
    expect(result).toContain(2);
    expect(result[2]).toBe(2);
  });
});
