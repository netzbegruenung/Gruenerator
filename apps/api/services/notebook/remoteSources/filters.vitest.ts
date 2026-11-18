import { describe, expect, it } from 'vitest';

import { fieldFiltersFromQdrant } from './filters.js';

describe('fieldFiltersFromQdrant', () => {
  it('reads what buildSubcategoryFilter + applyDefaultFilter produce', () => {
    expect(
      fieldFiltersFromQdrant({
        must: [
          { key: 'party', match: { value: 'GRÜNE' } },
          { key: 'section_type', match: { any: ['rede', 'befragung'] } },
          { key: 'published_at', range: { gte: '2026-01-01', lte: '2026-06-30' } },
        ],
      } as never)
    ).toEqual({
      match: { party: ['GRÜNE'], section_type: ['rede', 'befragung'] },
      published_at: { gte: '2026-01-01', lte: '2026-06-30' },
    });
  });

  it('keeps AND semantics when one field appears twice', () => {
    // Default filter and user filter on the same field: `must` means both.
    expect(
      fieldFiltersFromQdrant({
        must: [
          { key: 'content_type', match: { any: ['rede', 'drucksache'] } },
          { key: 'content_type', match: { value: 'rede' } },
        ],
      } as never).match
    ).toEqual({ content_type: ['rede'] });
  });

  it('is empty without a filter', () => {
    expect(fieldFiltersFromQdrant(undefined)).toEqual({ match: {} });
  });

  it('throws on clauses it cannot express instead of dropping them', () => {
    // A dropped clause would silently widen the search.
    expect(() =>
      fieldFiltersFromQdrant({ must_not: [{ key: 'party', match: { value: 'AfD' } }] } as never)
    ).toThrow();
    expect(() =>
      fieldFiltersFromQdrant({ must: [{ key: 'chunk_text', match: { text: 'Klima' } }] } as never)
    ).toThrow();
    expect(() => fieldFiltersFromQdrant({ must: [{ is_empty: { key: 'x' } }] } as never)).toThrow();
  });
});
