import { describe, it, expect } from 'vitest';

import { getPruningBudget, getRetrievalBudget, toTokenCounterMessage } from './messageHelpers.js';

/**
 * Stufe 4: retrieval budgets follow the model window instead of being fixed
 * character counts sized for the smallest lane.
 */
describe('getRetrievalBudget', () => {
  it('falls back to the floor when the window is unknown', () => {
    expect(getRetrievalBudget(undefined, 4000)).toBe(4000);
    expect(getRetrievalBudget(0, 8000)).toBe(8000);
  });

  it('never returns less than the floor, even on a tiny window', () => {
    expect(getRetrievalBudget(4_000, 8_000)).toBe(8_000);
  });

  it('scales with the window — the whole point of the change', () => {
    const small = getRetrievalBudget(32_768, 4_000);
    const large = getRetrievalBudget(262_144, 4_000);
    expect(large).toBeGreaterThan(small * 4);
  });

  it('gives a big lane far more than the old fixed 4000 chars', () => {
    // The old constant was the budget itself: ~0.9% of a 262k window.
    expect(getRetrievalBudget(262_144, 4_000)).toBeGreaterThan(100_000);
  });

  it('has no ceiling — the window is the only limit', () => {
    const a = getRetrievalBudget(262_144, 4_000);
    const b = getRetrievalBudget(524_288, 4_000);
    expect(b).toBeGreaterThan(a);
  });

  it('leaves room for history: retrieval share stays well under the pruning share', () => {
    const window = 262_144;
    // Compare like with like by converting the char budget back to tokens.
    const retrievalTokens = getRetrievalBudget(window, 4_000) / 3.5;
    expect(retrievalTokens).toBeLessThan(getPruningBudget(window));
  });
});

/**
 * The counter that decides pruning and compaction used to read only
 * `type: 'text'` parts, scoring replayed tool results, images and reasoning as
 * zero tokens — so a research-heavy thread measured as almost empty.
 */
describe('toTokenCounterMessage', () => {
  it('counts a plain string message', () => {
    expect(toTokenCounterMessage({ role: 'user', content: 'hallo' }).content).toBe('hallo');
  });

  it('counts text parts', () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'eins' },
        { type: 'text', text: 'zwei' },
      ],
    };
    expect(toTokenCounterMessage(msg).content).toBe('einszwei');
  });

  it('no longer scores a tool result as zero tokens', () => {
    const msg = {
      role: 'tool',
      content: [
        {
          type: 'tool-result',
          toolCallId: 'c1',
          toolName: 'web_search',
          output: { type: 'text', value: 'x'.repeat(5_000) },
        },
      ],
    };
    expect(toTokenCounterMessage(msg).content.length).toBeGreaterThan(4_000);
  });

  it('counts reasoning traces, which also used to vanish', () => {
    const msg = {
      role: 'assistant',
      content: [{ type: 'reasoning', text: 'y'.repeat(2_000) }],
    };
    expect(toTokenCounterMessage(msg).content.length).toBeGreaterThan(1_500);
  });

  it('mixes text and non-text without dropping either', () => {
    const msg = {
      role: 'assistant',
      content: [
        { type: 'text', text: 'ANTWORT' },
        { type: 'tool-call', toolCallId: 'c1', toolName: 'search', input: { q: 'z'.repeat(500) } },
      ],
    };
    const out = toTokenCounterMessage(msg).content;
    expect(out).toContain('ANTWORT');
    expect(out.length).toBeGreaterThan(500);
  });

  it('is robust against malformed parts', () => {
    const msg = { role: 'user', content: [null, undefined, { type: 'text' }] } as never;
    expect(() => toTokenCounterMessage(msg)).not.toThrow();
  });
});
