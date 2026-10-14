import { type SharepicSlide, type SharepicSpec, sharepicSpecSchema } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { applySharepicTweaks, sharepicTweaks } from './sharepicTweaks';

const slide = (
  items: SharepicSlide['items'],
  extra: Partial<SharepicSlide> = {}
): SharepicSlide => ({
  background: { kind: 'farbe', color: 'mint' },
  position: 'oben',
  align: 'links',
  items,
  logo: false,
  ...extra,
});

const grund = (n: number) =>
  slide([
    { type: 'headline', lines: [`Grund ${n}`] },
    { type: 'absatz', text: 'Weil es stimmt.' },
  ]);

/** "3 Gründe": cover, intro, three points, the call. */
const carousel: SharepicSpec = {
  locale: 'de-DE',
  slides: [
    slide([{ type: 'headline', lines: ['Mehr Radwege'] }], {
      background: { kind: 'farbe', color: 'dunkeltanne' },
    }),
    slide(
      [
        { type: 'dachzeile', text: 'Warum?' },
        { type: 'absatz', text: 'Drei Gründe.' },
      ],
      { weiter: 'Denn' }
    ),
    grund(1),
    grund(2),
    grund(3),
    slide(
      [{ type: 'aufruf', stil: 'ausruf', text: 'Unterschreibt!', hinweis: 'Link in der Bio' }],
      { background: { kind: 'farbe', color: 'grasgruen' } }
    ),
  ],
};

const single = (
  items: SharepicSlide['items'],
  locale: SharepicSpec['locale'] = 'de-DE'
): SharepicSpec => ({
  locale,
  slides: [
    slide(items, {
      background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
    }),
  ],
});

const ids = (spec: SharepicSpec) => sharepicTweaks(spec, {}).map((t) => t.id);
const tweak = (spec: SharepicSpec, id: string) =>
  sharepicTweaks(spec, {}).find((t) => t.id === id)!;

