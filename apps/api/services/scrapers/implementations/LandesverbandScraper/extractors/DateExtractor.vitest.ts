/**
 * Guards the pre-OCR age filter (#3576): `isTooOld` must be evaluated against
 * the *source's* `maxAgeYears`, not a hard-coded 10 years — a PDF source
 * configured with `maxAgeYears: 5` would otherwise pass this gate and only get
 * rejected afterwards, at the store stage, once download + OCR already paid
 * for it. See LandesverbandScraper.ts's isPdfArchive branch.
 */
import { describe, expect, it } from 'vitest';

import { DateExtractor } from './DateExtractor.js';

describe('DateExtractor.extractDateFromPdfInfo — maxAgeYears', () => {
  it('a 5-year source rejects a 2019 PDF', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss-2019-03-01.pdf',
      'Beschluss',
      '',
      5
    );

    expect(result.dateString).toBe('2019-03-01');
    expect(result.isTooOld).toBe(true);
  });

  it('a 10-year source accepts the same 2019 PDF', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss-2019-03-01.pdf',
      'Beschluss',
      '',
      10
    );

    expect(result.dateString).toBe('2019-03-01');
    expect(result.isTooOld).toBe(false);
  });
});

describe('DateExtractor.extractDateFromPdfInfo — existing behaviour (characterization)', () => {
  it('a year-only match falls back to a mid-year guess (YYYY-06-15) — fixing the guess is #3575', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/ldk-2020.pdf',
      'LDK 2020',
      '',
      10
    );

    expect(result.dateString).toBe('2020-06-15');
  });

  it('returns null date/dateString/isTooOld when no date can be found anywhere', () => {
    const result = DateExtractor.extractDateFromPdfInfo(
      'https://gruene.example/dokumente/beschluss.pdf',
      'Beschluss',
      '',
      10
    );

    expect(result.date).toBeNull();
    expect(result.dateString).toBeNull();
    expect(result.isTooOld).toBeNull();
  });
});
