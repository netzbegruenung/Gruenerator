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

  describe('pre-budgeted fields', () => {
    /** 10 sources x 900 chars — what a `gruendlich` web_search now returns. */
    const sourceBlock = Array.from(
      { length: 10 },
      (_, i) => `[${i + 1}] Titel ${i} <https://example.org/${i}> — ${'inhalt '.repeat(128)}`
    ).join('\n');

    it('passes `sources` through whole even far past maxChars', () => {
      const value = { resultCount: 10, sources: sourceBlock };
      const out = truncateResultForModel(value, 6000) as { sources: string };
      expect(sourceBlock.length).toBeGreaterThan(6000);
      expect(out.sources).toBe(sourceBlock);
      expect(out.sources).not.toContain('…[gekürzt]');
    });

    it('does not claim truncation when only the exempt field was oversized', () => {
      const value = { resultCount: 10, sources: sourceBlock };
      const out = truncateResultForModel(value, 6000) as { _truncated?: boolean };
      expect(out._truncated).toBeUndefined();
    });

    it('still truncates the non-exempt fields around it', () => {
      const value = { sources: sourceBlock, debug: 'x'.repeat(50_000) };
      const out = truncateResultForModel(value, 6000) as {
        sources: string;
        debug: string;
        _truncated?: boolean;
      };
      expect(out.sources).toBe(sourceBlock);
      expect(out._truncated).toBe(true);
      expect(out.debug.endsWith('…[gekürzt]')).toBe(true);
      expect(out.debug.length).toBeLessThan(2000);
    });

    it('never falls back to the preview shape when an exempt field is present', () => {
      // Without the exemption this shape would lose `sources` entirely.
      const value = { sources: sourceBlock, ['k'.repeat(5000)]: 'v'.repeat(5000) };
      const out = truncateResultForModel(value, 500) as { sources?: string; preview?: string };
      expect(out.preview).toBeUndefined();
      expect(out.sources).toBe(sourceBlock);
    });

    it('honours a caller-supplied exemption set', () => {
      const value = { sources: sourceBlock };
      const out = truncateResultForModel(value, 6000, new Set()) as { sources: string };
      expect(out.sources.endsWith('…[gekürzt]')).toBe(true);
    });
  });
});
