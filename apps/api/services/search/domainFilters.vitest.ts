import { describe, it, expect } from 'vitest';

import { isLowValueDomain, normalizeDomainList } from './domainFilters.js';

describe('isLowValueDomain', () => {
  it('flags a known low-value domain', () => {
    expect(isLowValueDomain('https://amazon.de/dp/123')).toBe(true);
  });

  it('flags the www. variant of a known domain', () => {
    expect(isLowValueDomain('https://www.tripadvisor.com/Hotel_Review')).toBe(true);
  });

  it('matches over http as well as https', () => {
    expect(isLowValueDomain('http://booking.com/hotel/de/xyz.html')).toBe(true);
  });

  it('does not flag an unknown domain', () => {
    expect(isLowValueDomain('https://gruene.de/positionen')).toBe(false);
  });

  it('does not flag a string that is not a URL', () => {
    expect(isLowValueDomain('nicht-mal-eine-url')).toBe(false);
  });

  it('does not flag a missing URL', () => {
    expect(isLowValueDomain(undefined)).toBe(false);
  });

  it('does not flag an arbitrary subdomain of a known domain', () => {
    // Deliberate: only the exact host (after stripping a leading `www.`) is
    // checked against the curated list, not a suffix match. The list targets
    // specific, vetted top-level offenders; matching by suffix would silently
    // widen it to unvetted subdomains (e.g. a legitimate `shop.amazon.de`
    // storefront section vs. some other unrelated subdomain) that nobody
    // reviewed. Widen the list explicitly if a subdomain is ever observed
    // causing the same low-value problem.
    expect(isLowValueDomain('https://shop.amazon.de/some-product')).toBe(false);
  });
});

/**
 * These cases are what the model actually sends. It writes back what the user
 * typed, so "such auf https://zeit.de/politik" arrives with a scheme and a path —
 * and Linkup matches nothing against that, which surfaces as "the site had no
 * results" rather than as a bad parameter. Every case below was a silent
 * empty-result bug waiting to happen.
 */
describe('normalizeDomainList', () => {
  it('strips a scheme, a path and a trailing slash', () => {
    expect(normalizeDomainList(['https://zeit.de/politik/artikel', 'http://orf.at/'])).toEqual([
      'zeit.de',
      'orf.at',
    ]);
  });

  it('strips www. and lowercases', () => {
    expect(normalizeDomainList(['WWW.Spiegel.DE'])).toEqual(['spiegel.de']);
  });

  it('strips a port, a query and a fragment', () => {
    expect(normalizeDomainList(['zeit.de:443', 'orf.at?q=1', 'taz.de#top'])).toEqual([
      'zeit.de',
      'orf.at',
      'taz.de',
    ]);
  });

  it('strips a trailing dot left by the scope heuristic', () => {
    expect(normalizeDomainList(['zeit.de.'])).toEqual(['zeit.de']);
  });

  it('deduplicates entries that normalise to the same host', () => {
    expect(normalizeDomainList(['zeit.de', 'https://www.zeit.de/', 'ZEIT.DE'])).toEqual([
      'zeit.de',
    ]);
  });

  it('drops entries that survive as no host at all', () => {
    // A single unusable entry in `includeDomains` would narrow the search to a
    // host that cannot exist — dropping beats forwarding garbage.
    expect(normalizeDomainList(['', '   ', 'https://', 'zeit', 'localhost'])).toEqual([]);
  });

  it('returns an empty array for a missing or empty list', () => {
    expect(normalizeDomainList(undefined)).toEqual([]);
    expect(normalizeDomainList([])).toEqual([]);
  });
});
