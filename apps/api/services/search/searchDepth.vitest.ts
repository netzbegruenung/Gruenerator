import { describe, it, expect } from 'vitest';

import { resolveTier, tierFromClassification, SEARCH_TIERS } from './searchDepth.js';

/**
 * The tier ladder replaces a system that had only a bottom and a top rung.
 *
 * Before: `web` → Linkup depth=standard; `research` → Linkup depth=deep with
 * Linkup writing the answer. The word "recherchiere" alone took the second
 * door, and the depth the classifier computed for it was discarded unread
 * inside `executeResearch`. Three deep runs in one session cost three paid
 * ~17s calls that a plain search would have answered.
 *
 * These tests pin the two properties that keep that from coming back: the
 * ordinary search stays cheap, and the top tier needs two independent signals.
 */
describe('tierFromClassification', () => {
  it('keeps an ordinary web question at the cheap tier', () => {
    expect(tierFromClassification({ intent: 'web', complexity: 'simple' })).toBe('standard');
  });

  /**
   * The regression this exists to prevent. `moderate` is `detectComplexity`'s
   * FALLBACK — what it returns when no rule matched — and it is by far the most
   * common value. A ladder that upgrades on it would make the deep engine the
   * default for every web search in the product.
   */
  it('does NOT upgrade on the moderate fallback', () => {
    expect(tierFromClassification({ intent: 'web', complexity: 'moderate' })).toBe('standard');
  });

  it('upgrades one step when the user explicitly asked to research', () => {
    expect(tierFromClassification({ intent: 'research', complexity: 'moderate' })).toBe(
      'gruendlich'
    );
  });

  it('upgrades one step for a broad question even without the word', () => {
    expect(tierFromClassification({ intent: 'web', complexity: 'complex' })).toBe('gruendlich');
  });

  it('reaches the top tier only when BOTH signals agree', () => {
    expect(tierFromClassification({ intent: 'research', complexity: 'complex' })).toBe(
      'tiefenrecherche'
    );
  });

  it('falls back to the cheap tier when complexity is unknown', () => {
    expect(tierFromClassification({ intent: 'web' })).toBe('standard');
    expect(tierFromClassification({ intent: 'web', complexity: null })).toBe('standard');
  });

  it('leaves non-search intents at the cheap tier', () => {
    expect(tierFromClassification({ intent: 'direct', complexity: 'complex' })).toBe('gruendlich');
    expect(tierFromClassification({ intent: 'direct', complexity: 'simple' })).toBe('standard');
  });
});

describe('resolveTier', () => {
  it('spends the expensive engine depth only above standard', () => {
    expect(resolveTier('standard').depth).toBe('standard');
    expect(resolveTier('gruendlich').depth).toBe('deep');
    expect(resolveTier('tiefenrecherche').depth).toBe('deep');
  });

  it('separates the two deep tiers by breadth — Linkup has no third depth', () => {
    expect(resolveTier('tiefenrecherche').maxResults).toBeGreaterThan(
      resolveTier('gruendlich').maxResults
    );
  });

  it('grows monotonically, so a higher tier never retrieves less', () => {
    const counts = SEARCH_TIERS.map((t) => resolveTier(t).maxResults);
    expect(counts).toEqual([...counts].sort((a, b) => a - b));
  });

  it('defaults to the cheap tier when none was chosen', () => {
    expect(resolveTier(undefined)).toEqual(resolveTier('standard'));
  });

  it('promises a longer wait only where there is one', () => {
    expect(resolveTier('standard').progress).not.toMatch(/\d+s/);
    expect(resolveTier('tiefenrecherche').progress).toMatch(/\d+/);
  });
});
