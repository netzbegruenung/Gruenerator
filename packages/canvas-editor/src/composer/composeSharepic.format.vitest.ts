/**
 * The creator's 3:4 format (1080 × 1440): every height-relative placement
 * follows the taller canvas, the footer stays on the bottom edge.
 */
import {
  sharepicFormatSchema,
  sharepicSpecSchema,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getCanvasFormat } from '../formats';
import { ASSET_TARGET_SIZE } from '../utils/canvasAssets';

import { composeSharepic, type ComposedSlide } from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };
const TALL = 1440;

type Locale = SharepicSpec['locale'];
type Box = { id: string; x: number; y: number; w: number; h: number };

const slide = (extra: Partial<SharepicSlide>): SharepicSlide => ({
  background: { kind: 'farbe', color: 'weiss' },
  position: 'unten',
  align: 'links',
  logo: true,
  items: [
    { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
    { type: 'text', text: 'Gemeinsam für Klimaschutz vor Ort.' },
  ],
  ...extra,
});

/** One carousel per locale that reaches every footer and panel path. */
const slides = (locale: Locale): SharepicSlide[] => {
  const color = locale === 'de-AT' ? 'dunkelgruen' : 'tanne';
  return [
    slide({ background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' } }),
    slide({ background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: color } }),
    slide({
      background: { kind: 'foto-unten', filename: 'wind.jpg', panelColor: color },
      position: 'oben',
    }),
    slide({
      background: { kind: 'farbe', color },
      align: 'zentriert',
      datum: { weekday: 'Di', date: '18.11.', time: '19 Uhr' },
      ort: { lines: ['Gasthaus Zur Post', 'Landstraße 12'] },
    }),
    slide({
      background: { kind: 'farbe', color },
      items: [
        { type: 'headline', lines: ['Unser Plan'] },
        {
          type: 'iconliste',
          zeilen: [
            { icon: 'bahn', text: 'Mehr Züge auf dem Land' },
            { icon: 'fahrrad', text: 'Sichere Radwege' },
          ],
        },
      ],
      quelle: 'Stadt Musterstadt',
    }),
    slide({
      background: { kind: 'farbe', color: 'weiss' },
      items: [
        { type: 'headline', lines: ['Zwei Pläne'] },
        {
          type: 'vergleich',
          links: { titel: 'Ihr Plan', punkte: ['Sprit kurz billiger', 'Kostet Milliarden'] },
          rechts: { titel: 'Unser Plan', punkte: ['Energiegeld für alle', 'Mehr Bus und Bahn'] },
        },
      ],
    }),
    slide({
      background: { kind: 'farbe', color },
      items: [
        { type: 'headline', lines: ['Mieten steigen'] },
        {
          type: 'diagramm',
          art: 'balken',
          werte: [
            { name: '2015', wert: 100 },
            { name: '2025', wert: 138 },
          ],
        },
      ],
      quelle: 'Stadt Musterstadt',
    }),
  ];
};

const compose = (locale: Locale, format?: SharepicSpec['format']) =>
  composeSharepic({ locale, ...(format ? { format } : {}), slides: slides(locale) }, options);

/** Height over width of the wide assets (their SVG/PNG sizes). */
const ASPECT: Record<string, number> = {
  'brush-arrow': 80 / 300,
  'gruene-at-logo': 1239 / 1410,
};

const boxes = (s: ComposedSlide): Box[] => [
  ...s.additionalTexts.map((t) => {
    const rows = t.text
      .split('\n')
      .reduce((n, l) => n + Math.max(1, Math.ceil(measure(l, t.fontSize) / t.width)), 0);
    return { id: t.id, x: t.x, y: t.y, w: t.width, h: rows * t.fontSize * (t.lineHeight ?? 1.2) };
  }),
  ...s.shapeInstances.map((r) => ({
    id: r.id,
    x: r.x - r.width / 2,
    y: r.y - r.height / 2,
    w: r.width,
    h: r.height,
  })),
  ...s.assetInstances.map((a) => {
    // The longer side is the target size; x/y is the centre.
    const size = a.scale * ASSET_TARGET_SIZE;
    const h = size * (ASPECT[a.assetId.replace(/-(weiss|gruen)$/, '')] ?? 1);
    return { id: a.id, x: a.x - size / 2, y: a.y - h / 2, w: size, h };
  }),
  ...Object.entries(s.iconStates).map(([id, i]) => ({
    id,
    x: i.x - (i.scale * 120) / 2,
    y: i.y - (i.scale * 120) / 2,
    w: i.scale * 120,
    h: i.scale * 120,
  })),
  ...s.circleBadgeInstances.map((c) => ({
    id: c.id,
    x: c.x - c.radius,
    y: c.y - c.radius,
    w: 2 * c.radius,
    h: 2 * c.radius,
  })),
  ...s.pillBadgeInstances.map((p) => ({
    id: p.id,
    x: p.x,
    y: p.y,
    w: measure(p.text, p.fontSize) + 2 * p.paddingX,
    h: p.fontSize + 2 * p.paddingY,
  })),
  ...s.chartInstances.map((c) => ({
    id: c.id,
    x: c.x,
    y: c.y,
    w: c.width * c.scale,
    h: c.height * c.scale,
  })),
];

const byId = (s: ComposedSlide, id: string) => boxes(s).find((b) => b.id === id);

describe('sharepic formats', () => {
  it('maps every spec format onto the canvas format registry', () => {
    for (const id of sharepicFormatSchema.options) expect(getCanvasFormat(id)).not.toBeNull();
    expect(getCanvasFormat('post-portrait-tall')).toMatchObject({ width: 1080, height: TALL });
  });

  it('accepts a spec without a format and composes it 4:5', () => {
    const spec = { locale: 'de-DE', slides: [slide({})] };
    expect(sharepicSpecSchema.safeParse(spec).success).toBe(true);
    expect(compose('de-DE').format).toBe('post-portrait');
  });
});

describe.each(['de-DE', 'de-AT'] as const)('composeSharepic at 3:4 (%s)', (locale) => {
  const tall = compose(locale, 'post-portrait-tall');
  const portrait = compose(locale);

  it('carries the format for mint and render', () => {
    expect(tall.format).toBe('post-portrait-tall');
  });

  it('keeps every element inside 1080 × 1440', () => {
    for (const s of tall.slides) {
      for (const b of boxes(s)) {
        expect(b.x, b.id).toBeGreaterThanOrEqual(-0.5);
        expect(b.y, b.id).toBeGreaterThanOrEqual(-0.5);
        expect(b.x + b.w, b.id).toBeLessThanOrEqual(1080.5);
        expect(b.y + b.h, b.id).toBeLessThanOrEqual(TALL + 0.5);
      }
    }
  });

  it('anchors logo, swipe arrow and KI label to the bottom edge', () => {
    const shift = TALL - 1350;
    tall.slides.forEach((s, i) => {
      for (const id of ['sc-logo', 'sc-pfeil', 'sc-ki-label-bg', 'sc-ki-label']) {
        const a = byId(s, id);
        const b = byId(portrait.slides[i]!, id);
        expect(!!a, `${id} on slide ${i}`).toBe(!!b);
        if (a && b) expect(a.y - b.y, `${id} on slide ${i}`).toBeCloseTo(shift, 5);
      }
    });
    expect(byId(tall.slides[0]!, 'sc-pfeil')).toBeDefined();
    expect(tall.slides.some((s) => byId(s, 'sc-logo'))).toBe(true);
  });

  it('sits the date circle in the bottom corner', () => {
    const circle = tall.slides[3]!.circleBadgeInstances[0]!;
    const before = portrait.slides[3]!.circleBadgeInstances[0]!;
    expect(circle.y - before.y).toBe(TALL - 1350);
  });

  it('fills the full height with the gradient plane and sizes the strips', () => {
    const planes = tall.slides.map((s) => byId(s, 'sc-bg')).filter((b) => !!b);
    expect(planes.length).toBeGreaterThan(0);
    for (const plane of planes) expect([plane.y, plane.y + plane.h]).toEqual([0, TALL]);
    // foto-oben: photo above 40 %, panel below; foto-unten: panel above 60 %.
    expect(byId(tall.slides[1]!, 'sc-panel')).toMatchObject({ y: TALL * 0.4, h: TALL * 0.6 });
    expect(byId(tall.slides[2]!, 'sc-panel')).toMatchObject({ y: 0, h: TALL * 0.6 });
    // Cover-fitted photo, centred on the canvas; its middle moves into the strip.
    expect(tall.slides[1]!.imageOffset).toEqual({ x: 0, y: (TALL * 0.4) / 2 - TALL / 2 });
    expect(tall.slides[2]!.imageOffset).toEqual({ x: 0, y: (TALL * 0.6 + TALL) / 2 - TALL / 2 });
  });

  it('keeps the text block above the footer', () => {
    for (const s of tall.slides) {
      const logo = byId(s, 'sc-logo');
      if (!logo) continue;
      for (const t of boxes(s).filter((b) => /^sc-\d/.test(b.id))) {
        expect(t.y + t.h, t.id).toBeLessThanOrEqual(logo.y);
      }
    }
  });
});

describe('AT photo tint at 3:4', () => {
  const tall = compose('de-AT', 'post-portrait-tall');
  it.each([
    [1, 0, TALL * 0.4],
    [2, TALL * 0.6, TALL],
  ])('slide %i: spans exactly the photo strip', (i, top, bottom) => {
    const tint = byId(tall.slides[i]!, 'sc-tint')!;
    expect([tint.x, tint.x + tint.w]).toEqual([0, 1080]);
    expect([tint.y, tint.y + tint.h]).toEqual([top, bottom]);
  });
});
