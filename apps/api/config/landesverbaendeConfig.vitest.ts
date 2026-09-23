import { describe, expect, it } from 'vitest';

import { getSourceById } from './landesverbaendeConfig.js';

/**
 * #3564: dating the BE-F dlm-downloads file names correctly (see DateExtractor's
 * leading-YYMMDD tier) pushes ~30 of 56 stored papers into 2017–2021, which is
 * older than the source's old 5-year window. maxAgeYears must stay at 10 so
 * dating them doesn't turn into silently dropping them as `too_old`.
 */
describe('landesverbaendeConfig — berlin-fraktion-beschluesse maxAgeYears (#3564)', () => {
  it('keeps a 10-year window so 2017+ position papers survive dating', () => {
    const source = getSourceById('berlin-fraktion-beschluesse');

    expect(source?.maxAgeYears).toBe(10);
  });
});
