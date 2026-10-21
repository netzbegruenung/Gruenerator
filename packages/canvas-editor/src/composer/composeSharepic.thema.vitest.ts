/**
 * Themed sharepics (`thema: 'queer' | 'frauen'`): the theme unlocks its
 * grounds and recolours accent, marker, badges, charts, dates and figures,
 * while layout and type stay the locale's CD.
 */
import {
  SHAREPIC_LOCALE_COLORS,
  sharepicColorsFor,
  sharepicSpecSchema,
  type SharepicItem,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { PRIDE_FLAG_ASSET, SHAREPIC_COLOR_HEX, THEMA_INK } from './chromeParts';
import { composeSharepic, type ComposedSlide } from './composeSharepic';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };

type Locale = SharepicSpec['locale'];

const slide = (background: SharepicSlide['background'], items: SharepicItem[]): SharepicSlide => ({
  background,
  position: 'oben',
  align: 'links',
  logo: true,
  items,
});

const spec = (
  locale: Locale,
  thema: SharepicSpec['thema'],
  ...slides: SharepicSlide[]
): SharepicSpec => ({ locale, ...(thema ? { thema } : {}), slides });

const compose = (s: SharepicSpec): ComposedSlide[] =>
  composeSharepic(sharepicSpecSchema.parse(s), options).slides;

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

const headline: SharepicItem = { type: 'headline', lines: ['Gleicher ==Lohn==.'] };
const termine: SharepicItem = {
  type: 'termine',
  eintraege: ['5.6.', '12.6.', '19.6.', '26.6.', '3.7.', '10.7.'].map((datum, k) => ({
    datum,
    titel: `CSD Ort ${k + 1}`,
  })),
};

describe.each<Locale>(['de-DE', 'de-AT'])('themed grounds (%s)', (locale) => {
  it('belong to their theme only', () => {
    const lila = slide({ kind: 'farbe', color: 'lila' }, [headline]);
    expect(sharepicSpecSchema.safeParse(spec(locale, 'frauen', lila)).success).toBe(true);
    const plain = sharepicSpecSchema.safeParse(spec(locale, undefined, lila));
    expect(plain.success).toBe(false);
    expect(JSON.stringify(plain.error?.issues)).toContain('thema \\"frauen\\"');
    expect(sharepicSpecSchema.safeParse(spec(locale, 'queer', lila)).success).toBe(false);
    const panel = slide({ kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'violett' }, [
      headline,
    ]);
    expect(sharepicSpecSchema.safeParse(spec(locale, 'queer', panel)).success).toBe(true);
  });

  it('stay out of the plain palette', () => {
    expect(sharepicColorsFor(locale)).toEqual(SHAREPIC_LOCALE_COLORS[locale]);
    expect(sharepicColorsFor(locale, 'queer')).toEqual([
      ...SHAREPIC_LOCALE_COLORS[locale],
      'violett',
      'pride',
    ]);
  });
});

describe('frauen', () => {
  it('sets the accent lila on light ground and flieder on lila', () => {
    const [light, dark] = compose(
      spec(
        'de-DE',
        'frauen',
        slide({ kind: 'farbe', color: 'mint' }, [headline]),
        slide({ kind: 'farbe', color: 'lila' }, [headline])
      )
    );
    expect(light!.additionalTexts[0]!.accent?.fill).toBe(SHAREPIC_COLOR_HEX.lila);
    expect(dark!.additionalTexts[0]!.accent?.fill).toBe(SHAREPIC_COLOR_HEX.flieder);
    expect(contrast(SHAREPIC_COLOR_HEX.lila, SHAREPIC_COLOR_HEX.mint)).toBeGreaterThanOrEqual(4.5);
    expect(contrast(SHAREPIC_COLOR_HEX.flieder, SHAREPIC_COLOR_HEX.lila)).toBeGreaterThanOrEqual(
      4.5
    );
  });

  it('boxes a DE marker in flieder with deep purple ink', () => {
    const [s] = compose(
      spec(
        'de-DE',
        'frauen',
        slide({ kind: 'farbe', color: 'lila' }, [
          { type: 'headline', lines: ['Wir sind ++laut++.'] },
        ])
      )
    );
    const { marker } = s!.additionalTexts[0]!;
    expect(marker).toMatchObject({ fill: SHAREPIC_COLOR_HEX.flieder, color: THEMA_INK.lilaDunkel });
    expect(contrast(THEMA_INK.lilaDunkel, SHAREPIC_COLOR_HEX.flieder)).toBeGreaterThanOrEqual(4.5);
  });

  it('draws a chart lila first', () => {
    const [s] = compose(
      spec(
        'de-AT',
        'frauen',
        slide({ kind: 'farbe', color: 'weiss' }, [
          { type: 'headline', lines: ['Frauen im Nationalrat'] },
          {
            type: 'diagramm',
            art: 'donut',
            einheit: '%',
            werte: [{ name: 'Frauen', wert: 36 }],
          },
        ])
      )
    );
    expect(s!.chartInstances[0]!.colors?.[0]).toBe(SHAREPIC_COLOR_HEX.lila);
  });
});

