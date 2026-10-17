import { sharepicSpecSchema, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';
import { measure, options, steckbrief, steckbriefAt, steckbriefFoto } from './sharepicSpecFixtures';
import {
  arrowSamples,
  obstacleHit,
  outlineDistance,
  steckbriefFace,
  steckbriefOutline,
  steckbriefPerson,
} from './steckbriefLayout';

const slideOf = (spec: SharepicSpec) => composeSharepic(spec, options).slides[0]!;
const withSlide = (
  spec: SharepicSpec,
  change: (slide: SharepicSpec['slides'][number]) => unknown
): unknown => ({ ...spec, slides: [change(structuredClone(spec.slides[0]!))] });

describe('steckbrief — schema', () => {
  it('accepts both variants in both locales', () => {
    for (const spec of [steckbrief, steckbriefFoto, steckbriefAt]) {
      expect(sharepicSpecSchema.safeParse(spec).success).toBe(true);
    }
  });

  it.each([
    [
      'a headline beside it',
      (s: SharepicSpec['slides'][number]) => ({
        ...s,
        items: [...s.items, { type: 'headline', lines: ['Hallo'] }],
      }),
    ],
    [
      'no person on a colour',
      (s: SharepicSpec['slides'][number]) => ({ ...s, items: [s.items[0]] }),
    ],
    [
      'a photo strip',
      (s: SharepicSpec['slides'][number]) => ({
        ...s,
        background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'tanne' },
      }),
    ],
    ['a Störer', (s: SharepicSpec['slides'][number]) => ({ ...s, stoerer: { text: 'Neu!' } })],
  ])('rejects %s', (_, change) => {
    expect(sharepicSpecSchema.safeParse(withSlide(steckbrief, change)).success).toBe(false);
  });

  it('wants the greeting at the top of a photo', () => {
    const side = withSlide(steckbriefFoto, (s) => ({
      ...s,
      background: { kind: 'foto', filename: 'vorlage:person.jpg', textSeite: 'links' },
    }));
    expect(sharepicSpecSchema.safeParse(side).success).toBe(false);
  });

  it.each([2, 11])('rejects %i traits', (count) => {
    const traits = withSlide(steckbrief, (s) => ({
      ...s,
      items: [
        { ...s.items[0], merkmale: Array.from({ length: count }, (_, k) => `Merkmal ${k}`) },
        s.items[1],
      ],
    }));
    expect(sharepicSpecSchema.safeParse(traits).success).toBe(false);
  });

  it.each(['vorlage:../geheim.jpg', 'vorlage:bild.gif', 'vorlage:Bild.jpg'])(
    'rejects the catalogue photo %s',
    (ref) => {
      const bad = withSlide(steckbriefFoto, (s) => ({
        ...s,
        background: { kind: 'foto', filename: ref, textSeite: 'oben' },
      }));
      expect(sharepicSpecSchema.safeParse(bad).success).toBe(false);
    }
  );
});

describe('steckbrief — layout', () => {
  it('sets every trait with one arrow, plus greeting, name and waving hand', () => {
    const slide = slideOf(steckbrief);
    const traits = slide.additionalTexts.filter((t) => /^sc-0-steckbrief-\d+$/.test(t.id));
    const arrows = slide.shapeInstances.filter((s) => s.id.startsWith('sc-0-steckbrief-pfeil-'));
    expect(traits).toHaveLength(8);
    expect(arrows).toHaveLength(8);
    expect(slide.additionalTexts.map((t) => t.id)).toEqual(
      expect.arrayContaining(['sc-0-steckbrief-gruss', 'sc-0-steckbrief-name'])
    );
    expect(slide.shapeInstances.some((s) => s.type === 'hand-winken')).toBe(true);
  });

  it('keeps the traits on the canvas, above the AI label, clear of each other', () => {
    const slide = slideOf(steckbrief);
    const boxes = slide.additionalTexts
      .filter((t) => /^sc-0-steckbrief-\d+$/.test(t.id))
      .map((t) => ({
        left: t.x,
        right: t.x + t.width,
        top: t.y,
        bottom: t.y + t.text.split('\n').length * t.fontSize * (t.lineHeight ?? 1.2),
      }));
    const ki = slide.pillBadgeInstances.find((p) => p.id.startsWith('sc-ki'));
    for (const [k, a] of boxes.entries()) {
      expect(a.left).toBeGreaterThanOrEqual(0);
      expect(a.right).toBeLessThanOrEqual(1080);
      expect(a.top).toBeGreaterThanOrEqual(0);
      if (ki) expect(a.bottom).toBeLessThanOrEqual(ki.y);
      for (const b of boxes.slice(k + 1)) {
        const apart =
          a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top;
        expect(apart).toBe(true);
      }
    }
  });

  it('stands the cut-out person in the middle, from the cut-out file', () => {
    const person = slideOf(steckbrief).userImageInstances[0]!;
    expect(person.src).toContain('vorlage:person-frei.webp');
    expect(person.x + person.width / 2).toBeGreaterThan(1080 * 0.35);
    expect(person.x + person.width / 2).toBeLessThan(1080 * 0.65);
    expect(person.y + person.height).toBe(1440);
  });

  it('is deterministic', () => {
    expect(JSON.stringify(slideOf(steckbrief))).toBe(JSON.stringify(slideOf(steckbrief)));
  });

  it('sets the party face per country, white on the dark greens, the sunflower only in DE', () => {
    const de = slideOf(steckbrief);
    const at = slideOf(steckbriefAt);
    const name = (slide: ReturnType<typeof slideOf>) =>
      slide.additionalTexts.find((t) => t.id === 'sc-0-steckbrief-name')!;
    expect(name(de).fontFamily).toBe('GrueneTypeNeue');
    expect(name(at).fontFamily).toBe('GothamNarrow-Ultra');
    expect(name(de).fill).toBe('#FFFFFF');
    expect(name(at).fill).toBe('#FFFFFF');
    expect(de.assetInstances.some((a) => a.assetId === 'sunflower-weiss')).toBe(true);
    expect(at.assetInstances.some((a) => a.assetId.startsWith('sunflower'))).toBe(false);
  });

  it('dims a photo evenly instead of from one side', () => {
    const scrim = slideOf(steckbriefFoto).shapeInstances.find((s) => s.id === 'sc-scrim')!;
    expect(scrim.width).toBe(1080);
    expect(scrim.height).toBe(1440);
    expect(scrim.fillGradient ?? null).toBeNull();
  });
});

