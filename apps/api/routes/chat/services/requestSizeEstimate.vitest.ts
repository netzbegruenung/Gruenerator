import { describe, it, expect } from 'vitest';

import { VERDIGADO_INPUT_LIMIT } from '../agents/autoPolicy.js';

import { estimateRequestTokens } from './messageHelpers.js';

/**
 * Size-aware lane routing (Stufe 2). The estimate exists for exactly one
 * decision — "is this turn too big for the self-hosted lane?" — so the tests
 * pin the properties that decision depends on, not an exact token count.
 */
describe('estimateRequestTokens', () => {
  it('counts the system message as well as the turns', () => {
    const withoutSystem = estimateRequestTokens('', [{ role: 'user', content: 'hallo' }]);
    const withSystem = estimateRequestTokens('x'.repeat(3500), [
      { role: 'user', content: 'hallo' },
    ]);
    expect(withSystem).toBeGreaterThan(withoutSystem + 900);
  });

  it('counts NON-text parts — the bug that made tool-heavy threads look empty', () => {
    // The TokenCounter reads only `type: 'text'` parts, so a replayed search
    // result scored as 0 tokens and a research-heavy thread was routed as if it
    // were small. Serialising the whole message is what fixes that.
    const toolHeavy = [
      {
        role: 'tool',
        content: [
          {
            type: 'tool-result',
            toolCallId: 'c1',
            toolName: 'web_search',
            output: { type: 'text', value: 'x'.repeat(20_000) },
          },
        ],
      },
    ];
    expect(estimateRequestTokens('', toolHeavy)).toBeGreaterThan(5_000);
  });

  it('is empty-safe', () => {
    expect(estimateRequestTokens('', [])).toBe(0);
  });

  it('survives an unserialisable message instead of breaking routing', () => {
    const circular: Record<string, unknown> = { role: 'user' };
    circular.self = circular;
    expect(() => estimateRequestTokens('hi', [circular])).not.toThrow();
  });

  it('grows monotonically with content', () => {
    const small = estimateRequestTokens('', [{ role: 'user', content: 'a'.repeat(1_000) }]);
    const large = estimateRequestTokens('', [{ role: 'user', content: 'a'.repeat(100_000) }]);
    expect(large).toBeGreaterThan(small * 10);
  });
});

describe('VERDIGADO_INPUT_LIMIT', () => {
  // Verdigado is verified to 120k and prunes at 0.7*120k-3000 ≈ 81k. The limit
  // must sit at or below that, otherwise a request would be pruned down on the
  // small lane while a 262k lane was available — the exact loss it prevents.
  it('sits at or below the Verdigado pruning budget', () => {
    const verdigadoPruningBudget = Math.floor(120_000 * 0.7) - 3_000;
    expect(VERDIGADO_INPUT_LIMIT).toBeLessThanOrEqual(verdigadoPruningBudget);
  });

  it('leaves ordinary turns on the self-hosted lane', () => {
    // A long-ish research thread: 30 turns of 2k chars is still ~17k tokens.
    const messages = Array.from({ length: 30 }, () => ({
      role: 'assistant',
      content: 'x'.repeat(2_000),
    }));
    expect(estimateRequestTokens('system', messages)).toBeLessThan(VERDIGADO_INPUT_LIMIT);
  });

  it('routes a genuinely oversized turn away from the self-hosted lane', () => {
    // One big document dump — the case that used to be silently pruned.
    const messages = [{ role: 'user', content: 'x'.repeat(400_000) }];
    expect(estimateRequestTokens('system', messages)).toBeGreaterThan(VERDIGADO_INPUT_LIMIT);
  });
});
