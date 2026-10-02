import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

import { type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { applySharepicPatch } from './applySharepicPatch';
import {
  balancedWrap,
  type ComposeOptions,
  composeSharepic,
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
    expect(plain).toMatchObject({ fontFamily: theme.fonts.headline, align: 'center' });
    expect(accent).toMatchObject({
      fontFamily: theme.fonts.quoteEmphasis,
      fill: theme.colors.accent,
    });
    expect(props.assetInstances[0]).toMatchObject({ assetId: 'gruene-at-logo-weiss', x: 540 });
    // The logo (1410 × 1239, longer side 240) ends well clear of the bottom edge.
    const logo = props.assetInstances[0]!;
    expect(logo.y + (240 * 1239) / 1410 / 2).toBeLessThanOrEqual(1350 - 90);
  });

  it('puts lists on a white card and narrows the column next to a date circle', () => {
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
    expect(head.width).toBe(560);
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
        farbe([{ type: 'headline', lines: ['Mobilität für ==alle==,', 'egal wo.'], akzent: 0 }], {
          background: { kind: 'farbe', color: 'grasgruen' },
        }),
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
    expect(panel.fillGradient?.stops.at(-1)?.color).toMatch(/,0\)$/);
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
  it.each(['de-DE', 'de-AT'] as const)('renders the speaker name for %s', (locale) => {
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
});

describe.each(['de-DE', 'de-AT'] as const)('composeSharepic — space use (%s)', (locale) => {
  const one = (slide: SharepicSlide, opts: ComposeOptions = options) =>
    composeSharepic(carousel(locale, [slide]), opts).slides[0]!;
  const shortBlock: SharepicSlide['items'] = [
    { type: 'dachzeile', text: 'Kurz' },
    { type: 'button', text: 'Mehr' },
  ];
  const fotoShort = (position: SharepicSlide['position']): SharepicSlide => ({
    ...fotoSlide,
    position,
    stoerer: undefined,
    logo: false,
    items: shortBlock,
  });

  it('grows a short quote above 52', () => {
    const props = one(
      farbe([{ type: 'zitat', text: 'Gutes Leben ist kein Luxus.', name: 'Sabine Moser' }])
    );
    const q = props.additionalTexts.find((t) => t.text.includes('Gutes Leben'));
    expect(q!.fontSize).toBeGreaterThan(52);
    expect(q!.fontSize).toBeLessThanOrEqual(78);
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
