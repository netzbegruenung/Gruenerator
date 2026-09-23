/**
 * #3579 fix round 1: a curated `date` passed as `context` must win over a
 * WordPress upload-year folder in the URL. strongPatterns (checked across
 * url, then title, then context) are tried in full before any weakPattern
 * (the year-only fallback that reads the upload folder) — this pins that
 * ordering for the case that surfaced the bug: a PDF re-uploaded years after
 * its real date (e.g. the 2009 Thüringen Landtagswahlprogramm now living
 * under /uploads/2023/06/).
 */
import { describe, it, expect } from 'vitest';

import { DateExtractor } from './DateExtractor.js';

describe('DateExtractor.extractDateFromPdfInfo — curated context date wins over the upload-year folder', () => {
  it('uses the ISO date in context, not the year in the URL upload path', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://example.org/wp-content/uploads/2023/06/Druckfassung-Landtagswahlprogramm_2009.pdf',
      'Landtagswahlprogramm 2009',
      '2009-08-30'
    );

    expect(result.dateString).toBe('2009-08-30');
  });
});
