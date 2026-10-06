import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/media/${f}`, measure };
const WIDTH = 1080;

const slide = (extra: Partial<SharepicSlide> = {}): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items: [{ type: 'absatz', text: 'Ein Satz, der etwas erklärt.' }],
  logo: false,
  ...extra,
});
const carousel = (
  locale: SharepicSpec['locale'],
  slides: SharepicSlide[],
  extra: Partial<SharepicSpec> = {}
): SharepicSpec => ({ locale, slides, ...extra });

const ids = (s: { layerOrder: string[] }) => s.layerOrder;

describe('composeSharepic — carousel frame', () => {
  it('puts the arrow on every slide but the last, and leaves it off when asked', () => {
    const slides = [slide(), slide(), slide()];
    const on = composeSharepic(carousel('de-DE', slides), options).slides;
    expect(on.map((s) => ids(s).includes('sc-pfeil'))).toEqual([true, true, false]);
    const off = composeSharepic(carousel('de-DE', slides, { pfeil: false }), options).slides;
    expect(off.every((s) => !ids(s).includes('sc-pfeil'))).toBe(true);
  });

  it.each(['de-DE', 'de-AT'] as const)(
    'sets the teaser left of the arrow, clear of the AI label (%s)',
    (locale) => {
      const spec = carousel(locale, [
        slide({ weiter: 'Wie stoppen wir das? Die Antwort →' }),
        slide(),
      ]);
      const first = composeSharepic(spec, options).slides[0]!;
      const weiter = first.additionalTexts.find((t) => t.id === 'sc-weiter')!;
      const label = first.additionalTexts.find((t) => t.id === 'sc-ki-label')!;
      expect(weiter.text.replace(/\n/g, ' ')).toBe('Wie stoppen wir das? Die Antwort →');
      expect(weiter.x + weiter.width).toBeLessThan(WIDTH);
      expect(weiter.x).toBeGreaterThan(label.x + label.width);
    }
  );

  it('numbers the pages in the corner or as a row of dots', () => {
    const slides = [slide(), slide(), slide()];
    const bruch = composeSharepic(carousel('de-AT', slides, { seitenzahl: 'bruch' }), options);
    expect(
      bruch.slides.map((s) => s.additionalTexts.find((t) => t.id === 'sc-seite')?.text)
    ).toEqual(['1/3', '2/3', '3/3']);
    const punkte = composeSharepic(carousel('de-AT', slides, { seitenzahl: 'punkte' }), options);
    const dots = punkte.slides[1]!.shapeInstances.filter((s) => s.id.startsWith('sc-seite-'));
    expect(dots).toHaveLength(3);
    expect(dots.map((d) => d.opacity)).toEqual([0.35, 1, 0.35]);
  });

  it('numbers nothing on a single image', () => {
    const one = composeSharepic(carousel('de-AT', [slide()], { seitenzahl: 'bruch' }), options);
    expect(ids(one.slides[0]!).some((id) => id.startsWith('sc-seite'))).toBe(false);
  });
});

describe('composeSharepic — aufruf', () => {
  const last = (
    aufruf: Extract<SharepicSlide['items'][number], { type: 'aufruf' }>,
    locale: SharepicSpec['locale'] = 'de-DE'
  ) => composeSharepic(carousel(locale, [slide(), slide({ items: [aufruf] })]), options).slides[1]!;

  it('sets a huge "!" over addressee and demand', () => {
    const s = last({
      type: 'aufruf',
      stil: 'ausruf',
      text: 'Hören Sie auf, beim Klimaschutz zu sparen.',
      adressat: 'Herr Merz',
    });
    const bang = s.additionalTexts.find((t) => t.text === '!')!;
    const adressat = s.additionalTexts.find((t) => t.text === 'Herr Merz')!;
    const demand = s.additionalTexts.find((t) => t.text.startsWith('Hören'))!;
    expect(bang.fontSize).toBeGreaterThan(demand.fontSize * 2);
    expect(bang.y).toBeLessThan(adressat.y);
    expect(adressat.y).toBeLessThan(demand.y);
  });

  it('closes a key sentence over the logo, centred, even without logo: true', () => {
    const s = last(
      { type: 'aufruf', stil: 'kernsatz', text: 'Klimaschutz ist ==Heimatschutz==.' },
      'de-AT'
    );
    expect(ids(s)).toContain('sc-logo');
    expect(s.additionalTexts.find((t) => t.text.startsWith('Klimaschutz'))!.align).toBe('center');
  });

  it('puts the hint as a pill under a petition', () => {
    const s = last({
      type: 'aufruf',
      stil: 'petition',
      text: 'Unterschreib jetzt!',
      hinweis: 'Link in der Bio',
    });
    const pill = s.pillBadgeInstances.find((p) => p.text === 'Link in der Bio')!;
    const call = s.additionalTexts.find((t) => t.text === 'Unterschreib jetzt!')!;
    expect(pill.y).toBeGreaterThan(call.y);
  });
});
