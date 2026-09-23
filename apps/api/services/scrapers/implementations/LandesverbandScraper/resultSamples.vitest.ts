/**
 * Guards the rule that decides whether a failed fetch counts as a hard error or
 * as an upstream dead link.
 *
 * The split exists so `errors` keeps meaning "something broke": LV Berlin's
 * four permanently-403 press releases and LV Sachsen-Anhalt's two 500s recurred
 * byte-for-byte in every nightly run (#2971), and a number that is never zero
 * is a number nobody reads. The danger of the split is the mirror image — a
 * host that starts refusing *every* article page looks, per URL, exactly like
 * pages that were taken down. That is the case these tests pin down.
 */
import { describe, expect, it } from 'vitest';

import {
  addDeadLinkSamples,
  addErrorSamples,
  foldDeadLinksIfNothingWorked,
  MAX_ERROR_SAMPLES,
  mergeQualityFlags,
  mergeSkipReasons,
} from './resultSamples.js';

import type { SourceResult } from './types.js';

function sourceResult(overrides: Partial<SourceResult> = {}): SourceResult {
  return {
    sourceId: 'berlin-fraktion',
    sourceName: 'Grüne Fraktion Berlin',
    stored: 0,
    updated: 0,
    skipped: 0,
    errors: 0,
    errorMessages: [],
    deadLinks: 0,
    deadLinkMessages: [],
    totalVectors: 0,
    skipReasons: {},
    qualityFlags: {},
    contentTypes: {},
    newArticles: [],
    ...overrides,
  };
}

describe('foldDeadLinksIfNothingWorked', () => {
  it('leaves dead links out of the error count when the source otherwise worked', () => {
    const result = sourceResult({
      skipped: 118,
      deadLinks: 4,
      deadLinkMessages: ['https://gruene-fraktion.berlin/pressemitteilungen/x/: HTTP 403'],
    });

    foldDeadLinksIfNothingWorked(result);

    expect(result.errors).toBe(0);
    expect(result.deadLinks).toBe(4);
  });

  it('one processed document is enough — the source is demonstrably reachable', () => {
    const result = sourceResult({ stored: 1, deadLinks: 4, deadLinkMessages: ['a: HTTP 404'] });

    foldDeadLinksIfNothingWorked(result);

    expect(result.errors).toBe(0);
    expect(result.deadLinks).toBe(4);
  });

  it('folds them back into errors when nothing was processed at all', () => {
    // Bot blocking, a moved CMS, an expired certificate: every article page
    // refuses. Per URL that is indistinguishable from a page that is gone, so
    // the only signal left is that the source produced nothing.
    const result = sourceResult({
      deadLinks: 120,
      deadLinkMessages: ['https://example.org/a: HTTP 403', 'https://example.org/b: HTTP 403'],
    });

    foldDeadLinksIfNothingWorked(result);

    expect(result.errors).toBe(120);
    expect(result.deadLinks).toBe(0);
    expect(result.errorMessages).toEqual([
      'https://example.org/a: HTTP 403',
      'https://example.org/b: HTTP 403',
    ]);
    expect(result.deadLinkMessages).toEqual([]);
  });

  it('adds to an existing error count rather than replacing it', () => {
    const result = sourceResult({
      errors: 2,
      errorMessages: ['https://example.org/z: HTTP 500'],
      deadLinks: 3,
      deadLinkMessages: ['https://example.org/a: HTTP 403'],
    });

    foldDeadLinksIfNothingWorked(result);

    expect(result.errors).toBe(5);
    expect(result.errorMessages).toHaveLength(2);
  });

  it('does nothing when there are no dead links', () => {
    const result = sourceResult({ errors: 1, errorMessages: ['boom'] });

    foldDeadLinksIfNothingWorked(result);

    expect(result.errors).toBe(1);
  });
});

describe('addDeadLinkSamples', () => {
  it('caps the sample list like the error one — a total outage must not fill Redis', () => {
    const result = sourceResult();

    addDeadLinkSamples(
      result,
      ...Array.from({ length: 200 }, (_, i) => `https://x/${i}: HTTP 404`)
    );

    expect(result.deadLinkMessages).toHaveLength(MAX_ERROR_SAMPLES);
  });
});

describe('share tokens in samples', () => {
  it('are masked in both buckets, whichever sync path fills them', () => {
    const result = sourceResult();
    const url = 'https://wolke.netzbegruenung.de/s/TESTTOKEN#/Antwort.pdf';

    addErrorSamples(result, `Wolke ${url}: OCR failed`);
    addDeadLinkSamples(result, `${url}: HTTP 404`);

    expect(result.errorMessages).toEqual([
      'Wolke https://wolke.netzbegruenung.de/s/<redacted>#/Antwort.pdf: OCR failed',
    ]);
    expect(result.deadLinkMessages).toEqual([
      'https://wolke.netzbegruenung.de/s/<redacted>#/Antwort.pdf: HTTP 404',
    ]);
  });
});

describe('mergeSkipReasons', () => {
  it('sums counts per reason across content paths without dropping unknown reasons', () => {
    const result = sourceResult();
    mergeSkipReasons(result, { too_old: 400, unchanged: 12 });
    mergeSkipReasons(result, { too_old: 53, no_chunks: 1 });
    expect(result.skipReasons).toEqual({ too_old: 453, unchanged: 12, no_chunks: 1 });
  });
});

describe('mergeQualityFlags', () => {
  it('sums counts per flag across content paths without dropping unknown flags', () => {
    const result = sourceResult();
    mergeQualityFlags(result, { title_fallback: 3, body_fallback: 1 });
    mergeQualityFlags(result, { title_fallback: 2, date_missing_html: 1 });
    expect(result.qualityFlags).toEqual({
      title_fallback: 5,
      body_fallback: 1,
      date_missing_html: 1,
    });
  });
});
