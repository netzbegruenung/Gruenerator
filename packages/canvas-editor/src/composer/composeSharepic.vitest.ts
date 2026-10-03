import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import {
  SHAREPIC_LOCALE_COLORS,
  type SharepicSlide,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { applySharepicPatch } from './applySharepicPatch';
import {
  balancedWrap,
  type ComposeOptions,
  composeSharepic,
  SCRIM_MAX,
  SHAREPIC_COLOR_HEX,
  wrapWords,
} from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/api/image-picker/stock-image/${f}`, measure };

const fotoSlide: SharepicSlide = {
  background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
  position: 'unten',
  align: 'links',
  items: [
    { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
    { type: 'text', text: 'Gemeinsam für **Klimaschutz** vor Ort.' },
    { type: 'button', text: 'Jetzt Mitglied werden' },
  ],
  stoerer: { text: 'Neu dabei!' },
  logo: true,
};
const foto: SharepicSpec = { locale: 'de-DE', slides: [fotoSlide] };
const one = (spec: SharepicSpec) => composeSharepic(spec, options).slides[0]!;

const byId = <T extends { id: string }>(texts: T[], suffix: string) =>
  texts.find((t) => t.id.endsWith(suffix));

describe('composeSharepic', () => {
  it('builds a photo slide with a scrim, a fitted headline and one accent', () => {
    const { templateType } = composeSharepic(foto, options);
    const props = one(foto);
    expect(templateType).toBe('freeform');
    expect(props.currentImageSrc).toBe('/api/image-picker/stock-image/wind.jpg');
    const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim');
    expect(scrim?.fillGradient?.stops.at(-1)?.color).toMatch(/^rgba\(/);
    // Plain line and accent line are separate, editable texts.
    const plain = byId(props.additionalTexts, 'headline-0');
    const accent = byId(props.additionalTexts, 'headline-1');
    expect(plain?.text).toBe('Mach mit');
    expect(accent?.text).toBe('bei uns!');
    // Sentence case is kept, and the headline is large.
    expect(plain?.fontSize).toBeGreaterThanOrEqual(110);
    // DE accent: dark text on a lime marker box behind it.
    expect(accent?.fill).toBe(SHAREPIC_COLOR_HEX.dunkeltanne);
    expect(props.shapeInstances.some((s) => s.id.endsWith('headline-1-box'))).toBe(true);
    // The group sits at the bottom, above the footer, in reading order.
    const body = byId(props.additionalTexts, '-text')!;
    expect(body.y).toBeGreaterThan(accent!.y);
    expect(props.pillBadgeInstances[0].y).toBeGreaterThan(body.y);
    expect(props.pillBadgeInstances[0].y).toBeLessThan(1350 - 130);
    // Störer goes to the corner away from the text group.
    expect(props.circleBadgeInstances[0].y).toBeLessThan(400);
  });

  it('uses the Austrian fonts, yellow Vollkorn accent and AT logo', () => {
    const { templateType, slides } = composeSharepic(
      {
        locale: 'de-AT',
        slides: [
          {
            background: { kind: 'farbe', color: 'dunkelgruen' },
            position: 'mitte',
            align: 'zentriert',
            items: [{ type: 'headline', lines: ['Ein Baum', 'für jede', 'Straße'], akzent: 2 }],
            logo: true,
          },
        ],
      },
      options
    );
    const props = slides[0]!;
    const theme = getBrandTheme('de-AT');
    expect(templateType).toBe('freeform-at');
    expect(props.shapeInstances[0].fillGradient).toBeTruthy();
    const plain = byId(props.additionalTexts, 'headline-0')!;
    const accent = byId(props.additionalTexts, 'headline-1')!;
    expect(plain.text).toBe('Ein Baum\nfür jede');
    // A headline alone on a colour is a cover: top-left, as the posts set it.
    expect(plain).toMatchObject({ fontFamily: theme.fonts.headline, align: 'left' });
    expect(plain.y).toBeLessThan(200);
    expect(accent).toMatchObject({
      fontFamily: theme.fonts.quoteEmphasis,
      fill: theme.colors.accent,
    });
    // ~210 px (measured with the claim), centred, its bottom ~91 px from the edge.
    const logo = props.assetInstances[0]!;
    expect(logo).toMatchObject({ assetId: 'gruene-at-logo-weiss', x: 540 });
    expect(logo.scale * 150).toBe(210);
    expect(logo.y + (210 * 1239) / 1410 / 2).toBeCloseTo(1350 - 91, 0);
  });

  it('puts lists on a white card and runs the column beside the date circle', () => {
    const props = one({
      locale: 'de-DE',
      slides: [
        {
          background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'mint' },
          position: 'oben',
          align: 'links',
          items: [
            { type: 'headline', lines: ['Grüner Stammtisch'] },
            { type: 'liste', items: ['Kennenlernen', 'Mitreden'] },
          ],
          datum: { weekday: 'Do', date: '14.11.', time: '19 Uhr' },
          ort: { lines: ['Café Linde', 'Hauptstraße 3'] },
          logo: true,
        },
      ],
    });
    expect(props.shapeInstances.find((s) => s.id === 'sc-panel')?.fill).toBe(
      SHAREPIC_COLOR_HEX.mint
    );
    const head = byId(props.additionalTexts, 'headline-0')!;
    expect(head.y).toBeGreaterThan(540);
    const circle = props.circleBadgeInstances[0]!;
    expect(head.x + head.width).toBeLessThanOrEqual(circle.x - circle.radius);
    expect(head.fill).toBe(SHAREPIC_COLOR_HEX.dunkeltanne);
    expect(
      props.shapeInstances.some((s) => s.id.endsWith('liste-card') && s.fill === '#FFFFFF')
    ).toBe(true);
    expect(byId(props.additionalTexts, '-liste')?.text).toBe('• Kennenlernen\n• Mitreden');
  });

  it.each(['de-DE', 'de-AT'] as const)(
    'shrinks list type until the longest word fits (%s)',
    (locale) => {
      const word = 'Nahrungsmittelproduktionsumstellung';
      const props = one({
        locale,
        slides: [
          {
            background: { kind: 'farbe', color: 'tanne' },
            position: 'mitte',
            align: 'links',
            items: [{ type: 'liste', items: [`Weniger ${word}.`, 'Mehr Wald'] }],
            logo: true,
          },
        ],
      });
      const list = byId(props.additionalTexts, '-liste')!;
      const size = list.fontSize as number;
      expect(measure('• ', size) + measure(`${word}.`, size)).toBeLessThanOrEqual(
        list.width as number
      );
      // the unguarded size is 54 * min(scale, 1.3), at least 54 for scale >= 1
      expect(size).toBeLessThan(54);
    }
  );

  it.each(['de-DE', 'de-AT'] as const)(
    'shrinks plain absatz type until the longest word fits (%s)',
    (locale) => {
      const word = 'Nahrungsmittelproduktionsumstellung';
      const props = one({
        locale,
        slides: [
          {
            background: { kind: 'farbe', color: 'tanne' },
            position: 'mitte',
            align: 'links',
            items: [{ type: 'absatz', text: `Wir wollen ${word}.` }],
            logo: true,
          },
        ],
      });
      const para = byId(props.additionalTexts, '-absatz')!;
      expect(para.fontSize as number).toBeLessThan(
        Math.round((locale === 'de-AT' ? 58 : 48) * 1.3)
      );
      expect(measure(`${word}.`, para.fontSize as number)).toBeLessThanOrEqual(
        para.width as number
      );
    }
  );

  it('keeps every element in the layer order exactly once', () => {
    const props = one(foto);
    const ids = [
      ...props.additionalTexts,
      ...props.shapeInstances,
      ...props.pillBadgeInstances,
      ...props.circleBadgeInstances,
      ...props.assetInstances,
      ...props.chartInstances,
    ].map((e) => e.id);
    expect([...props.layerOrder].sort()).toEqual([...ids, ...props.selectedIcons].sort());
  });
});

const carousel = (locale: SharepicSpec['locale'], slides: SharepicSlide[]): SharepicSpec => ({
  locale,
  slides,
});
const farbe = (
  items: SharepicSlide['items'],
  extra: Partial<SharepicSlide> = {}
): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkelgruen' },
  position: 'mitte',
  align: 'zentriert',
  items,
  logo: false,
  ...extra,
});

describe('composeSharepic — carousels', () => {
  it('puts the swipe arrow on every slide but the last, AT as a long arrow to the edge', () => {
    const { slides } = composeSharepic(
      carousel('de-AT', [
        farbe([{ type: 'headline', lines: ['Die Mitte', 'zahlt genug.'] }]),
        farbe([{ type: 'absatz', text: 'In Österreich ist Vermögen sehr ==ungleich== verteilt.' }]),
        farbe([{ type: 'absatz', text: 'Darum sagen wir:', betont: true }], { logo: true }),
      ]),
      options
    );
    expect(slides).toHaveLength(3);
    expect(slides.map((s) => s.selectedIcons)).toEqual([['sc-pfeil'], ['sc-pfeil'], []]);
    expect(slides[0]!.iconStates['sc-pfeil']).toMatchObject({
      iconId: 'heroicons:arrow-long-right',
    });
    expect(slides[2]!.assetInstances.map((a) => a.id)).toEqual(['sc-logo']);
  });

  it('gives every text the accent style, so ==words== render and stay editable', () => {
    const theme = getBrandTheme('de-AT');
    const props = composeSharepic(
      carousel('de-AT', [farbe([{ type: 'absatz', text: 'Vermögen ist ==ungleich== verteilt.' }])]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, '-absatz')?.accent).toEqual({
      fill: theme.colors.accent,
      fontFamily: theme.fonts.quoteEmphasis,
      fontStyle: 'italic',
    });
  });

  it('sets a stressed AT paragraph in yellow Vollkorn', () => {
    const theme = getBrandTheme('de-AT');
    const props = composeSharepic(
      carousel('de-AT', [farbe([{ type: 'absatz', text: 'Darum sagen wir:', betont: true }])]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, '-absatz')).toMatchObject({
      fontFamily: theme.fonts.quoteEmphasis,
      fill: theme.colors.accent,
    });
  });

  it('turns DE story lines into stacked line boxes, the stressed ones green, without a scrim', () => {
    const props = composeSharepic(
      carousel('de-DE', [
        {
          background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
          position: 'mitte',
          align: 'zentriert',
          zeilenboxen: true,
          items: [
            { type: 'absatz', text: 'Sie kauft ein. Sie vereinbart Arzttermine.' },
            { type: 'absatz', text: 'Trotz Vollzeitjob.', betont: true },
          ],
          logo: false,
        },
      ]),
      options
    ).slides[0]!;
    expect(props.shapeInstances.some((s) => s.id === 'sc-scrim')).toBe(false);
    const boxes = props.pillBadgeInstances;
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.at(-1)).toMatchObject({
      text: 'Trotz Vollzeitjob.',
      backgroundColor: SHAREPIC_COLOR_HEX.grasgruen,
    });
    expect(boxes[0]!.backgroundColor).toBe('#FFFFFF');
    // Stacked top to bottom, boxes touching.
    for (let k = 1; k < boxes.length; k++) expect(boxes[k]!.y).toBeGreaterThan(boxes[k - 1]!.y);
  });

  it('keeps a word accent out of a DE marker line, where it would be lime on lime', () => {
    const props = composeSharepic(
      carousel('de-DE', [
        farbe(
          [
            { type: 'headline', lines: ['Mobilität für ==alle==,', 'egal wo.'], akzent: 0 },
            { type: 'text', text: 'Für alle.' },
          ],
          {
            background: { kind: 'farbe', color: 'grasgruen' },
          }
        ),
      ]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, 'headline-0')?.text).toBe('Mobilität für alle,');
  });

  it('boxes every line of a multi-line DE accent, grass green on mint', () => {
    const props = composeSharepic(
      carousel('de-DE', [
        farbe(
          [
            {
              type: 'headline',
              lines: ['Wer andere', 'auffängt,', 'darf nicht', 'fallen.'],
              akzent: [2, 3],
            },
          ],
          { background: { kind: 'farbe', color: 'mint' } }
        ),
      ]),
      options
    ).slides[0]!;
    const boxes = props.shapeInstances.filter((s) => s.id.endsWith('-box'));
    expect(boxes.map((b) => b.fill)).toEqual([
      SHAREPIC_COLOR_HEX.grasgruen,
      SHAREPIC_COLOR_HEX.grasgruen,
    ]);
  });

  it('sets a short boxed hook large and a long story paragraph compact', () => {
    const boxedSlide = (text: string): SharepicSlide => ({
      background: { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      position: 'mitte',
      align: 'zentriert',
      zeilenboxen: true,
      items: [{ type: 'absatz', text }],
      logo: false,
    });
    const sizes = composeSharepic(
      carousel('de-DE', [
        boxedSlide('Daria pflegt ihre Mutter. Jeden Tag.'),
        boxedSlide(
          'Sie kauft ein. Sie vereinbart Arzttermine. Sie kümmert sich um Medikamente und ist da, wenn ihre Mutter sie braucht.'
        ),
      ]),
      options
    ).slides.map((s) => s.pillBadgeInstances[0]!.fontSize);
    expect(sizes[0]).toBeGreaterThan(85);
    expect(sizes[1]).toBeLessThanOrEqual(70);
  });

  it('keeps the text on the colour above a photo that fades in below', () => {
    const props = composeSharepic(
      carousel('de-AT', [
        farbe([{ type: 'absatz', text: 'Unsere Nutzpflanzen stehen unter Stress.' }], {
          background: { kind: 'foto-unten', filename: 'wind.jpg', panelColor: 'dunkelgruen' },
          position: 'unten',
        }),
      ]),
      options
    ).slides[0]!;
    const panel = props.shapeInstances.find((s) => s.id === 'sc-panel')!;
    // A hard edge, not a smear: the panel is solid and ends where the photo starts.
    expect(panel.fillGradient).toBeUndefined();
    expect(panel.height).toBe(1350 * 0.6);
    const absatz = byId(props.additionalTexts, '-absatz')!;
    expect(absatz.y).toBeLessThan(1350 * 0.6);
    expect(props.currentImageSrc).toContain('wind.jpg');
  });

  it('prints the source small at the bottom', () => {
    const props = composeSharepic(
      carousel('de-AT', [farbe([{ type: 'text', text: '−33 % beim Obst' }], { quelle: 'LKÖ' })]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, 'sc-quelle')).toMatchObject({ text: 'Quelle: LKÖ' });
  });
});

describe('composeSharepic — zitat', () => {
  it('renders the speaker name and role for de-DE', () => {
    const locale = 'de-DE';
    const props = composeSharepic(
      carousel(locale, [
        farbe(
          [
            {
              type: 'zitat',
              text: 'Wer heute beim **Klimaschutz** spart, zahlt morgen doppelt.',
              name: 'Sabine Moser',
              funktion: 'Spitzenkandidatin',
            },
          ],
          { position: 'unten', align: 'links' }
        ),
      ]),
      options
    ).slides[0]!;
    const name = byId(props.additionalTexts, '-name');
    expect(name?.text).toBe('**Sabine Moser**\nSpitzenkandidatin');
    const quote = props.additionalTexts.find((t) => t.text.includes('Klimaschutz'));
    expect(name!.y).toBeGreaterThan(quote!.y);
  });

  it.each([
    ['farbe', { kind: 'farbe', color: 'dunkelgruen' }],
    ['foto', { kind: 'foto', filename: 'wind.jpg', textSeite: 'links' }],
  ] as const)(
    'sets the AT quote in the poster sans, centred, name only, no logo (%s)',
    (_, background) => {
      const theme = getBrandTheme('de-AT');
      const props = one({
        locale: 'de-AT',
        slides: [
          {
            background,
            position: 'mitte',
            align: 'links',
            logo: true,
            items: [
              {
                type: 'zitat',
                text: 'Wer heute beim ==Klimaschutz== spart, zahlt morgen doppelt.',
                name: 'Sabine Moser',
                funktion: 'Spitzenkandidatin',
                quelle: 'im ORF-Interview',
              },
            ],
          },
        ],
      });
      const quote = byId(props.additionalTexts, '-zitat')!;
      expect(quote).toMatchObject({
        fontFamily: theme.fonts.headline,
        align: 'center',
        fill: '#FFFFFF',
      });
      expect(quote.accent).toMatchObject({ fontFamily: theme.fonts.quoteEmphasis });
      // A thin outlined quote mark above it, not a filled asset.
      const mark = byId(props.additionalTexts, '-zitat-mark')!;
      expect(mark).toMatchObject({ fill: 'transparent', stroke: '#FFFFFF', align: 'center' });
      expect(mark.y).toBeLessThan(quote.y);
      expect(props.assetInstances.some((a) => a.assetId.startsWith('quote-mark'))).toBe(false);
      // Only the name: small, 70 % white, no role, no medium.
      const name = byId(props.additionalTexts, '-name')!;
      expect(name).toMatchObject({ text: 'Sabine Moser', opacity: 0.7 });
      expect(name.fontSize).toBeLessThanOrEqual(32);
      expect(name.y).toBeGreaterThan(quote.y);
      expect(props.assetInstances.some((a) => a.id === 'sc-logo')).toBe(false);
      // On a photo: the scrim comes from below, whatever side was asked for.
      if (background.kind === 'foto') {
        const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
        expect(scrim.fillGradient?.angle).toBe(90);
        expect(quote.x + quote.width / 2).toBeCloseTo(540, 0);
      }
    }
  );
});

describe('composeSharepic — interview items', () => {
  it('sets the medium after the name for de-DE', () => {
    const locale = 'de-DE';
    const props = composeSharepic(
      carousel(locale, [
        farbe(
          [
            {
              type: 'zitat',
              text: 'Es reicht jetzt.',
              name: 'Felix Banaszak',
              quelle: 'im FAZ-Interview',
            },
          ],
          { position: 'unten', align: 'links' }
        ),
      ]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, '-name')?.text).toBe('**Felix Banaszak** im FAZ-Interview');
  });

  it('puts the role under name and medium', () => {
    const props = composeSharepic(
      carousel('de-DE', [
        farbe([
          {
            type: 'zitat',
            text: 'x',
            name: 'A B',
            funktion: 'Vorsitzende',
            quelle: 'im SZ-Interview',
          },
        ]),
      ]),
      options
    ).slides[0]!;
    expect(byId(props.additionalTexts, '-name')?.text).toBe('**A B** im SZ-Interview\nVorsitzende');
  });

  it('renders a question bold, with the medium prefix when given', () => {
    const slide = (von?: string) =>
      composeSharepic(
        carousel('de-DE', [
          farbe([
            { type: 'frage', text: 'Wie geht es weiter?', ...(von ? { von } : {}) },
            { type: 'absatz', text: 'Wir machen weiter.' },
          ]),
        ]),
        options
      ).slides[0]!;
    const withVon = byId(slide('SZ').additionalTexts, '-frage');
    // The medium's prefix is its own run, in grass green on the dark ground.
    expect(withVon).toMatchObject({ text: '==SZ:== Wie geht es weiter?', fontStyle: 'bold' });
    expect(withVon?.accent).toEqual({ fill: SHAREPIC_COLOR_HEX.grasgruen });
    expect(byId(slide().additionalTexts, '-frage')?.text).toBe('Wie geht es weiter?');
    const answer = byId(slide().additionalTexts, '-absatz')!;
    const question = byId(slide().additionalTexts, '-frage')!;
    expect(answer.y).toBeGreaterThan(question.y);
    // The question is clearly smaller than the answer.
    expect(question.fontSize).toBeLessThanOrEqual(answer.fontSize * 0.8);
  });

  it('keeps the scrim under a quote on a boxed photo slide', () => {
    const props = one({
      locale: 'de-DE',
      slides: [
        {
          ...fotoSlide,
          zeilenboxen: true,
          items: [{ type: 'zitat', text: 'Es reicht.', name: 'A B' }],
        },
      ],
    });
    expect(props.shapeInstances.some((s) => s.id === 'sc-scrim')).toBe(true);
  });

  describe('scrim follows the text and the photo', () => {
    type Scrim = NonNullable<ReturnType<typeof one>['shapeInstances'][number]>;
    /** Alpha of the scrim at a canvas point, read from the stops and the shape geometry. */
    const alphaAt = (s: Scrim, px: number, py: number) => {
      const w = s.width as number;
      const h = s.height as number;
      const left = s.x - w / 2;
      const top = s.y - h / 2;
      const g = s.fillGradient!;
      const t =
        g.angle === 180
          ? (left + w - px) / w
          : g.angle === 0
            ? (px - left) / w
            : g.angle === 90
              ? (py - top) / h
              : (top + h - py) / h;
      const c = Math.min(1, Math.max(0, t));
      const stops = g.stops.map((st) => ({
        o: st.offset,
        a: Number(/rgba\([^,]+,[^,]+,[^,]+,([\d.]+)\)/.exec(st.color)![1]),
      }));
      for (let i = 1; i < stops.length; i++) {
        if (c <= stops[i]!.o) {
          const a = stops[i - 1]!;
          const b = stops[i]!;
          return a.a + ((b.a - a.a) * (c - a.o)) / (b.o - a.o || 1);
        }
      }
      return stops.at(-1)!.a;
    };
    const quote = (textSeite: 'links' | 'rechts' | 'unten' | 'oben', locale: 'de-DE' | 'de-AT') =>
      ({
        locale,
        slides: [
          {
            background: { kind: 'foto', filename: 'zug.jpg', textSeite },
            position: textSeite === 'oben' ? 'oben' : 'unten',
            align: 'links',
            // A paragraph, not a quote: an AT quote always goes to the bottom.
            items: [
              {
                type: 'absatz',
                text: 'Wir bauen Wohnungen, Bahnen und Radwege, damit sich alle Menschen in unserer Stadt ein gutes Leben leisten können. Und wir bauen weiter, Jahr für Jahr.',
              },
            ],
          },
        ],
      }) as SharepicSpec;
    const scrimOf = (spec: SharepicSpec, opts: ComposeOptions = options) =>
      composeSharepic(spec, opts).slides[0]!.shapeInstances.find((s) => s.id === 'sc-scrim')!;

    for (const locale of ['de-DE', 'de-AT'] as const) {
      it(`keeps ${locale} side text on the dense scrim to the column end plus gutter`, () => {
        const darkRgb = locale === 'de-AT' ? '3,14,8' : '6,37,26';
        const l = scrimOf(quote('links', locale));
        expect(l.fillGradient!.stops[1]!.color).toContain(darkRgb);
        expect(alphaAt(l, 70 + 1080 * 0.52 + 48, 600)).toBeGreaterThanOrEqual(0.48 - 1e-6);
        const r = scrimOf(quote('rechts', locale));
        expect(alphaAt(r, 1080 - 70 - 1080 * 0.52 - 48, 600)).toBeGreaterThanOrEqual(0.48 - 1e-6);
        // Fades out beyond the column; the far edge stays as shot.
        expect(alphaAt(l, 1079, 600)).toBeLessThan(0.01);
        expect(alphaAt(l, 1080 - 40, 600)).toBeLessThan(0.05);
      });

      it(`covers a tall ${locale} block at the bottom incl. gutter`, () => {
        const spec = quote('unten', locale);
        const props = composeSharepic(spec, options).slides[0]!;
        const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
        const topY = Math.min(...props.additionalTexts.map((t) => t.y));
        expect(alphaAt(scrim, 540, topY - 48)).toBeGreaterThanOrEqual(0.48 - 1e-6);
        expect(alphaAt(scrim, 540, 0)).toBe(0);
      });
    }

    it('covers a block at the top incl. gutter', () => {
      const props = composeSharepic(quote('oben', 'de-DE'), { ...options, kiLabel: 'none' })
        .slides[0]!;
      const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
      const bottomY = Math.max(...props.additionalTexts.map((t) => t.y + (t.fontSize ?? 0)));
      expect(alphaAt(scrim, 540, bottomY + 48)).toBeGreaterThanOrEqual(0.48 - 1e-6);
    });

    for (const position of ['oben', 'mitte'] as const) {
      it(`anchors the scrim on the block, not the side: unten text at ${position}`, () => {
        const spec = quote('unten', 'de-DE');
        const slide = spec.slides[0]!;
        const mismatched: SharepicSpec = { ...spec, slides: [{ ...slide, position }] };
        const props = composeSharepic(mismatched, { ...options, kiLabel: 'none' }).slides[0]!;
        const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
        const ys = props.additionalTexts.map((t) => t.y);
        const topY = Math.min(...ys);
        const bottomY = Math.max(...props.additionalTexts.map((t) => t.y + (t.fontSize ?? 0)));
        // Dense over the block, gutter included.
        expect(alphaAt(scrim, 540, topY)).toBeGreaterThanOrEqual(0.48 - 1e-6);
        expect(alphaAt(scrim, 540, bottomY)).toBeGreaterThanOrEqual(0.48 - 1e-6);
        // Gone at the edge away from the block.
        const nearTop = (topY + bottomY) / 2 < 675;
        expect(alphaAt(scrim, 540, nearTop ? 1349 : 0)).toBeLessThan(0.01);
      });
    }

    it('caps the density and leaves the upper half of the photo untouched', () => {
      for (const locale of ['de-DE', 'de-AT'] as const) {
        for (const tone of ['dunkel', 'mittel', 'hell'] as const) {
          const props = composeSharepic(
            {
              locale,
              slides: [
                {
                  background: { kind: 'foto', filename: 'zug.jpg', textSeite: 'unten' },
                  position: 'mitte',
                  align: 'links',
                  logo: false,
                  items: [{ type: 'headline', lines: ['Bahn', 'für alle'] }],
                },
              ],
            },
            { ...options, photoTone: () => tone }
          ).slides[0]!;
          const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
          for (const stop of scrim.fillGradient!.stops) {
            const a = Number(/,([\d.]+)\)$/.exec(stop.color)![1]);
            expect(a).toBeLessThanOrEqual(SCRIM_MAX);
          }
          // The upper ~40 % of the photo stays as shot.
          for (const y of [0, 200, 400, 540]) expect(alphaAt(scrim, 540, y)).toBe(0);
        }
      }
    });

    it('defaults to 0.48 and goes denser for hell than dunkel', () => {
      const level = (s: Scrim) => alphaAt(s, s.x, s.y);
      const spec = quote('links', 'de-DE');
      const base = scrimOf(spec);
      const dunkel = scrimOf(spec, { ...options, photoTone: () => 'dunkel' });
      const hell = scrimOf(spec, { ...options, photoTone: () => 'hell' });
      const none = scrimOf(spec, { ...options, photoTone: () => null });
      const dense = (s: Scrim) => alphaAt(s, 70 + 1080 * 0.52 + 48, 600);
      expect(dense(base)).toBeCloseTo(0.48, 2);
      expect(dense(none)).toBeCloseTo(0.48, 2);
      expect(dense(dunkel)).toBeCloseTo(0.4, 2);
      expect(dense(hell)).toBeCloseTo(0.55, 2);
      expect(level(hell)).toBeGreaterThan(level(dunkel));
    });

    it('hands the photo and the text side to photoTone', () => {
      const calls: [string, string][] = [];
      scrimOf(quote('rechts', 'de-DE'), {
        ...options,
        photoTone: (f, side) => (calls.push([f, side]), null),
      });
      expect(calls).toEqual([['zug.jpg', 'rechts']]);
    });
  });

  it('lets set_text reword a question', () => {
    const spec: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        farbe([{ type: 'frage', text: 'Alt?', von: 'SZ' }], {
          background: { kind: 'farbe', color: 'tanne' },
        }),
      ],
    };
    const { spec: next } = applySharepicPatch(spec, [{ op: 'set_text', item: 0, text: 'Neu?' }]);
    expect(next.slides[0]!.items[0]).toMatchObject({ type: 'frage', text: 'Neu?', von: 'SZ' });
  });
});

describe.each(['de-DE', 'de-AT'] as const)('composeSharepic — space use (%s)', (locale) => {
  const one = (slide: SharepicSlide, opts: ComposeOptions = options) =>
    composeSharepic(carousel(locale, [slide]), opts).slides[0]!;
  const shortBlock: SharepicSlide['items'] = [
    { type: 'dachzeile', text: 'Kurz' },
    { type: 'button', text: 'Mehr' },
  ];
  const { stoerer: _stoerer, ...fotoWithoutStoerer } = fotoSlide;
  const fotoShort = (position: SharepicSlide['position']): SharepicSlide => ({
    ...fotoWithoutStoerer,
    position,
    logo: false,
    items: shortBlock,
  });

  it('grows a short quote above 52', () => {
    const props = one(
      farbe([{ type: 'zitat', text: 'Gutes Leben ist kein Luxus.', name: 'Sabine Moser' }])
    );
    const q = props.additionalTexts.find((t) => t.text.includes('Gutes Leben'));
    expect(q!.fontSize).toBeGreaterThan(52);
    // A quote alone on a colour is the hero of the slide, capped at 120.
    expect(q!.fontSize).toBeLessThanOrEqual(120);
  });

  it('measures a bold compound in a quote at the bold face', () => {
    const word = 'Klimaschutzverantwortungsgemeinschaft';
    const boldWider = (text: string, size: number, _family: string, style: string) =>
      text.length * size * (style === 'bold' ? 0.6 : 0.5);
    const props = one(
      farbe([{ type: 'zitat', text: `Das ist **${word}** heute.`, name: 'Sabine Moser' }]),
      { ...options, measure: boldWider }
    );
    const q = props.additionalTexts.find((t) => t.text.includes(word))!;
    expect(boldWider(word, q.fontSize, '', 'bold')).toBeLessThanOrEqual(940);
  });

  it('centres a short block on a colour slide despite position oben', () => {
    const props = one(farbe(shortBlock, { position: 'oben' }));
    const top = props.additionalTexts[0]!.y;
    const button = props.pillBadgeInstances[0]!;
    const centre = (top + button.y + 44 + 2 * 18) / 2;
    expect(Math.abs(centre - 1350 / 2)).toBeLessThan(40);
  });

  it('keeps position oben on a photo slide and unten on a colour slide', () => {
    expect(one(fotoShort('oben')).additionalTexts[0]!.y).toBeLessThan(150);
    const bottom = one(farbe(shortBlock, { position: 'unten' }));
    expect(bottom.pillBadgeInstances[0]!.y).toBeGreaterThan(1350 - 70 - 120);
  });

  it('grows a headline-only slide', () => {
    const props = one(farbe([{ type: 'headline', lines: ['Ja'] }]));
    expect(byId(props.additionalTexts, 'headline-0')!.fontSize).toBeGreaterThan(190);
  });

  it('never puts a logo on a full-bleed photo', () => {
    const props = one({ ...fotoWithoutStoerer, logo: true });
    expect(props.assetInstances.some((a) => a.id === 'sc-logo')).toBe(false);
  });

  it('keeps a short headline clear of the logo', () => {
    for (const position of ['oben', 'mitte', 'unten'] as const) {
      const props = one(
        farbe(
          [
            { type: 'headline', lines: ['Ja', 'Nein'] },
            { type: 'text', text: 'Kurz.' },
          ],
          { position, logo: true }
        )
      );
      const logo = props.assetInstances[0]!;
      // x/y is the centre; heights as in LOGO of the composer.
      const logoHeight = locale === 'de-AT' ? (210 * 1239) / 1410 : 110;
      const logoTop = logo.y - logoHeight / 2;
      const bottom = Math.max(
        ...props.additionalTexts
          .filter((t) => t.id.includes('headline'))
          .map((t) => t.y + t.text.split('\n').length * t.fontSize * (t.lineHeight ?? 1))
      );
      expect(bottom, `${locale} ${position}`).toBeLessThanOrEqual(logoTop);
    }
  });

  it('grows the text of a short headline + text + button slide above 42', () => {
    const props = one(
      farbe([
        { type: 'headline', lines: ['Mach mit', 'bei uns!'] },
        { type: 'text', text: 'Gemeinsam für Klimaschutz vor Ort.' },
        { type: 'button', text: 'Jetzt dabei sein' },
      ])
    );
    expect(byId(props.additionalTexts, '-text')!.fontSize).toBeGreaterThan(42);
  });
});

describe('balancedWrap', () => {
  it('keeps the line count but leaves no lone word', () => {
    const text = 'Daria pflegt ihre Mutter. Jeden Tag.';
    expect(wrapWords(text, 31, (l) => l.length).at(-1)).toBe('Tag.');
    expect(balancedWrap(text, 31, (l) => l.length)).toEqual([
      'Daria pflegt ihre',
      'Mutter. Jeden Tag.',
    ]);
  });
});

describe('wrapWords', () => {
  it('breaks greedily and keeps a long word on its own line', () => {
    expect(wrapWords('aa bb cc', 5, (l) => l.length)).toEqual(['aa bb', 'cc']);
    expect(wrapWords('Donaudampfschiff ab', 5, (l) => l.length)).toEqual([
      'Donaudampfschiff',
      'ab',
    ]);
  });
});

describe('applySharepicPatch', () => {
  it('applies text, headline, layout changes and removes from the back', () => {
    const { spec: patched, skipped } = applySharepicPatch(foto, [
      { op: 'set_text', item: 2, text: 'Mitmachen' },
      { op: 'set_headline', lines: ['Mach mit!'] },
      { op: 'remove_item', item: 1 },
      { op: 'set_text_side', textSeite: 'links' },
      { op: 'remove_extra', extra: 'stoerer' },
    ]);
    expect(skipped).toEqual([]);
    const spec = patched.slides[0]!;
    expect(spec.items.map((i) => i.type)).toEqual(['headline', 'button']);
    expect(spec.items[0]).toEqual({ type: 'headline', lines: ['Mach mit!'] });
    expect(spec.items[1]).toMatchObject({ text: 'Mitmachen' });
    expect(spec.background).toMatchObject({ textSeite: 'links' });
    expect(spec.stoerer).toBeUndefined();
  });

  it('clears every extra by name', () => {
    const full: SharepicSpec = {
      locale: 'de-DE',
      slides: [
        {
          ...fotoSlide,
          datum: { weekday: 'Do', date: '14.11.', time: '19 Uhr' },
          ort: { lines: ['Café Linde'] },
          quelle: 'LKÖ',
        },
      ],
    };
    const { spec, skipped } = applySharepicPatch(full, [
      { op: 'remove_extra', extra: 'stoerer' },
      { op: 'remove_extra', extra: 'datum' },
      { op: 'remove_extra', extra: 'ort' },
      { op: 'remove_extra', extra: 'quelle' },
      { op: 'remove_extra', extra: 'logo' },
    ]);
    expect(skipped).toEqual([]);
    const slide = spec.slides[0]!;
    expect(slide.stoerer).toBeUndefined();
    expect(slide.datum).toBeUndefined();
    expect(slide.ort).toBeUndefined();
    expect(slide.quelle).toBeUndefined();
    expect(slide.logo).toBe(false);
  });

  it('addresses carousel slides by index and skips a slide that does not exist', () => {
    const deck: SharepicSpec = { locale: 'de-DE', slides: [fotoSlide, fotoSlide] };
    const { spec, skipped } = applySharepicPatch(deck, [
      { op: 'use_color', color: 'tanne', slide: 1 },
      { op: 'remove_extra', extra: 'logo', slide: 5 },
    ]);
    expect(spec.slides[0]!.background.kind).toBe('foto');
    expect(spec.slides[1]!.background).toEqual({ kind: 'farbe', color: 'tanne' });
    expect(skipped).toHaveLength(1);
  });

  it('keeps a headline accent when set_text rewords it', () => {
    const { spec } = applySharepicPatch(foto, [
      { op: 'set_text', item: 0, text: 'Mach mit\nbei uns' },
    ]);
    expect(spec.slides[0]!.items[0]).toEqual({
      type: 'headline',
      lines: ['Mach mit', 'bei uns'],
      akzent: 1,
    });
    const shorter = applySharepicPatch(foto, [{ op: 'set_text', item: 0, text: 'Mach mit' }]);
    expect(shorter.spec.slides[0]!.items[0]).toEqual({ type: 'headline', lines: ['Mach mit'] });
  });

  it('turns an item into the headline only on a slide without one', () => {
    const deck: SharepicSpec = {
      locale: 'de-AT',
      slides: [
        {
          background: { kind: 'farbe', color: 'dunkelgruen' },
          position: 'mitte',
          align: 'zentriert',
          items: [{ type: 'absatz', text: 'Vermögen ist ungleich verteilt.' }],
          logo: false,
        },
      ],
    };
    const { spec } = applySharepicPatch(deck, [
      { op: 'set_headline', item: 0, lines: ['Vermögen ist', '==ungleich==', 'verteilt.'] },
    ]);
    expect(spec.slides[0]!.items[0]).toMatchObject({ type: 'headline' });
    const { skipped } = applySharepicPatch(foto, [
      { op: 'set_headline', item: 1, lines: ['Zweite Headline'] },
    ]);
    expect(skipped).toHaveLength(1);
  });

  it('skips ops that do not fit and drops a patch that breaks the spec', () => {
    const { skipped } = applySharepicPatch(foto, [
      { op: 'set_text', item: 9, text: 'x' },
      { op: 'set_color', color: 'tanne' },
    ]);
    expect(skipped).toHaveLength(2);
    const broken = applySharepicPatch(foto, [
      { op: 'set_headline', lines: ['a', 'b', 'c', 'd', 'e', 'f'] },
    ]);
    expect(broken.spec).toBe(foto);
  });
});

describe('composer imports', () => {
  it('stays free of React, Konva and Iconify runtime so it can run anywhere', () => {
    const dir = import.meta.dirname;
    for (const file of readdirSync(dir).filter(
      (f) => f.endsWith('.ts') && !f.includes('.vitest.')
    )) {
      const source = readFileSync(path.join(dir, file), 'utf8');
      expect(source, file).not.toMatch(/from ['"](react|react-konva|konva|@iconify\/react)['"]/);
    }
  });
});

describe.each(['de-DE', 'de-AT'] as const)('composeSharepic — KI label (%s)', (locale) => {
  type Box = { id: string; x: number; y: number; w: number; h: number };
  const items: SharepicSlide['items'] = [
    { type: 'headline', lines: ['Mach mit', 'bei uns!'], akzent: 1 },
    { type: 'text', text: 'Gemeinsam für Klimaschutz vor Ort.' },
    { type: 'button', text: 'Jetzt dabei sein' },
  ];
  const farbeSlide = (extra: Partial<SharepicSlide> = {}): SharepicSlide => ({
    background: { kind: 'farbe', color: 'tanne' },
    position: 'unten',
    align: 'links',
    logo: false,
    items,
    ...extra,
  });
  const LONG_QUELLE =
    'Statistisches Bundesamt, Erhebung zu Einkommen und Lebensbedingungen, Wiesbaden 2025, eigene Berechnung';
  const cases: Record<string, SharepicSpec> = {
    farbe: { locale, slides: [farbeSlide()] },
    'farbe + logo': { locale, slides: [farbeSlide({ logo: true })] },
    'farbe + logo zentriert': {
      locale,
      slides: [farbeSlide({ logo: true, align: 'zentriert' })],
    },
    'farbe + quelle': { locale, slides: [farbeSlide({ quelle: 'Statistik Austria 2025' })] },
    'farbe + zwei Zeilen quelle': {
      locale,
      slides: [
        farbeSlide({
          quelle:
            'Statistisches Bundesamt, Erhebung zu Einkommen und Lebensbedingungen, Wiesbaden 2025, eigene Berechnung',
        }),
      ],
    },
    'zentriert + logo + lange quelle': {
      locale,
      slides: [farbeSlide({ logo: true, align: 'zentriert', quelle: LONG_QUELLE })],
    },
    'farbe + ort + quelle + logo': {
      locale,
      slides: [
        farbeSlide({ ort: { lines: ['Rathaus', 'Hauptplatz 1'] }, quelle: 'Stadt', logo: true }),
      ],
    },
    foto: { locale, slides: [{ ...fotoSlide, logo: true }] },
    'foto-unten': {
      locale,
      slides: [
        {
          ...fotoSlide,
          background: { kind: 'foto-unten', filename: 'wind.jpg', panelColor: 'tanne' },
          logo: true,
        },
      ],
    },
    carousel: {
      locale,
      slides: [farbeSlide({ logo: true }), farbeSlide({ quelle: 'Quelle X', logo: true })],
    },
    'diagramm + quelle + logo': {
      locale,
      slides: [
        farbeSlide({
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
          logo: true,
        }),
      ],
    },
  };

  const textBox = (t: {
    id: string;
    text: string;
    x: number;
    y: number;
    width: number;
    fontSize: number;
    lineHeight?: number;
  }): Box => {
    const wrapped = Math.max(1, Math.ceil(measure(t.text, t.fontSize) / t.width));
    const lines = Math.max(wrapped, t.text.split('\n').length);
    return {
      id: t.id,
      x: t.x,
      y: t.y,
      w: Math.min(t.width, measure(t.text, t.fontSize)),
      h: lines * t.fontSize * (t.lineHeight ?? 1.2),
    };
  };
  const others = (slide: ReturnType<typeof one>): Box[] => [
    ...slide.additionalTexts.filter((t) => t.id !== 'sc-ki-label').map(textBox),
    ...slide.assetInstances.map((a) => {
      const size = a.scale * 150;
      const h = locale === 'de-AT' ? (size * 1239) / 1410 : size;
      return { id: a.id, x: a.x - size / 2, y: a.y - h / 2, w: size, h };
    }),
    ...Object.entries(slide.iconStates).map(([id, s]) => ({
      id,
      x: s.x - (s.scale * 120) / 2,
      y: s.y - (s.scale * 120) / 2,
      w: s.scale * 120,
      h: s.scale * 120,
    })),
    ...slide.circleBadgeInstances.map((c) => ({
      id: c.id,
      x: c.x - c.radius,
      y: c.y - c.radius,
      w: 2 * c.radius,
      h: 2 * c.radius,
    })),
    ...slide.pillBadgeInstances.map((p) => ({
      id: p.id,
      x: p.x,
      y: p.y,
      w: measure(p.text, p.fontSize) + 2 * p.paddingX,
      h: p.fontSize + 2 * p.paddingY,
    })),
    ...slide.shapeInstances
      .filter((s) => s.id.endsWith('-card'))
      .map((s) => ({
        id: s.id,
        x: s.x - s.width / 2,
        y: s.y - s.height / 2,
        w: s.width,
        h: s.height,
      })),
    ...slide.chartInstances.map((c) => ({
      id: c.id,
      x: c.x,
      y: c.y,
      w: c.width * c.scale,
      h: c.height * c.scale,
    })),
  ];
  const overlaps = (a: Box, b: Box) =>
    a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  it('adds the server-side pill as plain editor elements, bottom-left', () => {
    const slide = one(cases.farbe!);
    const text = slide.additionalTexts.find((t) => t.id === 'sc-ki-label')!;
    const plate = slide.shapeInstances.find((s) => s.id === 'sc-ki-label-bg')!;
    expect(text).toMatchObject({
      text: 'KI-Generiert mit dem Grünerator',
      fontFamily: 'PT Sans',
      fontStyle: 'bold',
      fontSize: 27,
      fill: '#FFFFFF',
      opacity: 0.85,
    });
    // Lighter plate on dark ground; light ground keeps the server label's 0.55.
    expect(plate).toMatchObject({
      type: 'rounded-rect',
      fill: '#2B2B2B',
      opacity: 0.4,
      cornerRadius: 8,
      height: 45,
    });
    expect(plate.x - plate.width / 2).toBe(11);
    expect(plate.y + plate.height / 2).toBe(1350 - 11);
    expect(text.x).toBe(11 + 16);
    expect(slide.layerOrder.indexOf('sc-ki-label-bg')).toBeLessThan(
      slide.layerOrder.indexOf('sc-ki-label')
    );
  });

  it('keeps the plate left of a centred logo, with a realistic text width', () => {
    const real = (text: string, size: number) => text.length * size * 0.46;
    const slide = composeSharepic(cases['farbe + logo zentriert']!, { ...options, measure: real })
      .slides[0]!;
    const plate = slide.shapeInstances.find((s) => s.id === 'sc-ki-label-bg')!;
    const logo = slide.assetInstances[0]!;
    const logoW = logo.scale * 150;
    const logoBottom = logo.y + ((locale === 'de-AT' ? 1239 / 1410 : 1) * logoW) / 2;
    // AT's logo sits above the plate; DE's shares its rows, so it must clear it sideways.
    if (logoBottom > plate.y - plate.height / 2) {
      expect(plate.x + plate.width / 2).toBeLessThan(logo.x - logoW / 2);
    }
  });

  it('wraps a long source above the label', () => {
    const slide = one(cases['farbe + zwei Zeilen quelle']!);
    const quelle = slide.additionalTexts.find((t) => t.id === 'sc-quelle')!;
    const plate = slide.shapeInstances.find((s) => s.id === 'sc-ki-label-bg')!;
    expect(measure(quelle.text, 24)).toBeGreaterThan(quelle.width);
    expect(quelle.y + 2 * 24 * 1.2).toBeLessThanOrEqual(plate.y - plate.height / 2);
  });

  it('keeps a long source clear of a centred logo and the label', () => {
    const slide = one(cases['zentriert + logo + lange quelle']!);
    const quelle = slide.additionalTexts.find((t) => t.id === 'sc-quelle')!;
    const logo = slide.assetInstances[0]!;
    const plate = slide.shapeInstances.find((s) => s.id === 'sc-ki-label-bg')!;
    // AT centres its logo, DE sets it bottom-left: the source stays beside it.
    if (locale === 'de-AT') {
      expect(quelle.x + quelle.width).toBeLessThan(logo.x - (logo.scale * 150) / 2);
    } else {
      expect(quelle.x).toBeGreaterThan(logo.x + (logo.scale * 150) / 2);
    }
    const lines = Math.ceil(measure(quelle.text, 24) / quelle.width);
    expect(lines).toBeGreaterThan(2);
    expect(quelle.y + lines * 24 * 1.2).toBeLessThanOrEqual(plate.y - plate.height / 2);
  });

  it('keeps the text block above a three-line source at position unten', () => {
    const slide = one({
      locale,
      slides: [farbeSlide({ position: 'unten', quelle: `${LONG_QUELLE}, ${LONG_QUELLE}` })],
    });
    const quelle = slide.additionalTexts.find((t) => t.id === 'sc-quelle')!;
    expect(Math.ceil(measure(quelle.text, 24) / quelle.width)).toBeGreaterThanOrEqual(3);
    const blockBottom = Math.max(
      ...others(slide)
        .filter((b) => b.id !== 'sc-quelle')
        .map((b) => b.y + b.h)
    );
    expect(blockBottom).toBeLessThanOrEqual(quelle.y);
  });

  it('shortens or omits the label on request', () => {
    const short = composeSharepic(cases.farbe!, { ...options, kiLabel: 'short' }).slides[0]!;
    expect(short.additionalTexts.find((t) => t.id === 'sc-ki-label')!.text).toBe('KI-Generiert');
    const none = composeSharepic(cases.farbe!, { ...options, kiLabel: 'none' }).slides[0]!;
    expect(none.additionalTexts.some((t) => t.id === 'sc-ki-label')).toBe(false);
    expect(none.shapeInstances.some((s) => s.id === 'sc-ki-label-bg')).toBe(false);
    expect(none.layerOrder).not.toContain('sc-ki-label');
  });

  it.each(Object.keys(cases))('keeps the label clear of everything else: %s', (name) => {
    for (const slide of composeSharepic(cases[name]!, options).slides) {
      const plate = slide.shapeInstances.find((s) => s.id === 'sc-ki-label-bg')!;
      const label: Box = {
        id: 'label',
        x: plate.x - plate.width / 2,
        y: plate.y - plate.height / 2,
        w: plate.width,
        h: plate.height,
      };
      const hit = others(slide).filter((box) => overlaps(label, box));
      expect(
        hit.map((b) => b.id),
        `${locale} ${name}`
      ).toEqual([]);
    }
  });

  it('sets a date circle without a date as weekday and time only', () => {
    const props = one({
      locale: 'de-DE',
      slides: [
        {
          background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'mint' },
          position: 'oben',
          align: 'links',
          items: [{ type: 'headline', lines: ['Fest im Park'] }],
          datum: { weekday: 'Sa', time: '10 Uhr' },
          logo: false,
        },
      ],
    });
    const lines = props.circleBadgeInstances[0]!.textLines.map((l) => l.text);
    expect(lines).toEqual(['Sa', '10 Uhr']);
  });

  describe('date circle colour (DE)', () => {
    const circleOn = (
      background: SharepicSlide['background'],
      locale: 'de-DE' | 'de-AT' = 'de-DE'
    ) =>
      one({
        locale,
        slides: [
          {
            background,
            position: 'oben',
            align: 'links',
            items: [{ type: 'headline', lines: ['Fest im Park'] }],
            datum: { weekday: 'Sa', date: '10.10.', time: '10 Uhr' },
            logo: false,
          },
        ],
      }).circleBadgeInstances[0]!;
    const panel = (panelColor: 'tanne' | 'dunkeltanne' | 'grasgruen' | 'mint' | 'hellgrau') =>
      ({ kind: 'foto-oben', filename: 'wind.jpg', panelColor }) as const;

    it.each(['mint', 'hellgrau', 'grasgruen'] as const)(
      'is Tanne with white text on a light or grass-green panel (%s)',
      (c) => {
        const circle = circleOn(panel(c));
        expect(circle.backgroundColor).toBe('#005538');
        expect(circle.textColor).toBe('#ffffff');
      }
    );

    it.each(['tanne', 'dunkeltanne'] as const)(
      'is grass green with Tanne text on a dark panel (%s)',
      (c) => {
        const circle = circleOn(panel(c));
        expect(circle.backgroundColor).toBe(SHAREPIC_COLOR_HEX.grasgruen);
        expect(circle.textColor).toBe('#005538');
      }
    );

    it('is grass green on a photo slide, and never sky blue', () => {
      const circle = circleOn({ kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' });
      expect(circle.backgroundColor).toBe(SHAREPIC_COLOR_HEX.grasgruen);
      expect(circle.backgroundColor.toLowerCase()).not.toBe('#0ba1dd');
    });

    it('leaves the AT circle alone', () => {
      const circle = circleOn(
        { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'dunkelgruen' },
        'de-AT'
      );
      expect(circle.backgroundColor).toBe(getBrandTheme('de-AT').colors.stoerer);
    });
  });

  describe('hellgrau', () => {
    it('is a light DE surface with dark ink', () => {
      const props = one({
        locale: 'de-DE',
        slides: [
          {
            background: { kind: 'farbe', color: 'hellgrau' },
            position: 'oben',
            align: 'links',
            items: [{ type: 'headline', lines: ['Fest im Park'] }],
            logo: false,
          },
        ],
      });
      expect(SHAREPIC_COLOR_HEX.hellgrau).toBe('#F2F2F2');
      expect(props.backgroundColor).toBe('#F2F2F2');
      expect(byId(props.additionalTexts, 'headline-0')!.fill).toBe(SHAREPIC_COLOR_HEX.dunkeltanne);
    });

    it('is offered to DE and not to AT', () => {
      expect(SHAREPIC_LOCALE_COLORS['de-DE']).toContain('hellgrau');
      expect(SHAREPIC_LOCALE_COLORS['de-AT']).not.toContain('hellgrau');
    });
  });

  describe('scrim colour', () => {
    it.each(['de-DE', 'de-AT'] as const)('is near-black, DE a very dark Tanne (%s)', (locale) => {
      const props = composeSharepic(
        { locale, slides: [{ ...fotoSlide, stoerer: undefined }] },
        options
      ).slides[0]!;
      const scrim = props.shapeInstances.find((s) => s.id === 'sc-scrim')!;
      for (const stop of scrim.fillGradient!.stops) {
        const [r, g, b] = stop.color
          .match(/\d+(?:\.\d+)?/g)!
          .slice(0, 3)
          .map(Number);
        if (locale === 'de-AT') expect(Math.max(r!, g!, b!), stop.color).toBeLessThan(20);
        else expect([r, g, b], stop.color).toEqual([6, 37, 26]);
      }
    });
  });

  describe('photo strip', () => {
    const strip = (kind: 'foto-oben' | 'foto-unten'): SharepicSlide => ({
      background: { kind, filename: 'wind.jpg', panelColor: 'mint' },
      position: kind === 'foto-oben' ? 'oben' : 'mitte',
      align: 'links',
      items: [{ type: 'headline', lines: ['Fest im Park'] }],
      logo: false,
    });

    it('centres the picture in the strip above the panel (foto-oben)', () => {
      const props = one({ locale: 'de-DE', slides: [strip('foto-oben')] });
      // The picture is cover-fitted to the whole canvas (centre 675); the
      // strip's centre is 270, so the picture moves up by the difference.
      expect(props.imageScale).toBe(1);
      expect(props.imageOffset).toEqual({ x: 0, y: 270 - 675 });
    });

    it('centres the picture in the visible lower area (foto-unten)', () => {
      const props = one({ locale: 'de-DE', slides: [strip('foto-unten')] });
      expect(props.imageScale).toBe(1);
      expect(props.imageOffset).toEqual({ x: 0, y: 1080 - 675 });
    });

    it('leaves a full-bleed photo where the editor puts it', () => {
      const props = one(foto);
      expect(props.imageOffset).toBeUndefined();
      expect(props.imageScale).toBeUndefined();
    });
  });

  describe.each(['de-DE', 'de-AT'] as const)('headline next to the date circle (%s)', (loc) => {
    it('shrinks until the longest word fits the narrowed column, and the block starts below it', () => {
      const props = one({
        locale: loc,
        slides: [
          {
            background: { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'mint' },
            position: 'oben',
            align: 'links',
            items: [
              { type: 'headline', lines: ['Gemeinschaftsgarten', 'ist eröffnet!'] },
              { type: 'text', text: 'Kommt vorbei und bringt Hunger mit.' },
            ],
            datum: { weekday: 'Sa', date: '10.10.', time: '10 Uhr' },
            logo: false,
          },
        ],
      });
      const heads = props.additionalTexts.filter((t) => /headline-\d+$/.test(t.id));
      expect(heads.length).toBeGreaterThan(0);
      for (const head of heads) {
        const widest = Math.max(...head.text.split(/\s+/).map((w) => measure(w, head.fontSize)));
        expect(widest, head.text).toBeLessThanOrEqual(head.width);
      }
      const last = heads.at(-1)!;
      const body = byId(props.additionalTexts, '-text')!;
      expect(body.y).toBeGreaterThanOrEqual(last.y + last.fontSize * 0.9);
    });
  });
});

describe.each(['de-DE', 'de-AT'] as const)('composeSharepic — diagramm (%s)', (locale) => {
  const chartSlide = (
    chart: Partial<Extract<SharepicSlide['items'][number], { type: 'diagramm' }>> = {},
    extra: Partial<SharepicSlide> = {}
  ): SharepicSpec => ({
    locale,
    slides: [
      {
        background: { kind: 'farbe', color: locale === 'de-AT' ? 'dunkelgruen' : 'tanne' },
        position: 'mitte',
        align: 'zentriert',
        logo: true,
        items: [
          { type: 'headline', lines: ['Frauen im', 'Bundestag'] },
          {
            type: 'diagramm',
            art: 'donut',
            werte: [
              { name: 'A', wert: 31 },
              { name: 'B', wert: 42 },
            ],
            einheit: '%',
            titel: 'Anteil Frauen',
            ...chart,
          },
          { type: 'frage', text: 'Was ist hier eigentlich los?' },
        ],
        ...extra,
      },
    ],
  });

  it('sets the chart on a white card in the column, in the locale palette', () => {
    const slide = one(chartSlide());
    const chart = slide.chartInstances[0]!;
    const card = slide.shapeInstances.find((s) => s.id === 'sc-1-diagramm-card')!;
    expect(chart.id).toBe('chart-sc-1-diagramm');
    expect(chart.chartType).toBe('donut');
    expect(card.fill).toBe('#FFFFFF');
    // Inside the card, below its title.
    const title = slide.additionalTexts.find((t) => t.id === 'sc-1-diagramm-titel')!;
    expect(chart.x).toBeGreaterThanOrEqual(card.x - card.width / 2);
    expect(chart.x + chart.width * chart.scale).toBeLessThanOrEqual(card.x + card.width / 2);
    expect(chart.y).toBeGreaterThan(title.y);
    expect(chart.y + chart.height * chart.scale).toBeLessThanOrEqual(card.y + card.height / 2);
    // Reading order: headline, card, question.
    const frage = slide.additionalTexts.find((t) => t.id.startsWith('sc-2-frage'))!;
    expect(frage.y).toBeGreaterThan(card.y + card.height / 2);
    const primary = locale === 'de-AT' ? getBrandTheme('de-AT').colors.primary : '#00261A';
    expect(chart.colors[0]).toBe(primary);
    expect(chart.unit).toBe('%');
  });

  it('adds the rest of a share to 100 %, in grey', () => {
    const chart = one(chartSlide()).chartInstances[0]!;
    expect(chart.data.at(-1)).toEqual({ name: 'Rest', value: 27 });
    expect(chart.colors.at(-1)).toBe('#C8C8C7');
    const whole = one(
      chartSlide({
        werte: [
          { name: 'A', wert: 60 },
          { name: 'B', wert: 40 },
        ],
      })
    ).chartInstances[0]!;
    expect(whole.data.map((d) => d.name)).toEqual(['A', 'B']);
  });

  it('gives every part of a five-part pie its own colour, the rest grey', () => {
    const werte = ['A', 'B', 'C', 'D', 'E'].map((name) => ({ name, wert: 19 }));
    const chart = one(chartSlide({ werte })).chartInstances[0]!;
    expect(chart.data).toHaveLength(6);
    expect(new Set(chart.colors).size).toBe(6);
    expect(chart.colors.at(-1)).toBe('#C8C8C7');
    expect(chart.showLegend).toBe(true);
  });

  it('shrinks the chart before the text when the slide is full', () => {
    const roomy = one(chartSlide()).chartInstances[0]!;
    const full = one(
      chartSlide(
        {},
        {
          position: 'unten',
          ort: { lines: ['Rathaus Musterstadt', 'Hauptplatz 1'] },
          quelle: 'Statistisches Amt Musterstadt, Erhebung 2025, eigene Berechnung',
          stoerer: { text: 'Neu!' },
          items: [
            { type: 'dachzeile', text: 'Gleichstellung' },
            { type: 'headline', lines: ['Frauen im', 'Bundestag', 'seit 1983'] },
            {
              type: 'diagramm',
              art: 'balken',
              werte: [
                { name: '1983', wert: 10 },
                { name: '2025', wert: 32 },
              ],
              titel: 'Anteil Frauen in Prozent',
            },
            { type: 'absatz', text: 'Noch immer ist nur ein Drittel der Abgeordneten weiblich.' },
          ],
        }
      )
    );
    const chart = full.chartInstances[0]!;
    expect(chart.height * chart.scale).toBeLessThan(roomy.height * roomy.scale);
    // The chart is down to its minimum before the text gives way; the
    // paragraph stays readable (AT's base is 70, a crammed slide shrinks it).
    expect(chart.height * chart.scale).toBe(240);
    const absatz = full.additionalTexts.find((t) => t.id.startsWith('sc-3-absatz'))!;
    expect(absatz.fontSize).toBeGreaterThanOrEqual(48);
  });
});
