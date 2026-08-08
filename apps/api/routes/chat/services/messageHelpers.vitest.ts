import { describe, it, expect } from 'vitest';

import {
  CONTEXT_CONFIG,
  getPruningBudget,
  sanitizeContentPartsForModel,
  fairShare,
} from './messageHelpers.js';

describe('getPruningBudget', () => {
  it('falls back to the ceiling when the window is unknown', () => {
    expect(getPruningBudget()).toBe(CONTEXT_CONFIG.MAX_CONTEXT_TOKENS);
    expect(getPruningBudget(undefined)).toBe(CONTEXT_CONFIG.MAX_CONTEXT_TOKENS);
  });

  it('stays below the window on the 32k lanes (verdigado-pro, gemma4-31b)', () => {
    // The regression this function exists for: a flat global budget pruned
    // these lanes to more than their model can accept.
    const budget = getPruningBudget(32768);
    expect(budget).toBeLessThan(32768);
    expect(budget).toBe(19937); // floor(32768 * 0.7) - 3000
  });

  it('scales with large windows instead of capping at a global ceiling', () => {
    // No ceiling anymore: 128k Mistral lanes may use their share of the window.
    expect(getPruningBudget(128000)).toBe(86600); // floor(128000 * 0.7) - 3000
  });

  it('never prunes below the floor for tiny declared windows', () => {
    expect(getPruningBudget(4096)).toBe(8000);
  });
});

describe('fairShare', () => {
  it('splits evenly when the floor is not binding', () => {
    expect(fairShare(12, 3, 3)).toBe(4);
    expect(fairShare(9000, 1500, 3)).toBe(3000);
  });

  it('holds the floor instead of starving an item when N is large', () => {
    // The reason this exists: without a floor, a 3-file comparison degrades
    // toward zero per file as N grows instead of staying usable.
    expect(fairShare(12, 3, 10)).toBe(3);
    expect(fairShare(5000, 1500, 10)).toBe(1500);
  });

  it('gives the whole budget to a single item', () => {
    expect(fairShare(9000, 1500, 1)).toBe(9000);
  });

  it('falls back to the floor for a non-positive item count', () => {
    expect(fairShare(9000, 1500, 0)).toBe(1500);
  });
});

describe('sanitizeContentPartsForModel', () => {
  it('keeps tool-result parts on role:tool messages', () => {
    const messages = [
      {
        role: 'tool',
        content: [{ type: 'tool-result', toolCallId: 'c1', toolName: 'search', output: 'hit' }],
      },
    ];

    const [sanitized] = sanitizeContentPartsForModel(messages as never);

    // Dropping this part would blank the result and orphan the matching tool-call.
    expect(sanitized.content).toHaveLength(1);
    expect((sanitized.content as Array<{ type: string }>)[0].type).toBe('tool-result');
  });

  it('still strips unsupported parts from user messages', () => {
    const messages = [
      {
        role: 'user',
        content: [
          { type: 'text', text: 'hallo' },
          { type: 'file', name: 'x.pdf' },
        ],
      },
    ];

    const [sanitized] = sanitizeContentPartsForModel(messages as never);

    expect(sanitized.content).toHaveLength(1);
  });
});
