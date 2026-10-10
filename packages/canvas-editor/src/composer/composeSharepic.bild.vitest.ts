import {
  sharepicSpecSchema,
  slidePhotoFilename,
  type SharepicItem,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { tintRamp } from '../utils/imageFilters';
import { coverCrop, CROP_PRESETS, cropPresetUpdate } from '../utils/userImageUtils';

import { composeSharepic } from './composeSharepic';
import { slideProvenance } from './sharepicProvenance';
import { bild, bildAt, farbe, options } from './sharepicSpecFixtures';

const one = (spec: SharepicSpec, k: number): SharepicSpec => ({
  ...spec,
  slides: [spec.slides[k]!],
});
const composed = (spec: SharepicSpec, k = 0) => composeSharepic(one(spec, k), options).slides[0]!;
const photoOf = (slide: ReturnType<typeof composed>) =>
  slide.userImageInstances.find((u) => u.id.endsWith('-bild'))!;
const textBottom = (slide: ReturnType<typeof composed>) =>
  Math.max(
    ...slide.additionalTexts
      .filter((t) => !t.id.startsWith('sc-ki'))
      .map((t) => t.y + (t.fontSize ?? 0) * 1.1)
  );
const textTop = (slide: ReturnType<typeof composed>) =>
  Math.min(...slide.additionalTexts.filter((t) => !t.id.startsWith('sc-ki')).map((t) => t.y));

describe('bild item — schema', () => {
  it('accepts the fixtures in both locales', () => {
    expect(sharepicSpecSchema.safeParse(bild).success).toBe(true);
    expect(sharepicSpecSchema.safeParse(bildAt).success).toBe(true);
  });

  const withItems = (items: SharepicSpec['slides'][number]['items']): SharepicSpec => ({
    locale: 'de-DE',
    slides: [farbe('tanne', items)],
  });
  const photo = {
    type: 'bild',
    quelle: 'wind.jpg',
    ausschnitt: 'karte',
    filter: 'original',
  } as const;
  const headline: SharepicItem = { type: 'headline', lines: ['Mehr Wind'] };

  it('takes the same sources as a background: stock file, own photo, painted ref', () => {
    for (const quelle of ['wind.jpg', 'upload:2', 'ki:abcdefghijklmnop']) {
      expect(
        sharepicSpecSchema.safeParse(withItems([headline, { ...photo, quelle }])).success
      ).toBe(true);
    }
    expect(
      sharepicSpecSchema.safeParse(
        withItems([headline, { ...photo, quelle: 'https://x.de/a.jpg' }])
      ).success
    ).toBe(false);
  });

  it('allows one per slide, on a colour, beside text only', () => {
    expect(sharepicSpecSchema.safeParse(withItems([headline, photo, photo])).success).toBe(false);
    expect(sharepicSpecSchema.safeParse(withItems([photo])).success).toBe(false);
    expect(
      sharepicSpecSchema.safeParse(
        withItems([headline, photo, { type: 'liste', items: ['Eins', 'Zwei'] }])
      ).success
    ).toBe(false);
    const onPhoto: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        {
          ...farbe('tanne', [headline, photo]),
          background: { kind: 'foto', filename: 'a.jpg', textSeite: 'unten' },
        },
      ],
    };
    expect(sharepicSpecSchema.safeParse(onPhoto).success).toBe(false);
  });

  it('carries a cut-out only when freigestellt', () => {
    const cut = { freisteller: 'ki:abcdefghijklmnop' };
    expect(
      sharepicSpecSchema.safeParse(
        withItems([headline, { ...photo, ausschnitt: 'freigestellt', ...cut }])
      ).success
    ).toBe(true);
    expect(sharepicSpecSchema.safeParse(withItems([headline, { ...photo, ...cut }])).success).toBe(
      false
    );
  });

  it('names the photo a colour slide credits', () => {
    expect(slidePhotoFilename(bild.slides[0]!)).toBe('wind.jpg');
    expect(slidePhotoFilename(farbe('tanne', [headline]))).toBeNull();
  });
});

