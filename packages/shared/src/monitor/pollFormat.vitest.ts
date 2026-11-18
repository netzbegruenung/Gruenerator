import { describe, expect, it } from 'vitest';

import { formatPollDate } from './pollFormat';

describe('formatPollDate', () => {
  it('strips a trailing year from an unparseable date', () => {
    expect(formatPollDate('KW 12 2026')).toBe('KW 12');
    expect(formatPollDate('Frühjahr')).toBe('Frühjahr');
  });

  it('stays linear on long whitespace runs', () => {
    const input = `x${' '.repeat(100_000)}y`;
    const start = performance.now();
    expect(formatPollDate(input)).toBe(input);
    expect(performance.now() - start).toBeLessThan(100);
  });
});
