import { describe, it, expect } from 'vitest';

import { truncateResultForModel } from './truncate.js';

describe('truncateResultForModel', () => {
  it('passes primitives through untouched', () => {
    expect(truncateResultForModel('hi', 100)).toBe('hi');
    expect(truncateResultForModel(42, 100)).toBe(42);
    expect(truncateResultForModel(null, 100)).toBeNull();
  });

  it('passes small objects through untouched (same reference)', () => {
    const value = { results: [{ title: 'a' }] };
    expect(truncateResultForModel(value, 10_000)).toBe(value);
  });

  it('truncates long string leaves and marks the result', () => {
    const value = { content: 'x'.repeat(50_000) };
    const out = truncateResultForModel(value, 2000) as { content: string; _truncated?: boolean };
    expect(out._truncated).toBe(true);
    expect(out.content.length).toBeLessThan(50_000);
    expect(out.content.endsWith('…[gekürzt]')).toBe(true);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(2000);
  });

  it('caps long arrays', () => {
    const value = { results: Array.from({ length: 100 }, (_, i) => ({ i, t: `item ${i}` })) };
    const out = truncateResultForModel(value, 1500) as { results: unknown[]; _truncated?: boolean };
    expect(out._truncated).toBe(true);
    expect(out.results.length).toBeLessThan(100);
    expect(JSON.stringify(out).length).toBeLessThanOrEqual(1500);
  });

  it('falls back to a bounded preview when nothing else fits', () => {
    // One giant key name / structure that resists field-level truncation.
    const value = { ['k'.repeat(5000)]: 'v'.repeat(5000) };
    const out = truncateResultForModel(value, 500) as { _truncated?: boolean; preview?: string };
    expect(out._truncated).toBe(true);
    expect(typeof out.preview).toBe('string');
    expect((out.preview as string).length).toBeLessThanOrEqual(500);
  });
});
