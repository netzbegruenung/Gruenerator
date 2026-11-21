import { existsSync } from 'node:fs';

import { brandFontFileSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import {
  SITE_BUNDLED_FONT_FILES,
  siteFontFaceCss,
  siteFontFiles,
  siteFontPreloads,
} from './fonts.js';

describe('site fonts', () => {
  it('de-DE uses GrueneType Neue and PT Sans', () =>
    expect(siteFontFiles('de-DE')).toEqual([
      'GrueneTypeNeue-Regular.woff2',
      'GrueneTypeNeue-Regular.woff',
      'PTSans-Regular.woff2',
      'PTSans-Bold.woff2',
      'PTSans-Italic.woff2',
    ]));
  it('de-AT uses Gotham Narrow only', () =>
    expect(siteFontFiles('de-AT')).toEqual([
      'GothamNarrow-Ultra.woff2',
      'GothamNarrow-Ultra.woff',
      'GothamNarrow-Book.woff2',
      'GothamNarrow-Book.woff',
      'GothamNarrow-Bold.woff2',
      'GothamNarrow-Bold.woff',
    ]));
  it('preloads the display face and the regular text face', () => {
    expect(siteFontPreloads('de-DE')).toEqual([
      'GrueneTypeNeue-Regular.woff2',
      'PTSans-Regular.woff2',
    ]);
    expect(siteFontPreloads('de-AT')).toEqual([
      'GothamNarrow-Ultra.woff2',
      'GothamNarrow-Book.woff2',
    ]);
  });
  it('declares the two site families with swap and the given URLs', () => {
    const css = siteFontFaceCss('de-AT', (f) => `/api/fonts/${f}`);
    expect(css).toContain('font-family:"GrSite Display"');
    expect(css).toContain('font-family:"GrSite Text"');
    expect(css).toContain('url("/api/fonts/GothamNarrow-Ultra.woff2") format("woff2")');
    expect(css.match(/font-display:swap/g)).toHaveLength(3);
    expect(css).not.toMatch(/GrueneType|PTSans/);
    expect(siteFontFaceCss('de-DE', (f) => `/f/${f}`).match(/font-display:swap/g)).toHaveLength(4);
  });
  it.each(['/x")', '/x\\y', '/x\ny', "/x'y"])('rejects the font URL %j', (url) =>
    expect(() => siteFontFaceCss('de-DE', () => url)).toThrow()
  );
  it('every brand file it names is one the API serves', () => {
    for (const locale of ['de-DE', 'de-AT'] as const)
      for (const file of siteFontFiles(locale))
        if (!file.startsWith('PTSans'))
          expect(brandFontFileSchema.safeParse(file).success).toBe(true);
  });
  it('every bundled file exists', () => {
    for (const file of SITE_BUNDLED_FONT_FILES)
      expect(existsSync(new URL(`../../assets/fonts/${file}`, import.meta.url))).toBe(true);
  });
});
