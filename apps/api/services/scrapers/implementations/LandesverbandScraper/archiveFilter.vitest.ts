import { describe, expect, it } from 'vitest';

import { staleDocumentsFilter } from './archiveFilter.js';

/**
 * #3564: the archive pass must never select a Wolke point (age_exempt: true)
 * as a candidate — ingestion already let a real old date through via
 * ignoreMaxAge, so re-applying the age check here would immediately undo it.
 */
describe('staleDocumentsFilter', () => {
  it('scopes to the source and excludes age_exempt points', () => {
    expect(staleDocumentsFilter('berlin-lv-beschluesse')).toEqual({
      must: [{ key: 'source_id', match: { value: 'berlin-lv-beschluesse' } }],
      must_not: [{ key: 'age_exempt', match: { value: true } }],
    });
  });

  it('scopes to whichever source id is passed in', () => {
    const filter = staleDocumentsFilter('saarland-lv');

    expect(filter.must).toEqual([{ key: 'source_id', match: { value: 'saarland-lv' } }]);
  });

  it('always excludes age_exempt points, regardless of source', () => {
    const filter = staleDocumentsFilter('berlin-fraktion-beschluesse');

    expect(filter.must_not).toEqual([{ key: 'age_exempt', match: { value: true } }]);
  });
});