describe('sharepicTweaks', () => {
  it('offers only valid variations, for every axis of a carousel', () => {
    for (const t of sharepicTweaks(carousel, {})) {
      for (const o of t.options.filter((o) => !o.disabled)) {
        const spec = applySharepicTweaks(carousel, { [t.id]: o.value });
        expect(sharepicSpecSchema.safeParse(spec).success, `${t.id}=${o.value}`).toBe(true);
      }
    }
  });

  it('gives every option a short label', () => {
    const specs = [carousel, single([{ type: 'liste', items: ['Bus', 'Bahn'] }])];
    let seen = 0;
    for (const spec of specs) {
      for (const t of sharepicTweaks(spec, {})) {
        for (const o of t.options) {
          expect(o.short.length, `${t.id}=${o.value}`).toBeGreaterThan(0);
          seen++;
        }
      }
    }
    expect(seen).toBeGreaterThan(0);
    expect(
      tweak(carousel, 'navigation').options.find((o) => o.value === 'pfeil-bruch')?.short
    ).toBe('→ 2/5');
    expect(tweak(specs[1]!, 'liste').options.find((o) => o.value === 'ziffern')?.short).toBe('1.');
  });

  it('gives a carousel navigation and numbering, a single slide neither', () => {
    expect(ids(carousel)).toEqual(
      expect.arrayContaining(['farbe', 'zeilenboxen', 'navigation', 'nummer', 'aufruf'])
    );
    const one = single([{ type: 'liste', items: ['Bus', 'Bahn'] }]);
    expect(ids(one)).toEqual(['farbe', 'liste']);
  });

  it('drops the teaser without the arrow and brings it back with it', () => {
    const off = applySharepicTweaks(carousel, { navigation: 'bruch' });
    expect(off.pfeil).toBe(false);
    expect(off.seitenzahl).toBe('bruch');
    expect(off.slides.some((s) => s.weiter)).toBe(false);
    const back = applySharepicTweaks(carousel, { navigation: 'pfeil-punkte' });
    expect(back.slides[1]!.weiter).toBe('Denn');
    expect(back.pfeil).toBeUndefined();
  });

  it('numbers the points, not the intro or the call', () => {
    const spec = applySharepicTweaks(carousel, { nummer: 'gross' });
    expect(spec.slides.map((s) => s.nummer ?? null)).toEqual([
      null,
      null,
      'gross',
      'gross',
      'gross',
      null,
    ]);
  });

  it('does not offer numerals in a list beside a numbered slide', () => {
    const spec: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        slide([{ type: 'headline', lines: ['Zwei Punkte'] }]),
        slide([{ type: 'liste', items: ['a', 'b'] }], { nummer: 'gross' }),
        slide([{ type: 'liste', items: ['c', 'd'] }], { nummer: 'gross' }),
      ],
    };
    const ziffern = tweak(spec, 'liste').options.find((o) => o.value === 'ziffern')!;
    expect(ziffern.disabled).toBe(true);
    const after = sharepicTweaks(spec, { nummer: 'aus' }).find((t) => t.id === 'liste')!;
    expect(after.options.find((o) => o.value === 'ziffern')!.disabled).toBe(false);
  });

  it('alternates dark and light, and reads that back', () => {
    const spec = applySharepicTweaks(carousel, { farbe: 'wechsel' });
    expect(
      spec.slides.map((s) => (s.background.kind === 'farbe' ? s.background.color : null))
    ).toEqual(['dunkeltanne', 'mint', 'dunkeltanne', 'mint', 'dunkeltanne', 'mint']);
    expect(sharepicTweaks(carousel, { farbe: 'wechsel' })[0]!.value).toBe('wechsel');
    expect(tweak(carousel, 'farbe').value).toBeNull();
  });

  it('keeps an infographic on its light ground', () => {
    const spec: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        slide([{ type: 'headline', lines: ['Titel'] }]),
        slide(
          [
            {
              type: 'infografik',
              form: 'ablauf',
              punkte: [
                { titel: 'Eins', icon: 'haus' },
                { titel: 'Zwei', icon: 'bahn' },
              ],
            },
          ],
          { background: { kind: 'farbe', color: 'weiss' } }
        ),
      ],
    } as SharepicSpec;
    const dark = applySharepicTweaks(spec, { farbe: 'dunkeltanne' });
    expect(dark.slides[1]!.background).toEqual({ kind: 'farbe', color: 'weiss' });
    expect(sharepicSpecSchema.safeParse(dark).success).toBe(true);
  });

  it('gives AT its own palette and no line boxes', () => {
    const at = single([{ type: 'headline', lines: ['Hallo'] }], 'de-AT');
    expect(ids(at)).toEqual(['farbe']);
    expect(tweak(at, 'farbe').options.map((o) => o.value)).toEqual([
      'dunkelgruen',
      'hellgruen',
      'weiss',
    ]);
  });

  it('keeps a countdown to short whole numbers and a line to time series', () => {
    const zahl = single([{ type: 'zahl', stil: 'stapel', wert: '6,3 Mrd. €' }]);
    expect(tweak(zahl, 'zahl').options.find((o) => o.value === 'countdown')!.disabled).toBe(true);
    const chart = single([
      {
        type: 'diagramm',
        art: 'balken',
        werte: [
          { name: 'Bus', wert: 3 },
          { name: 'Bahn', wert: 5 },
        ],
      },
    ]);
    const art = tweak(chart, 'diagramm').options;
    expect(art.find((o) => o.value === 'linie')!.disabled).toBe(true);
    expect(art.find((o) => o.value === 'balken-quer')!.disabled).toBe(false);
  });

  it('offers a petition only with a hint to sign at', () => {
    const noHint = applySharepicTweaks(carousel, {});
    const without: SharepicSpec = {
      ...noHint,
      slides: noHint.slides.map((s) => ({
        ...s,
        items: s.items.map((i) =>
          i.type === 'aufruf' ? { type: 'aufruf', stil: 'ausruf', text: i.text } : i
        ),
      })),
    } as SharepicSpec;
    expect(tweak(without, 'aufruf').options.find((o) => o.value === 'petition')!.disabled).toBe(
      true
    );
    expect(tweak(carousel, 'aufruf').options.find((o) => o.value === 'petition')!.disabled).toBe(
      false
    );
  });
});