describe('bild item — composer', () => {
  it('lays a strip across the bottom third, the text above it', () => {
    const slide = composed(bild, 0);
    const p = photoOf(slide);
    expect(p).toMatchObject({ x: 0, width: 1080, fit: 'cover', tintStrength: 1, tint: '#008939' });
    expect(p.y).toBe(Math.round((1350 * 2) / 3));
    expect(p.y + p.height).toBe(1350);
    expect(textBottom(slide)).toBeLessThan(p.y);
  });

  it('lays a strip across the top third, the text below it', () => {
    const slide = composed(bild, 1);
    const p = photoOf(slide);
    expect(p).toMatchObject({ x: 0, y: 0, height: 450, grayscale: true });
    expect(p.tintStrength).toBeUndefined();
    expect(textTop(slide)).toBeGreaterThan(p.height);
  });

  it('sets a photo on a white card above the footer', () => {
    const slide = composed(bild, 2);
    const p = photoOf(slide);
    const card = slide.shapeInstances.find((s) => s.id === `${p.id}-karte`)!;
    expect(card.fill).toBe('#FFFFFF');
    expect(card.x - card.width / 2).toBeLessThan(p.x);
    expect(card.y + card.height / 2).toBeGreaterThan(p.y + p.height);
    expect(textBottom(slide)).toBeLessThan(card.y - card.height / 2);
    expect(p.tintStrength).toBeUndefined();
    expect(p.grayscale).toBeUndefined();
  });

  it('sets a round photo as a square with a circle mask', () => {
    const p = photoOf(composed(bild, 3));
    expect(p.mask).toBe('kreis');
    expect(p.width).toBe(p.height);
    expect(p.x + p.width / 2).toBe(540);
  });

  it('stands a cut-out on the bottom edge and loads the cut-out once there is one', () => {
    const plain = photoOf(composed(bild, 4));
    expect(plain.y + plain.height).toBe(1350);
    expect(plain.src).toBe(options.photoSrc('wind.jpg'));
    const withCut: SharepicSpec = {
      ...bild,
      slides: [
        {
          ...bild.slides[4]!,
          items: bild.slides[4]!.items.map((i) =>
            i.type === 'bild' ? { ...i, freisteller: 'ki:cutout-0000000001' } : i
          ),
        },
      ],
    };
    expect(photoOf(composed(withCut)).src).toBe(options.photoSrc('ki:cutout-0000000001'));
  });

  it('tints AT in its own green, and draws the photo under the text', () => {
    const slide = composed(bildAt, 0);
    const p = photoOf(slide);
    expect(p.tint).toBe('#56AF31');
    const order = slide.layerOrder;
    const firstText = order.findIndex((id) => slide.additionalTexts.some((t) => t.id === id));
    expect(order.indexOf(p.id)).toBeLessThan(firstText);
  });

  it('credits the photo of a colour slide', () => {
    const credit = { photographer: 'A', profileUrl: 'p', photoUrl: 'u' };
    const slide = composeSharepic(one(bild, 0), { ...options, attributions: [credit] }).slides[0]!;
    expect(slide.imageAttribution).toEqual(credit);
  });

  it('gives the photo and its card provenance on the item', () => {
    const spec = one(bild, 2);
    const prov = slideProvenance(spec.slides[0]!, composeSharepic(spec, options).slides[0]!);
    expect(prov['sc-2-bild']).toEqual({ kind: 'item', item: 2, lift: 'opaque' });
    expect(prov['sc-2-bild-karte']).toEqual({ kind: 'item', item: 2, lift: 'opaque' });
  });
});

describe('image tint and crop', () => {
  it('maps black to a dark shade, mid grey to the colour, white to a pale tone', () => {
    const ramp = tintRamp('#008939');
    const at = (l: number) => [...ramp.slice(l * 3, l * 3 + 3)];
    expect(at(0)).toEqual([0, 41, 17]);
    expect(at(128)).toEqual([1, 137, 58]);
    expect(at(255)).toEqual([204, 231, 215]);
  });

  it('crops the centred part that fills the frame', () => {
    expect(coverCrop({ width: 3000, height: 2000 }, { width: 1080, height: 360 })).toEqual({
      x: 0,
      y: 500,
      width: 3000,
      height: 1000,
    });
    expect(coverCrop({ width: 1000, height: 2000 }, { width: 500, height: 500 })).toEqual({
      x: 0,
      y: 500,
      width: 1000,
      height: 1000,
    });
  });

  it('turns a crop preset into a frame of the same width and centre', () => {
    const img = { y: 100, width: 300, height: 200 };
    const kreis = CROP_PRESETS.find((p) => p.id === 'kreis')!;
    expect(cropPresetUpdate(img, kreis, { width: 3000, height: 2000 })).toEqual({
      y: 50,
      height: 300,
      fit: 'cover',
      mask: 'kreis',
    });
    const original = CROP_PRESETS.find((p) => p.id === 'original')!;
    expect(cropPresetUpdate(img, original, { width: 1000, height: 1000 })).toEqual({
      y: 50,
      height: 300,
      fit: undefined,
      mask: undefined,
    });
  });
});
