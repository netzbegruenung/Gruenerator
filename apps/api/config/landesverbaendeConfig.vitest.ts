import { describe, expect, it } from 'vitest';

import { LANDESVERBAENDE_CONFIG, getSourceById } from './landesverbaendeConfig.js';

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

// Guards for #3580 (LV curation): the Saarland "Termine" (category 122) exclusion
// must stay on the blog path only — 8 real press releases also carry Termine, so
// excluding it on the presse path would drop real content. And the brandenburg
// archive-beschluesse source must never re-grow the 2023-page duplicate path.

describe('saarland-lv wpApi.excludeCategoryIds', () => {
  const source = LANDESVERBAENDE_CONFIG.sources.find((s) => s.id === 'saarland-lv');

  it('does not exclude category 122 (Termine) on the presse path', () => {
    const pressePath = source?.contentPaths.find((p) => p.path === '/category/pressemitteilungen/');

    expect(pressePath?.wpApi?.excludeCategoryIds ?? []).not.toContain(122);
  });

  it('excludes category 122 (Termine) on the blog path', () => {
    const blogPath = source?.contentPaths.find(
      (p) => p.type === 'blog' && p.wpApi?.categoryIds != null
    );

    expect(blogPath?.wpApi?.excludeCategoryIds).toContain(122);
  });
});

describe('brandenburg-archive-beschluesse', () => {
  it('never points a content path at the 2022-1 (2023) duplicate page', () => {
    const source = LANDESVERBAENDE_CONFIG.sources.find(
      (s) => s.id === 'brandenburg-archive-beschluesse'
    );

    const paths = source?.contentPaths.map((p) => p.path) ?? [];

    expect(paths.some((path) => path.includes('2022-1'))).toBe(false);
  });
});
