import { describe, it, expect, vi, beforeEach } from 'vitest';

const executeProvider = vi.fn();
vi.mock('../../../../services/ai/execution/index.js', () => ({
  executeProvider: (...args: unknown[]) => executeProvider(...args),
}));

const { qualityGateNode } = await import('./qualityGateNode.js');

import type { ChatGraphState, SearchResult } from '../types.js';

/** The provider answers with `content` on every attempt. */
function answering(content: string) {
  executeProvider.mockReset();
  executeProvider.mockResolvedValue({ content, success: true, stop_reason: 'stop' });
}

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
    ...overrides,
  } as unknown as ChatGraphState;
}

beforeEach(() => answering(JSON.stringify({ score: 4, sufficient: true })));

describe('qualityGateNode', () => {
  it('skips when searchCount has reached maxSearches', async () => {
    const state = makeState({ searchCount: 2, maxSearches: 2 });
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBeUndefined();
    expect(executeProvider).not.toHaveBeenCalled();
  });

  it('skips when there is at most one result', async () => {
    const state = makeState({ searchResults: makeResults(1) });
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBeUndefined();
    expect(executeProvider).not.toHaveBeenCalled();
  });

  it('returns score from JSON on happy path (sufficient)', async () => {
    const state = makeState();
    const result = await qualityGateNode(state);
    expect(result.qualityScore).toBe(4);
    expect(result.searchErrors).toBeUndefined();
    expect(result.searchQuery).toBeUndefined();
  });

  it('returns refinedQuery when LLM signals insufficient', async () => {
    answering(
      JSON.stringify({
        score: 2,
        sufficient: false,
        refinedQuery: 'Vergleich Klimaziele SPD Grüne',
      })
    );

    const result = await qualityGateNode(makeState());
    expect(result.qualityScore).toBe(2);
    expect(result.searchQuery).toBe('Vergleich Klimaziele SPD Grüne');
    expect(result.searchErrors).toBeUndefined();
  });

  it('returns qualityScore=0 (NOT 3) and records error on parse failure', async () => {
    answering('not json at all');

    const result = await qualityGateNode(makeState());
    expect(result.qualityScore).toBe(0);
    expect(result.searchErrors).toEqual([
      { source: 'qualityGate', message: expect.stringContaining('could not be parsed') },
    ]);
  });

  it('returns qualityScore=0 and records error on LLM rejection', async () => {
    executeProvider.mockReset();
    executeProvider.mockRejectedValue(new Error('worker pool down'));

    const result = await qualityGateNode(makeState());
    expect(result.qualityScore).toBe(0);
    // Die Fassade wirft `NoAnswerError`, nachdem die ganze Kette durch ist —
    // die Meldung nennt jetzt zusätzlich Lane und Ursache, statt nur die des
    // ersten Anbieters.
    expect(result.searchErrors).toEqual([
      { source: 'qualityGate', message: expect.stringContaining('worker pool down') },
    ]);
  });
});
