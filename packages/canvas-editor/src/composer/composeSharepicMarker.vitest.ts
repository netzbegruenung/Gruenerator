/**
 * `++Textmarker++`: DE sets a box behind the passage (white, mint on a white
 * slide), AT has no marker boxes and reads `++` as the yellow `==accent==`.
 */
import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { composeSharepic, largestSizeWordsFit, SHAREPIC_COLOR_HEX } from './composeSharepic';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };

const slideOf = (
  items: SharepicSlide['items'],
  background: SharepicSlide['background'] = { kind: 'farbe', color: 'tanne' }
): SharepicSlide => ({ background, position: 'mitte', align: 'links', items, logo: false });
const compose = (locale: SharepicSpec['locale'], slide: SharepicSlide) =>
  composeSharepic({ locale, slides: [slide] }, options).slides[0]!;
const byId = <T extends { id: string }>(texts: T[], suffix: string) =>
  texts.find((t) => t.id.endsWith(suffix));

const QUOTE: SharepicSlide['items'] = [
  {
    type: 'zitat',
    text: 'Wir bauen ++Wohnungen für alle++ und lassen niemanden zurück.',
    name: 'A B',
  },
];

/** The DE marker lime of the posts. */
const LIME = '#BEFF60';

describe('composeSharepic — ++marker++', () => {
  it('DE: gives the text a marker style, dark ink in a white box on dark ground and photos', () => {
    for (const bg of [
      { kind: 'farbe', color: 'tanne' } as const,
      { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' } as const,
    ]) {
      const quote = byId(compose('de-DE', slideOf(QUOTE, bg)).additionalTexts, '-zitat');
      expect(quote?.text).toContain('++Wohnungen für alle++');
      expect(quote?.marker).toMatchObject({
        fill: '#FFFFFF',
        color: SHAREPIC_COLOR_HEX.dunkeltanne,
      });
    }
  });

  it('DE: keeps the space beside a mid-line box visible', () => {
    const quote = byId(
      compose('de-DE', slideOf(QUOTE, { kind: 'farbe', color: 'tanne' })).additionalTexts,
      '-zitat'
    );
    // Less overhang than a space is wide (~0.25 em): the box never touches the word before.
    expect(quote?.marker?.padX).toBeLessThan(0.15);
  });

  it('DE: lime box on light ground, as the posts lay it (white, grey, mint)', () => {
    const on = (color: 'weiss' | 'mint' | 'hellgrau') =>
      byId(compose('de-DE', slideOf(QUOTE, { kind: 'farbe', color })).additionalTexts, '-zitat')
        ?.marker?.fill;
    for (const color of ['weiss', 'mint', 'hellgrau'] as const) expect(on(color)).toBe(LIME);
  });

  it('DE: lets a headline carry a marker on the number', () => {
    const props = compose(
      'de-DE',
      slideOf([{ type: 'headline', lines: ['Reiche vernichten', '++186.600++ Jobs'] }], {
        kind: 'farbe',
        color: 'weiss',
      })
    );
    const headline = props.additionalTexts.find((t) => t.text.includes('++186.600++'));
    expect(headline?.marker?.fill).toBe(LIME);
  });

  it('AT: has no marker style and sets the passage as an accent instead', () => {
    const theme = getBrandTheme('de-AT');
    const props = compose('de-AT', slideOf(QUOTE, { kind: 'farbe', color: 'dunkelgruen' }));
    const quote = byId(props.additionalTexts, '-zitat');
    expect(quote?.marker).toBeUndefined();
    expect(quote?.text).toBe('Wir bauen ==Wohnungen für alle== und lassen niemanden zurück.');
    expect(quote?.accent?.fontFamily).toBe(theme.fonts.quoteEmphasis);
  });

  it('measures a quote without the marks, so they add no line', () => {
    const run = (text: string) => compose('de-DE', slideOf([{ type: 'zitat', text, name: 'A B' }]));
    const gap = (p: ReturnType<typeof run>) =>
      byId(p.additionalTexts, '-name')!.y - byId(p.additionalTexts, '-zitat')!.y;
    // Sweep the length: somewhere the four mark characters would tip a line over.
    for (let words = 6; words <= 40; words++) {
      const body = Array.from({ length: words }, (_, i) => `wort${i % 10}`).join(' ');
      const marked = body.replace('wort1 wort2', '++wort1 wort2++');
      expect(gap(run(marked))).toBe(gap(run(body)));
    }
  });
});

describe('largestSizeWordsFit', () => {
  it('measures a marked word without its ++', () => {
    const fit = (text: string) =>
      largestSizeWordsFit([text], 60, 400, 0, (w, s) => w.length * s * 0.5);
    expect(fit('Die ++Wohnungsbau++ kommt')).toBe(fit('Die Wohnungsbau kommt'));
  });
});
