import { describe, it, expect, vi } from 'vitest';

import { qualityGateNode } from './qualityGateNode.js';

import type { ChatGraphState, SearchResult } from '../types.js';

vi.mock('../../../../utils/logger.js', () => ({
  createLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

function makeResults(n: number): SearchResult[] {
  return Array.from({ length: n }, (_, i) => ({
    source: `gruenerator:test-${i}`,
    title: `Result ${i}`,
    content: `Content for result ${i}`,
  }));
}

function makeState(overrides: Partial<ChatGraphState> = {}): ChatGraphState {
  return {
    searchResults: makeResults(4),
    searchQuery: 'Klimapolitik',
    searchCount: 0,
    maxSearches: 2,
    researchBrief: null,
    researchMeta: null,
    aiWorkerPool: {
      processRequest: vi.fn().mockResolvedValue({
        content: JSON.stringify({ score: 4, sufficient: true }),
      }),
    },
    ...overrides,
  } as unknown as ChatGraphState;
}

describe('qualityGateNode', () => {
  it('skips when searchCount has reached maxSearches', async () => {
    const state = makeState({ searchCount: 2, maxSearches: 2 });
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBeUndefined();
    expect(state.aiWorkerPool.processRequest).not.toHaveBeenCalled();
  });

  it('skips when there is at most one result', async () => {
    const state = makeState({ searchResults: makeResults(1) });
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBeUndefined();
    expect(state.aiWorkerPool.processRequest).not.toHaveBeenCalled();
  });

  it('returns score from JSON on happy path (sufficient)', async () => {
    const state = makeState();
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBe(4);
    expect(result.searchErrors).toBeUndefined();
    expect(result.searchQuery).toBeUndefined();
  });

  it('returns refinedQuery when LLM signals insufficient', async () => {
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockResolvedValue({
          content: JSON.stringify({
            score: 2,
            sufficient: false,
            refinedQuery: 'Vergleich Klimaziele SPD Grüne',
          }),
        }),
      } as any,
    });

    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBe(2);
    expect(result.searchQuery).toBe('Vergleich Klimaziele SPD Grüne');
    expect(result.searchErrors).toBeUndefined();
  });

  it('returns qualityScore=0 (NOT 3) and records error on parse failure', async () => {
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockResolvedValue({ content: 'not json at all' }),
      } as any,
    });

    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBe(0);
    expect(result.searchErrors).toEqual([
      { source: 'qualityGate', message: expect.stringContaining('could not be parsed') },
    ]);
  });

  it('returns qualityScore=0 and records error on LLM rejection', async () => {
    const state = makeState({
      aiWorkerPool: {
        processRequest: vi.fn().mockRejectedValue(new Error('worker pool down')),
      } as any,
    });

    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBe(0);
    expect(result.searchErrors).toEqual([{ source: 'qualityGate', message: 'worker pool down' }]);
  });
});