const TRAITS = [
  'Fährt Rad bei jedem Wetter',
  'Seit 10 Jahren im Ortsverband',
  'Gärtnert auf dem Balkon',
  'Liest gern Krimis',
  'Kocht vegetarisch',
  'Spielt Gitarre',
  'Ehrenamtlich im Tierheim',
  'Kaffee schwarz, bitte',
  'Läuft Halbmarathon',
  'Mag Brettspiele',
];
const withTraits = (spec: SharepicSpec, count: number): SharepicSpec =>
  withSlide(spec, (s) => ({
    ...s,
    items: s.items.map((i) =>
      i.type === 'steckbrief' ? { ...i, merkmale: TRAITS.slice(0, count) } : i
    ),
  })) as SharepicSpec;

describe('steckbrief — arrows', () => {
  const cases: [string, SharepicSpec][] = [
    ['cut-out', steckbrief],
    ['photo', steckbriefFoto],
    ['AT', steckbriefAt],
    ['three traits', withTraits(steckbrief, 3)],
    ['ten traits', withTraits(steckbrief, 10)],
    ['three traits on a photo', withTraits(steckbriefFoto, 3)],
    ['ten traits on a photo', withTraits(steckbriefFoto, 10)],
    ['ten traits, AT', withTraits(steckbriefAt, 10)],
  ];

  it.each(cases)('%s: no arrow crosses a text, the face, or ends off the person', (_, spec) => {
    const slide = slideOf(spec);
    const cutOut = spec.slides[0]!.items.some((i) => i.type === 'bild');
    const person = steckbriefPerson({ width: 1080, height: 1440 }, cutOut);
    const outline = steckbriefOutline(person);
    const face = steckbriefFace(person);
    const labels = slide.additionalTexts
      .filter((t) => /^sc-0-steckbrief-(\d+|gruss|name)$/.test(t.id))
      .map((t) => {
        const step = t.fontSize * (t.lineHeight ?? 1.2);
        const rects = t.text.split('\n').map((line, i) => {
          const w = measure(line, t.fontSize);
          return {
            x: t.align === 'right' ? t.x + t.width - w : t.x,
            y: t.y + i * step,
            width: w,
            height: step,
          };
        });
        return { id: t.id, o: { rects, pivot: { x: t.x, y: t.y }, rotation: t.rotation ?? 0 } };
      });
    const arrows = slide.shapeInstances.filter((s) => s.id.startsWith('sc-0-steckbrief-pfeil-'));
    expect(arrows.length).toBeGreaterThan(0);
    for (const shape of arrows) {
      const k = shape.id.split('-').pop()!;
      const { line, barbs } = arrowSamples(
        shape.type as Parameters<typeof arrowSamples>[0],
        {
          x: shape.x,
          y: shape.y,
          width: shape.width,
          height: shape.height,
          rotation: shape.rotation ?? 0,
          scaleX: shape.scaleX ?? 1,
          scaleY: shape.scaleY ?? 1,
        },
        shape.strokeWidth ?? 11
      );
      let along = 0;
      const points = [
        ...line.map((p, i) => {
          if (i) along += Math.hypot(p.x - line[i - 1]!.x, p.y - line[i - 1]!.y);
          return { p, along };
        }),
        ...barbs.map((p) => ({ p, along })),
      ];
      for (const { p, along: at } of points) {
        for (const label of labels) {
          const own = label.id === `sc-0-steckbrief-${k}`;
          if (own && at < 26) continue;
          expect(obstacleHit(label.o, p, own ? 2 : 10), `${shape.id} over ${label.id}`).toBe(false);
        }
        const inFace =
          p.x > face.x && p.x < face.x + face.width && p.y > face.y && p.y < face.y + face.height;
        expect(inFace, `${shape.id} over the face`).toBe(false);
      }
      const tip = line[line.length - 1]!;
      expect(outlineDistance(outline, tip), `${shape.id} ends off the person`).toBeLessThanOrEqual(
        30
      );
      const length = Math.hypot(tip.x - line[0]!.x, tip.y - line[0]!.y);
      expect(length, `${shape.id} length`).toBeGreaterThan(100);
      expect(length, `${shape.id} length`).toBeLessThan(460);
    }
  });

  it('places the same arrows every time', () => {
    const spec = withTraits(steckbriefFoto, 10);
    expect(JSON.stringify(slideOf(spec).shapeInstances)).toBe(
      JSON.stringify(slideOf(spec).shapeInstances)
    );
  });
});
