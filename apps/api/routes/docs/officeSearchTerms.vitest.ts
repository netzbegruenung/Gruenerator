import { describe, expect, it, vi } from 'vitest';

vi.mock('../../database/services/PostgresService.js', () => ({
  getPostgresInstance: () => ({ query: vi.fn() }),
}));

const { officeSearchTerms } = await import('./docsSearch.js');

describe('officeSearchTerms', () => {
  it('splits a keyword chain into words, so each must match rather than the whole phrase', () => {
    expect(officeSearchTerms('Klärwerk Ost Abwärme Prüfgebiet')).toEqual([
      'klärwerk',
      'ost',
      'abwärme',
      'prüfgebiet',
    ]);
  });

  it('drops punctuation, one-letter noise and duplicates', () => {
    expect(officeSearchTerms('„Wärme“, a Wärme?  -- 2026')).toEqual(['wärme', '2026']);
  });

  it('caps the number of terms', () => {
    expect(officeSearchTerms('a1 b2 c3 d4 e5 f6 g7 h8')).toHaveLength(6);
  });

  it('is empty for a query without words', () => {
    expect(officeSearchTerms('  - ! ')).toEqual([]);
  });
});
