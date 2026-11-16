/**
 * `highlightSnippet` feeds `relevant_content` of the research and notebook
 * search. The text comes from stored documents, so every return path must be
 * escaped — `<mark>` around the hits is the only markup it may carry.
 */
import { describe, expect, it, vi } from 'vitest';

const facetValueCounts = vi.fn();
vi.mock('../../services/notebook/collectionFacets.js', () => ({
  facetValueCounts: (...a: unknown[]) => facetValueCounts(...a),
  facetDateRange: async () => ({ min: '2020-01-01', max: '2026-01-01' }),
}));

import { getMergedFilters, highlightSnippet } from './researchController.js';

const STORED_MARKUP = '<iframe srcdoc="<p>x</p>"></iframe> <img src="x" onerror="y"> A & B';
const ESCAPED_MARKUP =
  '&lt;iframe srcdoc="&lt;p&gt;x&lt;/p&gt;"&gt;&lt;/iframe&gt; &lt;img src="x" onerror="y"&gt; A &amp; B';

/** Longer than half the snippet limit, so the window search runs at all. */
const LONG_TAIL = ' Wort'.repeat(120);

/** Nothing but `<mark>` may survive as a tag. */
function tagsOutsideMarks(snippet: string): string[] {
  return snippet.replace(/<\/?mark>/g, '').match(/[<>]/g) ?? [];
}

describe('highlightSnippet — escaping', () => {
  it('escapes when there is no query', () => {
    const out = highlightSnippet(STORED_MARKUP, '');
    expect(out).toBe(ESCAPED_MARKUP);
  });

  it('escapes when the query has no usable term', () => {
    const out = highlightSnippet(STORED_MARKUP, 'a b');
    expect(out).toBe(ESCAPED_MARKUP);
  });

  it('escapes a short text even when a term occurs in it', () => {
    const out = highlightSnippet(`${STORED_MARKUP} Hitzeschutz`, 'Hitzeschutz');
    expect(out).toBe(`${ESCAPED_MARKUP} Hitzeschutz`);
  });

  it('escapes a long text no term matches', () => {
    const out = highlightSnippet(`${STORED_MARKUP}${LONG_TAIL}`, 'Hitzeschutz');
    expect(out.startsWith(ESCAPED_MARKUP)).toBe(true);
    expect(tagsOutsideMarks(out)).toEqual([]);
  });

  it('escapes the text around the highlights', () => {
    const out = highlightSnippet(`${STORED_MARKUP} Hitzeschutz${LONG_TAIL}`, 'hitzeschutz');
    expect(out).toContain(`${ESCAPED_MARKUP} <mark>Hitzeschutz</mark>`);
    expect(tagsOutsideMarks(out)).toEqual([]);
  });

  it('keeps an empty text empty', () => {
    expect(highlightSnippet('', 'Hitzeschutz')).toBe('');
  });
});

describe('getMergedFilters — cache', () => {
  const TWO_VALUES = [
    { value: 'a', count: 2 },
    { value: 'b', count: 1 },
  ];

  it('answers a second request from the cache when every field succeeded', async () => {
    facetValueCounts.mockReset().mockResolvedValue(TWO_VALUES);

    const first = await getMergedFilters(['gruene-de-system']);
    const calls = facetValueCounts.mock.calls.length;
    const second = await getMergedFilters(['gruene-de-system']);

    expect(second).toEqual(first);
    expect(facetValueCounts).toHaveBeenCalledTimes(calls);
  });

  it('does not keep an answer in which a field failed', async () => {
    // A remote source being briefly down would otherwise hide its fields for
    // the whole cache lifetime.
    facetValueCounts
      .mockReset()
      .mockRejectedValueOnce(new Error('Bundestag-Quelle gerade nicht erreichbar'))
      .mockResolvedValue(TWO_VALUES);

    await getMergedFilters(['grundsatz-system']);
    const calls = facetValueCounts.mock.calls.length;
    await getMergedFilters(['grundsatz-system']);

    expect(facetValueCounts.mock.calls.length).toBeGreaterThan(calls);
  });
});
