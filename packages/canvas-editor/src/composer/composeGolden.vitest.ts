import { type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';
import { MORE_SPECS, SPECS } from './sharepicSpecFixtures';

/**
 * The composer's whole output for every fixture, in both brands, pinned as
 * JSON. A refactor that turns a brand branch into data must leave every file
 * unchanged: the same page object renders the same pixels, so this proves "no
 * visual change" without a browser or the brand fonts. A change that is meant
 * to look different updates the files with `vitest -u`, and the diff shows
 * what moved.
 *
 * Each fixture also runs under the other locale, so every `isAt` branch is
 * exercised from both sides.
 */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (file: string) => `/media/${file}`, measure };

// Golden-only cases for paths no shared fixture reaches; the visual lane does
// not render these, so they need no baseline. Each one was added because a
// brand value could change without any fixture noticing.
const GOLDEN_ONLY: Record<string, SharepicSpec> = {
  // A name short enough that the size cap binds, not the width.
  steckbriefKurzerName: {
    ...MORE_SPECS.steckbrief,
    slides: MORE_SPECS.steckbrief.slides.map((slide) => ({
      ...slide,
      items: slide.items.map((item) =>
        item.type === 'steckbrief' ? { ...item, name: 'Jo' } : item
      ),
    })),
  },
  // Paragraphs followed by more text: the space after a paragraph shows.
  absatzFolge: {
    locale: 'de-DE',
    slides: [
      {
        background: { kind: 'farbe', color: 'tanne' },
        position: 'mitte',
        align: 'links',
        items: [
          { type: 'headline', lines: ['Darum'] },
          { type: 'absatz', text: 'Weil es stimmt.' },
          { type: 'absatz', text: 'Und weil es günstig ist.' },
          { type: 'text', text: 'Komm vorbei.' },
        ],
        logo: false,
      },
    ],
  },
};
// Ground sweep: every slide with an ink that depends on its ground (topic
// badges, the ghost numeral, countdown digits, hand marks), set again on a
// light, a grass-green and a dark plain colour. No shared fixture puts these
// on every ground.
const GROUND_DEPENDENT =
  /"stil":"countdown"|"nummer":"geist"|"type":"(?:iconliste|infografik)"|\(\(|__/;
const sweepSlides = Object.values({ ...SPECS, ...MORE_SPECS }).flatMap((spec) =>
  spec.slides.filter((slide) => GROUND_DEPENDENT.test(JSON.stringify(slide)))
);
for (const color of ['weiss', 'grasgruen', 'tanne'] as const) {
  GOLDEN_ONLY[`grund-${color}`] = {
    locale: 'de-DE',
    slides: sweepSlides.map((slide) => ({ ...slide, background: { kind: 'farbe', color } })),
  };
}
const FIXTURES: Record<string, SharepicSpec> = { ...SPECS, ...MORE_SPECS, ...GOLDEN_ONLY };

describe('composer golden', () => {
  for (const [name, spec] of Object.entries(FIXTURES)) {
    const locales = spec.locale === 'de-AT' ? ['de-AT', 'de-DE'] : ['de-DE', 'de-AT'];
    for (const locale of locales) {
      it(`${name} as ${locale}`, async () => {
        const page = composeSharepic({ ...spec, locale } as SharepicSpec, options);
        await expect(`${JSON.stringify(page, null, 1)}\n`).toMatchFileSnapshot(
          `__golden__/${name}.${locale}.json`
        );
      });
    }
  }
});
