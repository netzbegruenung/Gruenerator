import { describe, it, expect } from 'vitest';

import { decodeHtmlEntities } from './decodeHtmlEntities.js';

describe('decodeHtmlEntities', () => {
  it('decodes named entities including German umlauts', () => {
    expect(decodeHtmlEntities('&Ouml;sterreicherinnen')).toBe('Österreicherinnen');
    expect(decodeHtmlEntities('f&uuml;r')).toBe('für');
    expect(decodeHtmlEntities('gro&szlig;')).toBe('groß');
  });

  it('decodes decimal numeric references', () => {
    expect(decodeHtmlEntities('&#34;2026&#34;')).toBe('"2026"');
  });

  it('decodes hex numeric references', () => {
    expect(decodeHtmlEntities('it&#x27;s')).toBe("it's");
  });

  it('resolves one level of double-encoding', () => {
    expect(decodeHtmlEntities('&amp;quot;2026&amp;quot;')).toBe('"2026"');
  });

  it('leaves unknown entities untouched', () => {
    expect(decodeHtmlEntities('AT&foo;T')).toBe('AT&foo;T');
  });

  it('leaves out-of-range numeric references untouched', () => {
    expect(decodeHtmlEntities('&#99999999;')).toBe('&#99999999;');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(decodeHtmlEntities(null)).toBe('');
    expect(decodeHtmlEntities(undefined)).toBe('');
    expect(decodeHtmlEntities('')).toBe('');
  });

  it('leaves plain text without entities unchanged', () => {
    expect(decodeHtmlEntities('Kein Problem hier.')).toBe('Kein Problem hier.');
  });
});
