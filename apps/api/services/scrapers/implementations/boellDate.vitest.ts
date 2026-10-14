import { describe, expect, it } from 'vitest';

import { dateFromBoellUrl } from './BoellStiftungScraper.js';

// boell.de pages have no date meta tag and no <time>, so the URL is the date
// source; without it every article stored `published_at: null` (#4267).
describe('dateFromBoellUrl', () => {
  it('reads the date from a German and an English article path', () => {
    expect(
      dateFromBoellUrl(
        'https://www.boell.de/de/2026/01/21/gesamtverteidigung-der-klimakrise-vorsorge-entscheidet-ueber-resilienz'
      )
    ).toBe('2026-01-21');
    expect(dateFromBoellUrl('https://www.boell.de/en/2025/05/27/tapping-momentum')).toBe(
      '2025-05-27'
    );
  });

  it('gives nothing for pages without a dated path', () => {
    expect(dateFromBoellUrl('https://www.boell.de/de/themen/klima')).toBeNull();
    expect(dateFromBoellUrl('https://www.boell.de/de/person/kathrin-stolzenburg')).toBeNull();
  });
});
