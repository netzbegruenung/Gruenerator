import { type SharepicItem, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';
import { SHAREPIC_ICON_FILLED, SHAREPIC_ICON_IDS, VERGLEICH_MARKER_IDS } from './sharepicIcons';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = {
  photoSrc: (f: string) => `/media/${f}`,
  measure,
};
const HEIGHT = 1350;

type Infografik = Extract<SharepicItem, { type: 'infografik' }>;
const REF = (k: number) => `ki:abcdefghijklmnop000${k}`;

const slideWith = (infografik: Infografik): SharepicSpec => ({
  locale: 'de-DE',
  slides: [
    {
      background: { kind: 'farbe', color: 'hellgrau' },
      position: 'oben',
      align: 'zentriert',
      items: [{ type: 'headline', lines: ['Nachhaltiger', 'leben'] }, infografik],
      logo: false,
    },
  ],
});
const compose = (infografik: Infografik) =>
  composeSharepic(slideWith(infografik), options).slides[0]!;

const tipps: Infografik['punkte'] = [
  { titel: 'Nimm das Rad', text: 'Kurze Wege ohne Abgase.', icon: 'fahrrad', bild: REF(1) },
  { titel: 'Eigener Becher', text: 'Spart Einwegbecher.', icon: 'essen', bild: REF(2) },
  { titel: 'Kleider tauschen', text: 'Weitergeben statt kaufen.', icon: 'einkauf', bild: REF(3) },
  { titel: 'Jutebeutel', text: 'Hält länger als Plastik.', icon: 'einkauf', bild: REF(4) },
];

describe('composeSharepic — infografik', () => {
  it('sets four points as a two-by-two grid of equal illustrations', () => {
    const slide = compose({ type: 'infografik', form: 'raster', punkte: tipps });
    const images = slide.userImageInstances;
    expect(images.map((i) => i.src)).toEqual(tipps.map((p) => `/media/${p.bild}`));
    expect(new Set(images.map((i) => i.width)).size).toBe(1);
    // Two columns, two rows.
    expect(new Set(images.map((i) => Math.round(i.x))).size).toBe(2);
    expect(new Set(images.map((i) => Math.round(i.y))).size).toBe(2);
    const titles = slide.additionalTexts.filter((t) => t.id.endsWith('-titel'));
    expect(titles.map((t) => t.text)).toEqual(tipps.map((p) => p.titel));
    // Every title sits below its illustration.
    titles.forEach((t, k) => expect(t.y).toBeGreaterThan(images[k]!.y + images[k]!.height - 1));
  });

  it('keeps every point on the canvas, even six with long texts', () => {
    const many = Array.from({ length: 6 }, (_, k) => ({
      titel: `Punkt Nummer ${k + 1}`,
      text: 'Ein etwas längerer Satz, der über zwei Zeilen läuft.',
      icon: 'klima' as const,
      bild: REF(k),
    }));
    const slide = compose({ type: 'infografik', form: 'raster', punkte: many });
    for (const img of slide.userImageInstances) {
      expect(img.x).toBeGreaterThanOrEqual(0);
      expect(img.x + img.width).toBeLessThanOrEqual(1080);
    }
    for (const t of slide.additionalTexts) expect(t.y).toBeLessThan(HEIGHT);
  });

  it('stands in an icon on a circle where no illustration was painted', () => {
    const slide = compose({
      type: 'infografik',
      form: 'raster',
      punkte: tipps.map(({ bild: _bild, ...p }) => p),
    });
    expect(slide.userImageInstances).toHaveLength(0);
    const icons = Object.values(slide.iconStates).map((s) => s.iconId);
    expect(icons).toEqual(tipps.map((p) => SHAREPIC_ICON_IDS[p.icon]));
    expect(slide.shapeInstances.filter((s) => s.id.endsWith('-badge'))).toHaveLength(4);
  });

  it('numbers the steps of an ablauf top to bottom on a line', () => {
    const slide = compose({ type: 'infografik', form: 'ablauf', punkte: tipps });
    const numbers = slide.additionalTexts.filter((t) => t.id.endsWith('-nummer'));
    expect(numbers.map((t) => t.text)).toEqual(['1', '2', '3', '4']);
    const ys = slide.userImageInstances.map((i) => i.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const line = slide.shapeInstances.find((s) => s.id.endsWith('-linie'));
    expect(line).toBeDefined();
    // The line runs under the circles.
    const order = slide.layerOrder;
    expect(order.indexOf(line!.id)).toBeLessThan(
      order.findIndex((id) => id.endsWith('-nummer-kreis'))
    );
  });

  it('sizes quantities by area and stands them on one ground line', () => {
    const slide = compose({
      type: 'infografik',
      form: 'mengen',
      punkte: [
        { titel: '3,36 Mio. t', text: 'Bau', icon: 'muell', bild: REF(1), wert: 4 },
        { titel: '0,84 Mio. t', text: 'Elektronik', icon: 'muell', bild: REF(2), wert: 1 },
      ],
    });
    const [big, small] = slide.userImageInstances;
    // Four times the value, four times the area: twice the side.
    expect(big!.width / small!.width).toBeCloseTo(2, 1);
    expect(big!.y + big!.height).toBeCloseTo(small!.y + small!.height, 5);
    const ground = slide.shapeInstances.find((s) => s.id.endsWith('-boden'))!;
    expect(ground.y - ground.height / 2).toBeCloseTo(big!.y + big!.height, 5);
  });

  it('lets a large quantity outgrow an even third beside small ones, without overlap', () => {
    const slide = compose({
      type: 'infografik',
      form: 'mengen',
      punkte: [
        { titel: '4 kg', text: 'Zug', icon: 'bahn', bild: REF(1), wert: 4 },
        { titel: '48 kg', text: 'Auto', icon: 'auto', bild: REF(1), wert: 48 },
        { titel: '85 kg', text: 'Flugzeug', icon: 'flugzeug', bild: REF(1), wert: 85 },
      ],
    });
    const images = slide.userImageInstances;
    const largest = images[2]!;
    expect(largest.width).toBeGreaterThan(1080 / 3);
    for (let k = 1; k < images.length; k++) {
      expect(images[k]!.x).toBeGreaterThanOrEqual(images[k - 1]!.x + images[k - 1]!.width);
    }
    expect(largest.x + largest.width).toBeLessThanOrEqual(1080);
  });
  it('counts a share as a row of pictograms, the part solid and the rest faint', () => {
    const slide = compose({
      type: 'infografik',
      form: 'anteil',
      punkte: [
        { titel: '9 von 10', text: 'wollen kein Mercosur', icon: 'person', wert: 9, von: 10 },
      ],
    });
    const units = Object.entries(slide.iconStates).filter(([key]) => key.includes('-einheit-'));
    expect(units).toHaveLength(10);
    expect(new Set(units.map(([, u]) => u.iconId))).toEqual(new Set([SHAREPIC_ICON_FILLED.person]));
    expect(units.filter(([, u]) => u.opacity === 1)).toHaveLength(9);
    // Two rows of five, inside the canvas, below the figure.
    expect(new Set(units.map(([, u]) => Math.round(u.y))).size).toBe(2);
    const title = slide.additionalTexts.find((t) => t.id.endsWith('-titel'))!;
    expect(title.text).toBe('9 von 10');
    for (const [, u] of units) {
      expect(u.x).toBeGreaterThan(0);
      expect(u.x).toBeLessThan(1080);
      expect(u.y).toBeGreaterThan(title.y);
    }
    expect(slide.userImageInstances).toHaveLength(0);
  });

  it('sets a percentage as a ten by ten grid', () => {
    const slide = compose({
      type: 'infografik',
      form: 'anteil',
      punkte: [{ titel: '37 %', text: 'der Gemeinden', icon: 'bus', wert: 37, von: 100 }],
    });
    const units = Object.values(slide.iconStates).filter(
      (u) => u.iconId === SHAREPIC_ICON_FILLED.bus
    );
    expect(units).toHaveLength(100);
    expect(new Set(units.map((u) => Math.round(u.y))).size).toBe(10);
    expect(units.filter((u) => u.opacity === 1)).toHaveLength(37);
    for (const u of units) expect(u.y).toBeLessThan(HEIGHT);
  });

  it('falls back to the outline where Tabler has no solid cut', () => {
    const slide = compose({
      type: 'infografik',
      form: 'anteil',
      punkte: [{ titel: '1 von 4', icon: 'wald', wert: 1, von: 4 }],
    });
    const ids = new Set(Object.values(slide.iconStates).map((u) => u.iconId));
    expect(ids).toEqual(new Set([SHAREPIC_ICON_IDS.wald]));
  });
  it('sets one figure huge under its illustration', () => {
    const slide = compose({
      type: 'infografik',
      form: 'zahl',
      punkte: [{ titel: '420 €', text: 'spart eine Familie im Jahr', icon: 'euro', bild: REF(1) }],
    });
    const [image] = slide.userImageInstances;
    const title = slide.additionalTexts.find((t) => t.id.endsWith('-titel'))!;
    expect(title.text).toBe('420 €');
    expect(title.y).toBeGreaterThan(image!.y + image!.height - 1);
    // Larger than any paragraph would be.
    expect(title.fontSize).toBeGreaterThan(90);
    expect(image!.x + image!.width / 2).toBeCloseTo(540, 0);
  });
});

describe('composeSharepic — faktencheck', () => {
  const factCheck = (
    paare: { mythos: string; fakt: string }[],
    locale: 'de-DE' | 'de-AT' = 'de-DE'
  ) =>
    composeSharepic(
      {
        locale,
        slides: [
          {
            background: { kind: 'farbe', color: locale === 'de-AT' ? 'weiss' : 'hellgrau' },
            position: 'mitte',
            align: 'links',
            items: [
              { type: 'headline', lines: ['Faktencheck', 'Heizung'] },
              { type: 'faktencheck', paare },
            ],
            logo: false,
          },
        ],
      },
      options
    ).slides[0]!;

  it('stands each claim above its correction, marked ✗ and ✓', () => {
    const slide = factCheck([
      {
        mythos: 'Ab 2024 muss jede Heizung raus.',
        fakt: 'Funktionierende Heizungen dürfen weiterlaufen.',
      },
      {
        mythos: 'Wärmepumpen gehen nur im Neubau.',
        fakt: 'Sie heizen auch die meisten Altbauten.',
      },
    ]);
    const texts = slide.additionalTexts.filter((t) => t.id.endsWith('-text'));
    expect(texts.map((t) => t.text)).toEqual([
      'Ab 2024 muss jede Heizung raus.',
      'Funktionierende Heizungen dürfen weiterlaufen.',
      'Wärmepumpen gehen nur im Neubau.',
      'Sie heizen auch die meisten Altbauten.',
    ]);
    // Read top to bottom, each card below the last.
    const ys = texts.map((t) => t.y);
    expect([...ys].sort((a, b) => a - b)).toEqual(ys);
    const labels = slide.additionalTexts
      .filter((t) => /-(mythos|fakt)-label$/.test(t.id))
      .map((t) => t.text);
    expect(labels).toEqual(['Mythos', 'Fakt', 'Mythos', 'Fakt']);
    const markers = Object.entries(slide.iconStates)
      .filter(([key]) => key.endsWith('-marker'))
      .map(([, m]) => m.iconId);
    expect(markers).toEqual([
      VERGLEICH_MARKER_IDS.links,
      VERGLEICH_MARKER_IDS.rechts,
      VERGLEICH_MARKER_IDS.links,
      VERGLEICH_MARKER_IDS.rechts,
    ]);
    for (const t of texts) expect(t.y).toBeLessThan(HEIGHT);
  });

  it('fits three pairs on an Austrian slide', () => {
    const slide = factCheck(
      Array.from({ length: 3 }, (_, k) => ({
        mythos: `Behauptung Nummer ${k + 1}, die sich hartnäckig hält und weitergesagt wird.`,
        fakt: `Richtigstellung Nummer ${k + 1}, kurz und mit dem, was wirklich gilt.`,
      })),
      'de-AT'
    );
    const cards = slide.shapeInstances.filter((s) => s.id.endsWith('-card'));
    expect(cards).toHaveLength(6);
    for (const c of cards) expect(c.y + c.height / 2).toBeLessThanOrEqual(HEIGHT);
  });
});
