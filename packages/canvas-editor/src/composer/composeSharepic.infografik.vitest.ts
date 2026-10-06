import { type SharepicItem, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';
import { SHAREPIC_ICON_IDS } from './sharepicIcons';

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
});
