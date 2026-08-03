import { describe, it, expect } from 'vitest';

import { domainHue, domainInitial, extractDomain, getHostname } from './urlUtils';

/**
 * What replaced the Google favicon URL. The point of testing a monogram is not
 * the letter — it is that the colour is STABLE: a source that changes hue
 * between two turns is worse than no icon at all, because the eye learns it as
 * a different source.
 */
describe('domainInitial', () => {
  it('takes the first letter of the registrable name, without "www."', () => {
    expect(domainInitial('www.klimawandelanpassung.at')).toBe('K');
    expect(domainInitial('bmk.gv.at')).toBe('B');
  });

  it('skips leading punctuation instead of rendering it as the brand', () => {
    expect(domainInitial('.gov.at')).toBe('G');
  });

  it('returns nothing when there is no domain — the caller shows a globe', () => {
    expect(domainInitial(undefined)).toBe('');
    expect(domainInitial(null)).toBe('');
    expect(domainInitial('')).toBe('');
    expect(domainInitial('...')).toBe('');
  });
});

describe('domainHue', () => {
  it('gives one domain the same hue every time', () => {
    expect(domainHue('gruene.de')).toBe(domainHue('gruene.de'));
  });

  it('ignores "www." and case, so one source is not two colours', () => {
    expect(domainHue('www.GRUENE.de')).toBe(domainHue('gruene.de'));
  });

  it('stays inside the hue circle', () => {
    for (const d of ['a.de', 'sehr-langer-domainname.example.org', '', '1.1.1.1']) {
      const hue = domainHue(d);
      expect(hue, d).toBeGreaterThanOrEqual(0);
      expect(hue, d).toBeLessThan(360);
    }
  });

  it('separates domains that differ only slightly', () => {
    expect(domainHue('gruene.de')).not.toBe(domainHue('gruene.at'));
  });
});

describe('domain helpers still in use', () => {
  it('extracts and strips www', () => {
    expect(extractDomain('https://www.example.com/a?b=1')).toBe('example.com');
    expect(getHostname('not a url')).toBeNull();
  });
});
