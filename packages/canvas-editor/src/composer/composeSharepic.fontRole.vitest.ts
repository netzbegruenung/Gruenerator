import { readFileSync } from 'node:fs';

import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { composeSharepic } from './composeSharepic';
import { expectBrandFontsBound } from './fontRoleCheck';
import { measure, MORE_SPECS, SPECS } from './sharepicSpecFixtures';

const FIXTURES: Record<string, SharepicSpec> = { ...SPECS, ...MORE_SPECS };
// The AI label is set in a fixed PT Sans on both brands: no role, by design.
const BY_HAND = ['sc-ki-label'];

/** The same options the golden files were written with. */
const options = { photoSrc: (file: string) => `/media/${file}`, measure };

/** The composed page without its `bind` keys — what the composer wrote before roles existed. */
const withoutBind = (value: unknown): unknown =>
  JSON.parse(JSON.stringify(value, (key, v: unknown) => (key === 'bind' ? undefined : v)));

describe('composeSharepic: font roles', () => {
  for (const [name, spec] of Object.entries(FIXTURES)) {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      it(`${name} as ${locale}: a brand font carries its role`, () => {
        const page = composeSharepic({ ...spec, locale } as SharepicSpec, options);
        expectBrandFontsBound(page.slides, getBrandTheme(locale).fonts, BY_HAND);
      });

      it(`${name} as ${locale}: the role only adds \`bind\` to the golden page`, () => {
        const page = composeSharepic({ ...spec, locale } as SharepicSpec, options);
        const golden: unknown = JSON.parse(
          readFileSync(new URL(`./__golden__/${name}.${locale}.json`, import.meta.url), 'utf8')
        );
        expect(withoutBind(page)).toEqual(withoutBind(golden));
      });
    }
  }

  it('binds texts and pills in both brands, not nothing', () => {
    const count = (locale: 'de-DE' | 'de-AT') =>
      Object.values(FIXTURES).reduce(
        (sum, spec) =>
          sum +
          expectBrandFontsBound(
            composeSharepic({ ...spec, locale } as SharepicSpec, options).slides,
            getBrandTheme(locale).fonts,
            BY_HAND
          ),
        0
      );
    expect(count('de-DE')).toBeGreaterThan(100);
    expect(count('de-AT')).toBeGreaterThan(100);
  });

  it('writes the ggraphic shape: ref `font.<role>` and the family it gave', () => {
    const page = composeSharepic({ ...SPECS.at, locale: 'de-AT' } as SharepicSpec, options);
    const bindOf = (id: string) => page.slides[0]!.additionalTexts.find((t) => t.id === id)?.bind;
    expect(bindOf('sc-0-zitat')).toEqual({
      fontFamily: { ref: 'font.headline', value: 'GothamNarrow-Ultra' },
    });
    expect(bindOf('sc-0-zitat-name')).toEqual({
      fontFamily: { ref: 'font.body', value: 'GothamNarrow-Book' },
    });
  });
});
