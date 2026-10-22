/**
 * Every theme in `SHAREPIC_THEMES`, on light and dark ground, DE and AT: the
 * registry's pairs hold 4.5:1, and the slide's accent line, `++` marker,
 * badges and date circle actually carry the theme's colours.
 */
import {
  SHAREPIC_THEMA_COLORS,
  sharepicThemaSchema,
  type SharepicColor,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { EUROPA_ASSETS, inkOn, SHAREPIC_COLOR_HEX } from './chromeParts';
import { composeSharepic, type ComposedSlide } from './composeSharepic';
import { SHAREPIC_THEMES, type ThemeInkPair } from './sharepicThemes';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const items: SharepicItem[] = [
  { type: 'headline', lines: ['Wir sind ++laut++ und ==froh==', 'Gemeinsam'], akzent: 1 },
  {
    type: 'infografik',
    form: 'raster',
    punkte: [
      { titel: 'Rad', text: 'Kurze Wege.', icon: 'fahrrad' },
      { titel: 'Becher', text: 'Spart Müll.', icon: 'essen' },
    ],
  },
];

const compose = (
  locale: SharepicSpec['locale'],
  thema: SharepicSpec['thema'],
  background: SharepicSlide['background']
): ComposedSlide =>
  composeSharepic(
    {
      locale,
      ...(thema ? { thema } : {}),
      slides: [
        {
          background,
          position: 'oben',
          align: 'links',
          logo: true,
          items,
          datum: { weekday: 'Sa', date: '25.7.', time: '12 Uhr' },
        },
      ],
    },
    options
  ).slides[0]!;

/** A theme's own dark ground: the first of its colours that takes white ink. */
const darkGround = (thema: keyof typeof SHAREPIC_THEMES): SharepicColor =>
  SHAREPIC_THEMA_COLORS[thema].find((c) => !inkOn(c, 'de-DE').onLight)!;

const expectPair = (pair: ThemeInkPair, label: string) =>
  expect(contrast(pair.fill, pair.ink), label).toBeGreaterThanOrEqual(4.5);

describe.each(sharepicThemaSchema.options)('theme %s', (thema) => {
  const def = SHAREPIC_THEMES[thema];

  it('holds 4.5:1 for every pair it defines', () => {
    for (const side of ['light', 'dark'] as const) {
      expectPair(def.marker[side], `marker ${side}`);
      if (def.badge) expectPair(def.badge[side], `badge ${side}`);
    }
  });

  describe.each(['de-DE', 'de-AT'] as const)('%s', (locale) => {
    const brand = getBrandTheme(locale);
    const isAt = locale === 'de-AT';
    describe.each([
      ['light', 'weiss'],
      ['dark', darkGround(thema)],
    ] as const)('on %s ground (%s)', (side, ground) => {
      const s = compose(locale, thema, { kind: 'farbe', color: ground });
      const groundHex = SHAREPIC_COLOR_HEX[ground];
      const head = s.additionalTexts.find((t) => t.id.endsWith('-0') && t.accent)!;
      const accentLine = s.additionalTexts.find(
        (t) => t.id.endsWith('-1') && t.text === 'Gemeinsam'
      )!;

      it('sets the accent so it reads on the ground', () => {
        expect(contrast(head.accent!.fill, groundHex)).toBeGreaterThanOrEqual(4.5);
      });

      it('sets the accent line in the theme’s box (DE) or accent (AT)', () => {
        if (isAt) {
          const want =
            side === 'light'
              ? (def.atAccentOnLight ?? brand.colors.accentOnLight)
              : brand.colors.accent;
          expect(accentLine.fill).toBe(want);
          return;
        }
        const box = s.shapeInstances.find((p) => p.id === `${accentLine.id}-box`)!;
        expect(box.fill).toBe(def.marker[side].fill);
        expect(accentLine.fill).toBe(def.marker[side].ink);
      });

      it('boxes a `++` passage in the theme’s marker', () => {
        if (isAt) {
          expect(head.marker ?? null).toBeNull();
          return;
        }
        expect(head.marker).toMatchObject({
          fill: def.marker[side].fill,
          color: def.marker[side].ink,
        });
      });

      it('colours badges and the date circle like the theme’s badges', () => {
        const badge = s.shapeInstances.find((p) => p.id.endsWith('-badge'))!;
        const datum = s.circleBadgeInstances.find((c) => c.id === 'sc-datum')!;
        expect(datum).toBeDefined();
        if (!def.badge) return;
        expect(badge.fill).toBe(def.badge[side].fill);
        expect(datum.backgroundColor).toBe(def.badge[side].fill);
        expect(datum.textColor).toBe(def.badge[side].ink);
      });
    });
  });
});

describe('footer sign', () => {
  const headline: SharepicItem = { type: 'headline', lines: ['Europa'] };
  const signOf = (background: SharepicSlide['background'], datum = false) =>
    composeSharepic(
      {
        locale: 'de-DE',
        thema: 'europa',
        slides: [
          {
            background,
            position: 'oben',
            align: 'links',
            logo: true,
            items: [headline],
            ...(datum ? { datum: { weekday: 'Sa', date: '9.5.' } } : {}),
          },
        ],
      },
      options
    ).slides[0]!.assetInstances.find((a) => a.id === 'sc-europa')?.assetId;

  it('takes the ring of stars only where it stands on europablau', () => {
    expect(signOf({ kind: 'farbe', color: 'europablau' })).toBe(EUROPA_ASSETS.sterne);
    expect(signOf({ kind: 'foto-oben', filename: 'a.jpg', panelColor: 'europablau' })).toBe(
      EUROPA_ASSETS.sterne
    );
  });

  it('takes the flag on a photo, even under a europablau panel', () => {
    expect(signOf({ kind: 'foto', filename: 'a.jpg', textSeite: 'unten' })).toBe(
      EUROPA_ASSETS.flagge
    );
    // foto-unten: the footer stands on the photo.
    expect(signOf({ kind: 'foto-unten', filename: 'a.jpg', panelColor: 'europablau' })).toBe(
      EUROPA_ASSETS.flagge
    );
    // A date circle sends the sign to the top corner: the photo of foto-oben.
    expect(signOf({ kind: 'foto-oben', filename: 'a.jpg', panelColor: 'europablau' }, true)).toBe(
      EUROPA_ASSETS.flagge
    );
  });
});
