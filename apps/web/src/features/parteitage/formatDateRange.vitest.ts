import { describe, expect, it } from 'vitest';

import { formatDateRange } from './formatDateRange';

describe('formatDateRange', () => {
  it.each([
    ['2026-11-13', '2026-11-15', '13.–15. November 2026'],
    ['2026-11-13', '2026-11-13', '13. November 2026'],
    ['2026-10-30', '2026-11-02', '30. Oktober – 2. November 2026'],
    ['2026-12-30', '2027-01-02', '30. Dezember 2026 – 2. Januar 2027'],
  ])('%s – %s', (a, b, expected) => expect(formatDateRange(a, b)).toBe(expected));
});
