import { describe, expect, it } from 'vitest';

import {
  citationReferenceRegex,
  parseSourceLinkHref,
  sourceLinkRegex,
  sourceLinksToCitations,
} from './sourceLinks';

describe('sourceLinks', () => {
  it('parses the citation id from a link target', () => {
    expect(parseSourceLinkHref('quelle:3')).toBe(3);
    expect(parseSourceLinkHref(' quelle:12 ')).toBe(12);
  });

  it('rejects everything that is not a source link', () => {
    expect(parseSourceLinkHref('https://example.org')).toBeNull();
    expect(parseSourceLinkHref('quelle:0')).toBeNull();
    expect(parseSourceLinkHref('quelle:abc')).toBeNull();
    expect(parseSourceLinkHref('quelle:3x')).toBeNull();
    expect(parseSourceLinkHref(undefined)).toBeNull();
  });

  it('finds every link with its label and id', () => {
    const text = '- [Kohleausstieg jetzt](quelle:1)\n- [**LEAG-Geheimplan**](quelle:12)';
    const matches = [...text.matchAll(sourceLinkRegex())].map((m) => [m[1], m[2]]);
    expect(matches).toEqual([
      ['Kohleausstieg jetzt', '1'],
      ['**LEAG-Geheimplan**', '12'],
    ]);
  });

  it('leaves ordinary links and mention tokens alone', () => {
    const text = '[gruene.de](https://gruene.de) und @[Brandenburg](notebook:brandenburg)';
    expect(sourceLinksToCitations(text)).toBe(text);
  });

  it('turns source links into label plus citation marker', () => {
    expect(sourceLinksToCitations('Siehe [Wahlprogramm 2024](quelle:4).')).toBe(
      'Siehe Wahlprogramm 2024 [4].'
    );
  });

  it('matches links and markers in one pass, the link winning at its position', () => {
    const found = [
      ...'[2024](quelle:2) steht in [1, 3] und [4].'.matchAll(citationReferenceRegex()),
    ].map((m) => [m[1], m[2], m[3]]);
    expect(found).toEqual([
      ['2024', '2', undefined],
      [undefined, undefined, '1, 3'],
      [undefined, undefined, '4'],
    ]);
  });
});
