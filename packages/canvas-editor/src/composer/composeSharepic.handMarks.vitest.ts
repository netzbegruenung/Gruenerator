/**
 * `((Wort))` and `__Wort__`: a hand-drawn circle or underline shape over the
 * composed words, in AT yellow / DE white on dark ground and green on light;
 * the text itself shows the words without the marks.
 */
import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';
import { handDrawnPath } from '../utils/handDrawn';

import { composeSharepic } from './composeSharepic';

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };

const slideOf = (
  items: SharepicSlide['items'],
  background: SharepicSlide['background'] = { kind: 'farbe', color: 'dunkelgruen' }
): SharepicSlide => ({ background, position: 'mitte', align: 'links', items, logo: false });
const compose = (locale: SharepicSpec['locale'], slide: SharepicSlide) =>
  composeSharepic({ locale, slides: [slide] }, options).slides[0]!;
const handShapes = (slide: ReturnType<typeof compose>) =>
  slide.shapeInstances.filter((s) => s.type.startsWith('hand-'));

describe('composeSharepic — hand marks', () => {
  it('circles a word: a hand-kreis round its box, the text without marks', () => {
    const slide = compose('de-AT', slideOf([{ type: 'absatz', text: 'Achte auf ((Pausen)):' }]));
    const text = slide.additionalTexts.find((t) => t.id.endsWith('-absatz'))!;
    expect(text.text).toBe('Achte auf Pausen:');
    const [kreis, ...rest] = handShapes(slide);
    expect(rest).toEqual([]);
    expect(kreis).toMatchObject({ type: 'hand-kreis', fill: getBrandTheme('de-AT').colors.accent });
    // Monospace stand-in: the line wraps after "Achte auf", "Pausen" opens the second line.
    const char = text.fontSize * 0.5;
    const line = text.fontSize * (text.lineHeight ?? 1.2);
    expect(kreis!.x).toBeCloseTo(text.x + 3 * char, 0);
    expect(kreis!.width).toBeGreaterThan(6 * char);
    expect(kreis!.height).toBeGreaterThan(text.fontSize);
    expect(kreis!.y).toBeGreaterThan(text.y + line);
    expect(kreis!.y).toBeLessThan(text.y + 2 * line);
    // Under the text, so the words stay on top.
    expect(slide.layerOrder.indexOf(kreis!.id)).toBeLessThan(slide.layerOrder.indexOf(text.id));
  });

  it('underlines with __…__ instead of setting it bold', () => {
    const slide = compose('de-AT', slideOf([{ type: 'absatz', text: '__Herbert sagt:__ los' }]));
    const text = slide.additionalTexts.find((t) => t.id.endsWith('-absatz'))!;
    expect(text.text).toBe('Herbert sagt: los');
    const [strich] = handShapes(slide);
    expect(strich).toMatchObject({ type: 'hand-unterstrich' });
    const char = text.fontSize * 0.5;
    expect(strich!.x).toBeCloseTo(text.x + 6.5 * char, 0);
    // Below the middle of the line: under the letters.
    expect(strich!.y).toBeGreaterThan(text.y + (text.fontSize * (text.lineHeight ?? 1.2)) / 2);
  });

  it('marks headline lines, and measures them without the marks', () => {
    const plain = compose('de-AT', slideOf([{ type: 'headline', lines: ['Die Lösung?'] }]));
    const marked = compose('de-AT', slideOf([{ type: 'headline', lines: ['Die ((Lösung?))'] }]));
    const head = (s: typeof plain) => s.additionalTexts.find((t) => t.id.includes('-headline'))!;
    expect(head(marked).text).toBe(head(plain).text);
    expect(head(marked).fontSize).toBe(head(plain).fontSize);
    expect(handShapes(marked)).toHaveLength(1);
  });

  it('picks the ink per ground in both locales', () => {
    const ink = (locale: SharepicSpec['locale'], color: 'tanne' | 'weiss' | 'dunkelgruen') =>
      handShapes(
        compose(
          locale,
          slideOf([{ type: 'text', text: 'Das ((ist)) es' }], { kind: 'farbe', color })
        )
      )[0]?.fill;
    expect(ink('de-AT', 'dunkelgruen')).toBe(getBrandTheme('de-AT').colors.accent);
    expect(ink('de-AT', 'weiss')).toBe(getBrandTheme('de-AT').colors.accentOnLight);
    expect(ink('de-DE', 'tanne')).toBe('#FFFFFF');
    expect(ink('de-DE', 'weiss')).not.toBe('#FFFFFF');
    const onPhoto = compose(
      'de-AT',
      slideOf([{ type: 'absatz', text: '((5 Fakten,)) die zählen' }], {
        kind: 'foto',
        filename: 'wind.jpg',
        textSeite: 'unten',
      })
    );
    expect(handShapes(onPhoto)[0]?.fill).toBe(getBrandTheme('de-AT').colors.accent);
  });

  it('draws at most two marks per slide and leaves other texts alone', () => {
    const slide = compose(
      'de-DE',
      slideOf(
        [
          { type: 'headline', lines: ['((Eins))', '((Zwei))'] },
          { type: 'absatz', text: '__Drei__ und snake__case' },
        ],
        { kind: 'farbe', color: 'tanne' }
      )
    );
    expect(handShapes(slide)).toHaveLength(2);
    expect(slide.additionalTexts.map((t) => t.text).join(' ')).not.toMatch(/[\u2061-\u2064]/);
    expect(slide.additionalTexts.find((t) => t.id.endsWith('-absatz'))!.text).toBe(
      'Drei und snake__case'
    );
  });

  it('a text without marks composes exactly as before', () => {
    const items: SharepicSlide['items'] = [{ type: 'absatz', text: 'Achte auf Pausen (bitte).' }];
    const slide = compose('de-AT', slideOf(items));
    expect(handShapes(slide)).toEqual([]);
    expect(slide.additionalTexts[0]!.text).toBe('Achte auf Pausen (bitte).');
  });
});

describe('handDrawnPath', () => {
  it('keeps every hand shape inside its box, whatever the aspect', () => {
    for (const type of ['hand-kreis', 'hand-unterstrich', 'hand-pfeil', 'hand-ausruf'] as const) {
      for (const [w, h] of [
        [400, 120],
        [120, 400],
        [300, 30],
      ] as const) {
        const coords = handDrawnPath(type, w, h, 8)
          .split(/[MLZ]/)
          .filter(Boolean)
          .map((p) => p.split(',').map(Number));
        for (const [x, y] of coords) {
          expect(Math.abs(x!)).toBeLessThanOrEqual(w / 2 + 1);
          expect(Math.abs(y!)).toBeLessThanOrEqual(h / 2 + 1);
        }
      }
    }
  });
});