describe('queer', () => {
  it('sets the DE accent in flag yellow on dark ground, Klee on light', () => {
    const [dark, light] = compose(
      spec(
        'de-DE',
        'queer',
        slide({ kind: 'farbe', color: 'violett' }, [headline]),
        slide({ kind: 'farbe', color: 'weiss' }, [headline])
      )
    );
    expect(dark!.additionalTexts[0]!.accent?.fill).toBe(THEMA_INK.flaggenGelb);
    expect(light!.additionalTexts[0]!.accent?.fill).toBe('#008939');
  });

  it('sets every date row in a flag pill with ink that holds 4.5:1', () => {
    for (const locale of ['de-DE', 'de-AT'] as const) {
      const [s] = compose(
        spec(locale, 'queer', slide({ kind: 'farbe', color: 'violett' }, [termine]))
      );
      const pills = s!.shapeInstances.filter((p) => p.id.endsWith('-pill'));
      expect(pills.map((p) => p.fill)).toEqual(THEMA_INK.regenbogen);
      pills.forEach((pill, k) => {
        for (const part of ['datum', 'titel']) {
          const t = s!.additionalTexts.find((x) => x.id.endsWith(`-${k}-${part}`))!;
          expect(contrast(t.fill!, pill.fill), `${locale} row ${k} ${part}`).toBeGreaterThanOrEqual(
            4.5
          );
        }
      });
    }
  });

  it('keeps plain dates without pills', () => {
    const [s] = compose(
      spec('de-DE', undefined, slide({ kind: 'farbe', color: 'tanne' }, [termine]))
    );
    expect(s!.shapeInstances.some((p) => p.id.endsWith('-pill'))).toBe(false);
    expect(s!.assetInstances.some((a) => a.assetId === PRIDE_FLAG_ASSET)).toBe(false);
  });

  it('puts the Progress Pride flag on the footer line, clear of the logo', () => {
    const [s] = compose(
      spec('de-DE', 'queer', slide({ kind: 'farbe', color: 'pride' }, [headline]))
    );
    const flag = s!.assetInstances.find((a) => a.assetId === PRIDE_FLAG_ASSET)!;
    const logo = s!.assetInstances.find((a) => a.id === 'sc-logo')!;
    expect(flag.y).toBe(logo.y);
    expect(flag.x).toBeGreaterThan(540);
  });

  it('paints the pride ground as a gradient white text holds on', () => {
    const [s] = compose(
      spec('de-DE', 'queer', slide({ kind: 'farbe', color: 'pride' }, [headline]))
    );
    const plane = s!.shapeInstances.find((p) => p.id === 'sc-bg')!;
    const stops = plane.fillGradient!.stops.map((x) => x.color);
    expect(stops.length).toBeGreaterThan(2);
    for (const stop of stops) expect(contrast('#FFFFFF', stop), stop).toBeGreaterThanOrEqual(4.5);
  });

  it('runs a big figure through the flag', () => {
    const [s] = compose(
      spec(
        'de-DE',
        'queer',
        slide({ kind: 'farbe', color: 'dunkeltanne' }, [
          { type: 'zahl', stil: 'stapel', wert: '1.765', label: 'queerfeindliche Straftaten' },
        ])
      )
    );
    const wert = s!.additionalTexts.find((t) => t.id.endsWith('-wert'))!;
    expect(wert.fillGradient?.stops.length).toBe(6);
  });
});
