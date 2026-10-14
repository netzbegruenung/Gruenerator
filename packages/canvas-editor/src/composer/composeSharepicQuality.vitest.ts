/**
 * The look measured on the parties' posts (10/2026): photos stay bright with
 * the text at the bottom, the headline fills its column, logos are rare, the
 * date circle sits free in the corner.
 */
import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { composeSharepic, SHAREPIC_COLOR_HEX } from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/stock/${f}`, measure };
const compose = (locale: SharepicSpec['locale'], slides: SharepicSlide[]) =>
  composeSharepic({ locale, slides }, options).slides;
const slide = (extra: Partial<SharepicSlide>): SharepicSlide => ({
  background: { kind: 'farbe', color: 'tanne' },
  position: 'mitte',
  align: 'links',
  logo: false,
  items: [{ type: 'headline', lines: ['Mach mit'] }],
  ...extra,
});
type Composed = ReturnType<typeof compose>[number];
const texts = (s: Composed, prefix = 'sc-') =>
  s.additionalTexts.filter((t) => t.id.startsWith(prefix) && !t.id.startsWith('sc-ki'));
/** Bottom of the text group, measured with the stand-in. */
const blockBottom = (s: Composed) =>
  Math.max(
    ...texts(s)
      .filter((t) => /^sc-\d/.test(t.id))
      .map((t) => {
        const rows = t.text
          .split('\n')
          .reduce((n, l) => n + Math.max(1, Math.ceil(measure(l, t.fontSize) / t.width)), 0);
        return t.y + rows * t.fontSize * (t.lineHeight ?? 1.2);
      })
  );

describe.each(['de-DE', 'de-AT'] as const)('date circle (%s)', (locale) => {
  const event = (background: SharepicSlide['background']) =>
    compose(locale, [
      slide({
        background,
        align: 'zentriert',
        items: [
          { type: 'headline', lines: ['Grüner', 'Stammtisch'] },
          {
            type: 'absatz',
            text: 'Alle sind willkommen. Komm vorbei und red mit uns über das, was dich bewegt.',
          },
        ],
        datum: { weekday: 'Di', date: '18.11.', time: '19 Uhr' },
        ort: { lines: ['Gasthaus Zur Post', 'Landstraße 12, Linz'] },
        logo: true,
      }),
    ])[0]!;

  it.each([
    ['farbe', { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'mint' }],
    ['foto', { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' }],
  ] as const)('sits free bottom-right, never over the text (%s)', (_, background) => {
    const s = event(background);
    const c = s.circleBadgeInstances.find((b) => b.id === 'sc-datum')!;
    expect(c.x + c.radius).toBeLessThanOrEqual(1080);
    expect(c.y + c.radius).toBeLessThanOrEqual(1350);
    expect(c.x).toBeGreaterThan(540);
    expect(c.y).toBeGreaterThan(1350 * 0.7);
    // The text group ends above the circle.
    expect(blockBottom(s)).toBeLessThanOrEqual(c.y - c.radius);
    // The place reads with the circle: on its row, right of nothing, left of it.
    const ort = s.additionalTexts.find((t) => t.id === 'sc-ort')!;
    expect(ort.x + ort.width).toBeLessThanOrEqual(c.x - c.radius);
    expect(ort.align).toBe('right');
    const ortMid = ort.y + (2 * ort.fontSize * (ort.lineHeight ?? 1)) / 2;
    expect(Math.abs(ortMid - c.y)).toBeLessThan(5);
  });
});

describe.each(['de-DE', 'de-AT'] as const)('date circle without a time (%s)', (locale) => {
  it.each([
    ['weekday and date', { weekday: 'Sa', date: '10.10.' }, ['Sa', '10.10.']],
    ['weekday only', { weekday: 'Sa' }, ['Sa']],
  ] as const)('lays out %s inside the circle, no empty line', (_, datum, expected) => {
    const [s] = compose(locale, [
      slide({
        background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'mint' },
        datum,
      }),
    ]);
    const c = s!.circleBadgeInstances.find((b) => b.id === 'sc-datum')!;
    expect(c.textLines.map((l) => l.text)).toEqual(expected);
    for (const l of c.textLines) {
      expect(l.text.trim()).not.toBe('');
      expect(Math.abs(l.yOffset) + l.fontSize / 2).toBeLessThanOrEqual(c.radius);
    }
    // Centred: the lines balance around the circle's middle.
    const mids = c.textLines.map((l) => l.yOffset);
    expect(Math.abs(Math.min(...mids) + Math.max(...mids))).toBeLessThan(10);
  });
});

describe.each(['de-DE', 'de-AT'] as const)('date circle under a photo strip (%s)', (locale) => {
  it('runs the column beside the circle, the place bottom-left', () => {
    const [s] = compose(locale, [
      slide({
        background: {
          kind: 'foto-oben',
          filename: 'x.jpg',
          panelColor: locale === 'de-AT' ? 'dunkelgruen' : 'mint',
        },
        position: 'oben',
        items: [
          { type: 'headline', lines: ['Grüner', 'Stammtisch'] },
          { type: 'absatz', text: 'Alle sind willkommen. Komm vorbei und red mit!' },
        ],
        datum: { weekday: 'Di', date: '18.11.', time: '19 Uhr' },
        ort: { lines: ['Gasthaus Zur Post', 'Landstraße 12'] },
      }),
    ]);
    const c = s!.circleBadgeInstances.find((b) => b.id === 'sc-datum')!;
    expect(c.y).toBeGreaterThan(1350 * 0.7);
    const block = texts(s!).filter((t) => /^sc-\d/.test(t.id));
    for (const t of block) expect(t.x + t.width).toBeLessThanOrEqual(c.x - c.radius);
    // The paragraph stays readable in the short panel.
    expect(block.find((t) => t.id.endsWith('absatz'))!.fontSize).toBeGreaterThanOrEqual(36);
    const ort = s!.additionalTexts.find((t) => t.id === 'sc-ort')!;
    expect(ort.y).toBeGreaterThan(blockBottom(s!));
    expect(ort.x + ort.width).toBeLessThanOrEqual(c.x - c.radius);
  });
});

describe('DE accent box', () => {
  it.each([
    ['farbe', { kind: 'farbe', color: 'mint' }],
    ['foto-oben', { kind: 'foto-oben', filename: 'x.jpg', panelColor: 'mint' }],
  ] as const)('covers the marked line of a centred event headline (%s)', (_, background) => {
    // de3: a date circle used to narrow the column to 560 while the box
    // centred on the canvas, so it cut the word ("bez|ahlbare").
    const s = compose('de-DE', [
      slide({
        background,
        align: 'zentriert',
        position: 'oben',
        items: [
          { type: 'headline', lines: ['Für', 'bezahlbare', 'Mieten'], akzent: 1 },
          { type: 'text', text: 'Komm vorbei.' },
        ],
        datum: { weekday: 'Sa', date: '15.11.', time: '10 Uhr' },
      }),
    ])[0]!;
    const line = s.additionalTexts.find((t) => t.id === 'sc-0-headline-1')!;
    const box = s.shapeInstances.find((b) => b.id === 'sc-0-headline-1-box')!;
    const textWidth = measure(line.text, line.fontSize);
    const textLeft = line.x + (line.width - textWidth) / 2;
    const w = box.width as number;
    expect(box.x - w / 2).toBeLessThanOrEqual(textLeft);
    expect(box.x + w / 2).toBeGreaterThanOrEqual(textLeft + textWidth);
    expect(box.x).toBeCloseTo(line.x + line.width / 2, 5);
  });

  it('is white, not lime, on grass green', () => {
    const s = compose('de-DE', [
      slide({
        background: { kind: 'farbe', color: 'grasgruen' },
        items: [{ type: 'headline', lines: ['Geh wählen!', 'Jede Stimme zählt'], akzent: 1 }],
      }),
    ])[0]!;
    expect(s.shapeInstances.find((b) => b.id.endsWith('-box'))?.fill).toBe('#FFFFFF');
  });
});

describe.each(['de-DE', 'de-AT'] as const)('photo slides (%s)', (locale) => {
  it('sets a block asked for in the middle at the bottom', () => {
    const [mitte, unten] = (['mitte', 'unten'] as const).map(
      (position) =>
        compose(locale, [
          slide({
            background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' },
            position,
            items: [
              { type: 'headline', lines: ['Bahn', 'für alle'] },
              { type: 'text', text: 'Jetzt.' },
            ],
          }),
        ])[0]!
    );
    expect(texts(mitte!).map((t) => t.y)).toEqual(texts(unten!).map((t) => t.y));
    expect(Math.min(...texts(mitte!).map((t) => t.y))).toBeGreaterThan(1350 / 2);
  });
});

describe.each(['de-DE', 'de-AT'] as const)('headline (%s)', (locale) => {
  const color = locale === 'de-AT' ? 'dunkelgruen' : 'tanne';
  it.each([
    ['links', ['Die Mitte', 'zahlt genug.']],
    ['zentriert', ['Schützen wir', 'unseren Boden.']],
  ] as const)('fills its column (%s)', (align, lines) => {
    const s = compose(locale, [
      slide({
        background: { kind: 'farbe', color },
        align,
        items: [
          { type: 'headline', lines: [...lines] },
          { type: 'absatz', text: 'Ein Satz dazu, damit es kein Cover ist.' },
        ],
      }),
    ])[0]!;
    const head = s.additionalTexts.find((t) => t.id === 'sc-0-headline-0')!;
    const widest = Math.max(...head.text.split('\n').map((l) => measure(l, head.fontSize)));
    expect(widest / head.width).toBeGreaterThanOrEqual(0.85);
    expect(widest).toBeLessThanOrEqual(head.width);
    // AT narrows its centred paragraphs, never the headline.
    expect(head.width).toBe(940);
  });

  it('stays at least 1.8 × the paragraph', () => {
    const s = compose(locale, [
      slide({
        background: { kind: 'farbe', color },
        items: [
          {
            type: 'headline',
            lines: ['Klimaschutz ist', 'Daseinsvorsorge für', 'unsere Gemeinden'],
          },
          { type: 'absatz', text: 'Kurz.' },
        ],
      }),
    ])[0]!;
    const head = s.additionalTexts.find((t) => t.id === 'sc-0-headline-0')!;
    const para = s.additionalTexts.find((t) => t.id === 'sc-1-absatz')!;
    expect(head.fontSize).toBeGreaterThanOrEqual(1.8 * para.fontSize);
  });

  it('goes top-left when it stands alone on a colour', () => {
    const s = compose(locale, [
      slide({
        background: { kind: 'farbe', color },
        align: 'zentriert',
        items: [
          { type: 'dachzeile', text: 'Kommunalwahl' },
          { type: 'headline', lines: ['Geh', 'wählen!'] },
        ],
      }),
    ])[0]!;
    const all = texts(s);
    expect(all.every((t) => t.align === 'left')).toBe(true);
    expect(Math.min(...all.map((t) => t.y))).toBeLessThanOrEqual(130);
  });

  it('grows a cover alone on a colour into the upper ~60 %, splitting long lines', () => {
    const lines = ['Was beschäftigt dich', '==gerade?=='];
    const s = compose(locale, [
      slide({
        background: { kind: 'farbe', color },
        items: [{ type: 'headline', lines, akzent: 1 }],
      }),
    ])[0]!;
    const head = s.additionalTexts.filter((t) => t.id.startsWith('sc-0-headline'));
    const rows = head.flatMap((t) => t.text.split('\n'));
    expect(rows.length).toBeGreaterThan(2);
    // Every word kept, in order; the accent stays on the last line, marks paired.
    expect(rows.join(' ').replace(/==/g, '')).toBe(lines.join(' ').replace(/==/g, ''));
    expect(head.at(-1)!.text).toContain('gerade?');
    const size = head[0]!.fontSize;
    expect(size).toBeGreaterThan(150);
    const top = Math.min(...head.map((t) => t.y));
    const bottom = top + rows.length * size * (head[0]!.lineHeight ?? 1);
    expect(top).toBeLessThanOrEqual(130);
    expect(bottom).toBeLessThanOrEqual(1350 * 0.72);
    expect(bottom - top).toBeGreaterThan(1350 * 0.4);
  });

  it('sizes the kicker with the headline', () => {
    const s = compose(locale, [
      slide({
        background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' },
        items: [
          { type: 'dachzeile', text: 'Du entscheidest!' },
          { type: 'headline', lines: ['Chaos oder', 'Fortschritt?'] },
        ],
      }),
    ])[0]!;
    const kicker = s.additionalTexts.find((t) => t.id === 'sc-0-dachzeile')!;
    const head = s.additionalTexts.find((t) => t.id === 'sc-1-headline-0')!;
    expect(kicker.fontSize).toBeCloseTo(head.fontSize * 0.4, -1);
    // On a photo in the headline face.
    expect(kicker.fontFamily).toBe(getBrandTheme(locale).fonts.headline);
  });
});

describe.each(['de-DE', 'de-AT'] as const)('quote alone on a colour (%s)', (locale) => {
  it('fills ~25–30 % of the height, like the interview covers', () => {
    const [s] = compose(locale, [
      slide({
        background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
        items: [
          {
            type: 'zitat',
            text: 'Weil jedes Kind sicher zur Schule kommen soll.',
            name: 'Lena Hoffmann',
          },
        ],
      }),
    ]);
    const q = s!.additionalTexts.find((t) => t.id === 'sc-0-zitat')!;
    const rows = Math.ceil(measure(q.text, q.fontSize) / q.width);
    const height = rows * q.fontSize * (q.lineHeight ?? 1.2);
    expect(height / 1350).toBeGreaterThanOrEqual(0.22);
    expect(height / 1350).toBeLessThanOrEqual(0.4);
  });
});

describe('logo', () => {
  it('AT: ~210 px, only on the last slide of a carousel and only on a colour', () => {
    const slides = compose('de-AT', [
      slide({ background: { kind: 'farbe', color: 'dunkelgruen' }, logo: true }),
      slide({ background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' }, logo: true }),
      slide({ background: { kind: 'farbe', color: 'dunkelgruen' }, logo: true }),
    ]);
    const logos = slides.map((s) => s.assetInstances.find((a) => a.id === 'sc-logo'));
    expect(logos.map(Boolean)).toEqual([false, false, true]);
    expect(logos[2]!.scale * 150).toBe(210);
    expect(logos[2]!.x).toBe(540);
    // A last slide on a photo carries none either.
    const [onPhoto] = compose('de-AT', [
      slide({ background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' }, logo: true }),
    ]);
    expect(onPhoto!.assetInstances.some((a) => a.id === 'sc-logo')).toBe(false);
  });

  it('DE: the word mark bottom-left at the margin, none on a full-bleed photo', () => {
    const [colour, photo] = compose('de-DE', [
      slide({ logo: true }),
      slide({ background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' }, logo: true }),
    ]);
    const logo = colour!.assetInstances.find((a) => a.id === 'sc-logo')!;
    const size = logo.scale * 150;
    // ~250–300 px wide, as on Dd_BXcKiDy2/03 and Ddouf0QiL1w/02.
    expect(size).toBeGreaterThanOrEqual(240);
    expect(size).toBeLessThanOrEqual(300);
    expect(logo.assetId).toMatch(/^gruene-de-logo-/);
    expect(logo.x - size / 2).toBe(70);
    expect(logo.y).toBeGreaterThan(1350 - 250);
    expect(photo!.assetInstances.some((a) => a.id === 'sc-logo')).toBe(false);
  });
});

describe('DE interview question', () => {
  it('sets the medium in Klee on a light ground, the question below the answer size', () => {
    const [s] = compose('de-DE', [
      slide({
        background: { kind: 'farbe', color: 'mint' },
        items: [
          { type: 'frage', text: 'Warum noch mehr Radwege?', von: 'Kasseler Bote' },
          { type: 'absatz', text: 'Weil jedes Kind sicher zur Schule kommen soll.' },
        ],
      }),
    ]);
    const q = s!.additionalTexts.find((t) => t.id === 'sc-0-frage')!;
    const a = s!.additionalTexts.find((t) => t.id === 'sc-1-absatz')!;
    expect(q.text.startsWith('==Kasseler Bote:==')).toBe(true);
    expect(q.accent?.fill).toBe('#008939');
    expect(q.fill).toBe(SHAREPIC_COLOR_HEX.dunkeltanne);
    expect(q.fontSize).toBeLessThan(a.fontSize);
  });
});
