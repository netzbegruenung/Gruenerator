import {
  getCanvasFormat,
  isPrintFormat,
  printGeometry,
  type PrintRect,
} from '@ggraphic/editor/formats/index';
import { ASSET_TARGET_SIZE, type AssetInstance } from '@ggraphic/editor/utils/canvasAssets';
import { printSpecSchema, type PrintSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';

import { layoutTextLines, LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { composePrint, PRINT_IMPRESSUM_ID, type ComposedPrint } from './composePrint';

import type { AdditionalText } from '@ggraphic/editor/configs/types';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const compose = (spec: unknown) => composePrint(printSpecSchema.parse(spec), { measure });

type Locale = PrintSpec['locale'];
const CARD_FORMATS = ['print-visitenkarte-quer', 'print-visitenkarte-hoch'] as const;
const LOCALES: Locale[] = ['de-DE', 'de-AT'];

const karte = {
  name: 'Maximilian Mustermann',
  funktion: 'Referent für Kampagnenarbeit',
  organisation: 'BÜNDNIS 90/DIE GRÜNEN',
  adresse: 'Platz vor dem Neuen Tor 1, 10115 Berlin',
  telefon: '030 28442-194',
  mobil: '0177 1234 567',
  mail: 'max.mustermann@gruene.de',
  web: 'gruene.de',
};
const cardSpec = (locale: Locale, format: string, slots: object = karte, stil?: string) => ({
  locale,
  produkt: 'visitenkarte',
  variante: 'visitenkarte',
  format,
  impressum: null,
  slots,
  ...(stil ? { stil } : {}),
});

const plakat = {
  dachzeile: 'Diskussionsabend zum Thema:',
  headline: 'Gute Arbeit braucht faire Löhne',
  akzent: 'faire Löhne',
  subline: 'Komm vorbei und rede mit.',
  web: 'gruene-bergedorf.de',
  absender: 'Grüne Hamburg-Bergedorf',
};
const impressum = (locale: Locale) =>
  locale === 'de-AT'
    ? { art: 'impressum', medieninhaber: 'Die Grünen Wien', anschrift: 'Lindengasse 40, 1070 Wien' }
    : { art: 'visdp', name: 'Erika Musterfrau', anschrift: 'Musterstraße 1, 12345 Musterstadt' };
const typoSpec = (locale: Locale, slots: object = plakat, format = 'print-a3-hoch') => ({
  locale,
  produkt: 'plakat',
  variante: 'typo',
  format,
  impressum: impressum(locale),
  slots,
});

/** Artwork aspect (longer side first irrelevant: width × height of the file). */
const ASPECT: Record<string, { w: number; h: number }> = {
  'gruene-de-logo': { w: 710, h: 379 },
  'gruene-de-logo-weiss': { w: 710, h: 379 },
  'gruene-de-logo-schwarz': { w: 710, h: 379 },
  'gruene-at-logo-weiss': { w: 1410, h: 1239 },
  'gruene-at-logo-gruen': { w: 1410, h: 1239 },
};

function textBox(t: AdditionalText): PrintRect {
  const lines = layoutTextLines(
    measure,
    t.text,
    t.width,
    t.fontSize,
    t.fontFamily,
    t.fontStyle ?? 'normal',
    t.accent ?? null
  );
  const height = lines.length * t.fontSize * (t.lineHeight ?? 1.2);
  // Konva turns around x/y: at −90° the box runs up from y and right from x.
  if (t.rotation === -90) return { x: t.x, y: t.y - t.width, width: height, height: t.width };
  return { x: t.x, y: t.y, width: t.width, height };
}

function assetBox(a: AssetInstance): PrintRect {
  const art = ASPECT[a.assetId]!;
  const long = a.scale * ASSET_TARGET_SIZE;
  const w = art.w >= art.h ? long : (long * art.w) / art.h;
  const h = art.h >= art.w ? long : (long * art.h) / art.w;
  return { x: a.x - w / 2, y: a.y - h / 2, width: w, height: h };
}

const inside = (box: PrintRect, area: PrintRect) =>
  box.x >= area.x - 0.5 &&
  box.y >= area.y - 0.5 &&
  box.x + box.width <= area.x + area.width + 0.5 &&
  box.y + box.height <= area.y + area.height + 0.5;

function expectInSafeZone(result: ComposedPrint) {
  const format = getCanvasFormat(result.format)!;
  if (!isPrintFormat(format)) throw new Error('not print');
  const { safe } = printGeometry(format);
  for (const slide of result.slides) {
    for (const t of slide.additionalTexts) {
      expect(inside(textBox(t), safe), `${t.id} ${JSON.stringify(textBox(t))}`).toBe(true);
    }
    for (const a of slide.assetInstances.filter((x) => x.assetId.includes('logo'))) {
      expect(inside(assetBox(a), safe), a.id).toBe(true);
    }
  }
}

function expectBackgroundCoversBleed(result: ComposedPrint, colors: string[]) {
  result.slides.forEach((slide, i) => {
    // The page background paints the whole canvas, bleed included.
    expect(slide.backgroundMode).toBe('color');
    expect(slide.hasBackgroundImage).toBe(false);
    expect(slide.backgroundColor).toBe(colors[i]);
  });
}

const ids = (result: ComposedPrint, page: number) => [
  ...result.slides[page]!.additionalTexts.map((t) => t.id),
  ...result.slides[page]!.assetInstances.map((a) => a.id),
];
const textOf = (result: ComposedPrint, page: number, id: string) =>
  result.slides[page]!.additionalTexts.find((t) => t.id === id);
const sunflowers = (result: ComposedPrint) =>
  result.slides.flatMap((s) => s.assetInstances).filter((a) => a.assetId.startsWith('sunflower'));

describe('composePrint: business card', () => {
  for (const locale of LOCALES) {
    for (const format of CARD_FORMATS) {
      describe(`${locale} ${format}`, () => {
        const result = compose(cardSpec(locale, format));
        const isAt = locale === 'de-AT';
        const info = isAt ? 1 : 0;

        it('has two pages in the card format', () => {
          expect(result.format).toBe(format);
          expect(result.templateType).toBe(isAt ? 'freeform-at' : 'freeform');
          expect(result.slides).toHaveLength(2);
        });

        it('carries every element on its side', () => {
          expect(ids(result, info)).toEqual(
            expect.arrayContaining([
              'pr-name',
              'pr-funktion',
              'pr-organisation',
              'pr-adresse',
              'pr-kontakt',
            ])
          );
          expect(textOf(result, info, 'pr-kontakt')?.text).toBe(
            '**T** 030 28442-194\n**M** 0177 1234 567\n**E** max.mustermann@gruene.de\n**W** gruene.de'
          );
          const logo = result.slides[isAt ? 0 : 0]!.assetInstances.find((a) => a.id === 'pr-logo');
          expect(logo?.assetId).toBe(isAt ? 'gruene-at-logo-weiss' : 'gruene-de-logo');
        });

        it('keeps text and logo inside the safe zone', () => expectInSafeZone(result));

        it('covers the bleed with the ground', () => {
          const green = getBrandTheme(locale).colors.primary;
          expectBackgroundCoversBleed(
            result,
            isAt ? [green, '#FFFFFF'] : [SHAREPIC_COLOR_HEX.tanne, SHAREPIC_COLOR_HEX.tanne]
          );
        });

        if (isAt) {
          it('has no sunflower and centres the back', () => {
            expect(sunflowers(result)).toEqual([]);
            expect(result.slides[0]!.additionalTexts).toEqual([]);
            for (const t of result.slides[1]!.additionalTexts) expect(t.align).toBe('center');
          });
        } else {
          it('puts a large cut yellow sunflower on the back', () => {
            const [blume] = sunflowers(result);
            expect(blume?.assetId).toBe('sunflower');
            expect(result.slides[1]!.layerOrder).toEqual(['pr-blume']);
            const size = blume!.scale * ASSET_TARGET_SIZE;
            const canvas = getCanvasFormat(format)!;
            expect(size).toBeGreaterThan(Math.min(canvas.width, canvas.height) * 0.8);
          });
        }
      });
    }
  }

  it('creates no element for an absent optional slot', () => {
    for (const locale of LOCALES) {
      const result = compose(cardSpec(locale, 'print-visitenkarte-quer', { name: 'Kim Grün' }));
      const page = locale === 'de-AT' ? 1 : 0;
      expect(result.slides[page]!.additionalTexts.map((t) => t.id)).toEqual(['pr-name']);
    }
  });

  it('keeps long content inside the safe zone', () => {
    const long = {
      name: 'Maximiliane-Friederike Schwarzenberger-Kleinschmidt',
      funktion: 'Sprecherin für Klimaschutz, Energiepolitik und nachhaltige Stadtentwicklung',
      organisation: 'Fraktion BÜNDNIS 90/DIE GRÜNEN im Abgeordnetenhaus von Berlin',
      adresse: 'Niederkirchnerstraße 5, 10117 Berlin',
      telefon: '+49 30 2325-2400',
      mobil: '+49 170 1234567',
      mail: 'maximiliane.schwarzenberger@gruene-fraktion.berlin',
      web: 'www.gruene-fraktion.berlin',
    };
    for (const locale of LOCALES) {
      for (const format of CARD_FORMATS) expectInSafeZone(compose(cardSpec(locale, format, long)));
    }
  });
});

describe('composePrint: business card colourways', () => {
  const tanne = SHAREPIC_COLOR_HEX.tanne;
  const at = getBrandTheme('de-AT').colors;
  const STILE: Record<Locale, Record<string, { grounds: string[]; logo: string }>> = {
    'de-DE': {
      klee: { grounds: ['#008939', '#008939'], logo: 'gruene-de-logo' },
      sand: { grounds: ['#F5F1E9', tanne], logo: 'gruene-de-logo-schwarz' },
      schlicht: { grounds: [tanne, tanne], logo: 'gruene-de-logo' },
    },
    'de-AT': {
      hellgruen: { grounds: [at.secondary, '#FFFFFF'], logo: 'gruene-at-logo-weiss' },
      weiss: { grounds: ['#FFFFFF', at.primary], logo: 'gruene-at-logo-gruen' },
      gruen: { grounds: [at.primary, at.primary], logo: 'gruene-at-logo-weiss' },
    },
  };

  for (const locale of LOCALES) {
    for (const [stil, look] of Object.entries(STILE[locale])) {
      for (const format of CARD_FORMATS) {
        it(`${locale} ${stil} ${format}: grounds, logo and safe zone`, () => {
          const result = compose(cardSpec(locale, format, karte, stil));
          expectBackgroundCoversBleed(result, look.grounds);
          const logo = result.slides[0]!.assetInstances.find((a) => a.id === 'pr-logo');
          expect(logo?.assetId).toBe(look.logo);
          expectInSafeZone(result);
        });
      }
    }
  }

  it('DE: never a sunflower on Sand, and schlicht carries only the word mark on the back', () => {
    for (const format of CARD_FORMATS) {
      const sand = compose(cardSpec('de-DE', format, karte, 'sand'));
      expect(sand.slides[0]!.assetInstances.map((a) => a.assetId)).not.toContain('sunflower');
      expect(textOf(sand, 0, 'pr-name')?.fill).toBe(tanne);
      const schlicht = compose(cardSpec('de-DE', format, karte, 'schlicht'));
      expect(sunflowers(schlicht)).toEqual([]);
      expect(schlicht.slides[1]!.assetInstances.map((a) => a.assetId)).toEqual(['gruene-de-logo']);
    }
  });

  it('AT: type on a green back turns white', () => {
    for (const stil of ['weiss', 'gruen']) {
      const result = compose(cardSpec('de-AT', 'print-visitenkarte-quer', karte, stil));
      for (const t of result.slides[1]!.additionalTexts) expect(t.fill).toBe('#FFFFFF');
    }
  });
});

describe('composePrint: upright card', () => {
  const bottomOf = (t: AdditionalText) => {
    const box = textBox(t);
    return box.y + box.height;
  };

  it('DE: the head at the top, the contact group down above the logo', () => {
    const result = compose(cardSpec('de-DE', 'print-visitenkarte-hoch'));
    const { safe: inner } = printGeometry(getCanvasFormat('print-visitenkarte-hoch') as never);
    const name = textOf(result, 0, 'pr-name')!;
    const kontakt = textOf(result, 0, 'pr-kontakt')!;
    const logo = result.slides[0]!.assetInstances.find((a) => a.id === 'pr-logo')!;
    expect(name.y - inner.y).toBeLessThan(inner.height * 0.15);
    expect(bottomOf(kontakt)).toBeLessThan(assetBox(logo).y);
    expect(bottomOf(kontakt)).toBeGreaterThan(inner.y + inner.height * 0.6);
  });

  it('AT: the name in the upper third, the contact group low on the back', () => {
    const result = compose(cardSpec('de-AT', 'print-visitenkarte-hoch'));
    const { safe } = printGeometry(getCanvasFormat('print-visitenkarte-hoch') as never);
    const name = textOf(result, 1, 'pr-name')!;
    const kontakt = textOf(result, 1, 'pr-kontakt')!;
    expect(name.y).toBeLessThan(safe.y + safe.height / 3);
    expect(bottomOf(kontakt)).toBeGreaterThan(safe.y + safe.height * 0.8);
    expect(textOf(result, 1, 'pr-funktion')!.y).toBeGreaterThan(bottomOf(name));
  });
});

describe('composePrint: typo poster', () => {
  for (const locale of LOCALES) {
    describe(locale, () => {
      const result = compose(typoSpec(locale));
      const isAt = locale === 'de-AT';
      const headline = textOf(result, 0, 'pr-headline')!;

      it('has one A3 page', () => {
        expect(result.format).toBe('print-a3-hoch');
        expect(result.slides).toHaveLength(1);
      });

      it('carries every element', () => {
        expect(ids(result, 0)).toEqual(
          expect.arrayContaining([
            'pr-dachzeile',
            'pr-headline',
            'pr-subline',
            'pr-web',
            'pr-absender',
            'pr-logo',
            PRINT_IMPRESSUM_ID,
          ])
        );
      });

      it('keeps text and logo inside the safe zone', () => expectInSafeZone(result));

      it('covers the bleed with the ground', () =>
        expectBackgroundCoversBleed(result, [
          isAt ? getBrandTheme('de-AT').colors.primary : SHAREPIC_COLOR_HEX.tanne,
        ]));

      it('marks the accent words by colour, never with a marker box', () => {
        expect(headline.text).toBe('Gute Arbeit braucht ==faire Löhne==');
        expect(headline.marker).toBeUndefined();
        expect(result.slides[0]!.shapeInstances).toEqual([]);
        expect(headline.accent).toEqual(
          isAt
            ? { fill: '#FCEC00', fontFamily: 'Vollkorn', fontStyle: 'bold italic' }
            : { fill: LIME }
        );
      });

      it('turns the imprint −90° into the left margin', () => {
        const imprint = textOf(result, 0, PRINT_IMPRESSUM_ID)!;
        expect(imprint.rotation).toBe(-90);
        expect(imprint.text).toBe(
          isAt
            ? 'Impressum: Die Grünen Wien, Lindengasse 40, 1070 Wien'
            : 'V.i.S.d.P.: Erika Musterfrau, Musterstraße 1, 12345 Musterstadt'
        );
        const box = textBox(imprint);
        const { trim } = printGeometry(getCanvasFormat('print-a3-hoch') as never);
        expect(box.x).toBeGreaterThan(trim.x);
        expect(box.x + box.width).toBeLessThan(headline.x);
      });

      it(isAt ? 'has no sunflower' : 'cuts a yellow sunflower top-right', () => {
        const flowers = sunflowers(result);
        if (isAt) {
          expect(flowers).toEqual([]);
        } else {
          expect(flowers.map((a) => a.assetId)).toEqual(['sunflower']);
          const canvas = getCanvasFormat('print-a3-hoch')!;
          const size = flowers[0]!.scale * ASSET_TARGET_SIZE;
          expect(flowers[0]!.x + size / 2).toBeGreaterThan(canvas.width);
          expect(flowers[0]!.y - size / 2).toBeLessThan(0);
          // Behind the text.
          expect(result.slides[0]!.layerOrder[0]).toBe('pr-blume');
        }
      });
    });
  }

  it('creates no element for an absent optional slot and leaves an unmatched accent plain', () => {
    for (const locale of LOCALES) {
      const result = compose(typoSpec(locale, { headline: 'Mehr Bus', akzent: 'Bahn' }));
      expect(result.slides[0]!.additionalTexts.map((t) => t.id)).toEqual([
        'pr-headline',
        PRINT_IMPRESSUM_ID,
      ]);
      expect(textOf(result, 0, 'pr-headline')!.text).toBe('Mehr Bus');
    }
  });

  it('keeps every DE text clear of the sunflower, on A3 and A4', () => {
    const long = {
      ...plakat,
      dachzeile: 'Einladung zum offenen Diskussionsabend mit unseren Abgeordneten zum Thema:',
      headline: 'Bezahlbare Mieten, saubere Luft und ein Bus, der auch abends noch fährt',
      akzent: 'saubere Luft',
    };
    for (const slots of [plakat, long]) {
      for (const format of ['print-a3-hoch', 'print-a4-hoch']) {
        const result = compose(typoSpec('de-DE', slots, format));
        const blume = result.slides[0]!.assetInstances.find((a) => a.id === 'pr-blume')!;
        const size = blume.scale * ASSET_TARGET_SIZE;
        // The flower's full bounding box, transparent corners included.
        const flower = { x: blume.x - size / 2, y: blume.y - size / 2, width: size, height: size };
        for (const t of result.slides[0]!.additionalTexts) {
          const box = textBox(t);
          const apart =
            box.x + box.width <= flower.x ||
            box.y >= flower.y + flower.height ||
            box.x >= flower.x + flower.width ||
            box.y + box.height <= flower.y;
          expect(apart, `${format} ${t.id}`).toBe(true);
        }
        expectInSafeZone(result);
      }
    }
  });

  it('shrinks a long headline into the page, also on A4', () => {
    const long = {
      ...plakat,
      headline: 'Bezahlbare Mieten, saubere Luft und ein Bus, der auch abends noch fährt',
      akzent: 'saubere Luft',
      subline: 'Gemeinsam machen wir unsere Stadt lebenswert – für alle, die hier wohnen.',
    };
    for (const locale of LOCALES) {
      for (const format of ['print-a3-hoch', 'print-a4-hoch']) {
        const result = compose(typoSpec(locale, long, format));
        expectInSafeZone(result);
        const sub = textBox(textOf(result, 0, 'pr-subline')!);
        const web = textBox(textOf(result, 0, 'pr-web')!);
        expect(sub.y + sub.height).toBeLessThanOrEqual(web.y);
      }
    }
  });
});

describe('composePrint: DE photo posters', () => {
  const visdp = impressum('de-DE');
  const kandidat = {
    name: 'Maximiliane Musterfrau',
    subline: 'Für Musterstadt in den Landtag',
    stoerer: 'Hier steht der Störertext.',
    web: 'gruene-musterstadt.de',
    foto: 'vorlage:person.jpg',
  };
  const thema = {
    dachzeile: 'Hier steht eine',
    headline: 'Themen-Headline für bezahlbare Mieten',
    akzent: 'Mieten',
    stoerer: 'Jetzt mitmachen!',
    web: 'gruene.de',
    foto: 'wind-unsplash.jpg',
  };
  const leute = [
    {
      rolle: 'Es diskutieren:',
      name: 'Dominik Lorenzen',
      funktion: 'Wirtschaftspolitischer Sprecher',
    },
    { name: 'Florian Giese', funktion: 'Onkel Emma – unverpackt bio einkaufen' },
    { rolle: 'Begrüßung und Moderation:', name: 'Jennifer Jasberg', funktion: 'Vorsitzende' },
  ];
  const veranstaltung = {
    dachzeile: 'Diskussionsabend zum Thema:',
    headline: 'Wie wird unsere Stadt klimafest?',
    akzent: 'klimafest?',
    subline: 'Mit Gästen aus Politik und Praxis.',
    datum: 'Freitag 27.10. 19 Uhr',
    mitwirkende: leute,
    ort: 'Kulturforum Serrahn, Serrahnstraße 1',
    web: 'gruene-bergedorf.de',
    foto: 'wind-unsplash.jpg',
  };
  const spec = (variante: string, format: string, slots: object, stil?: string) => ({
    locale: 'de-DE',
    produkt: 'plakat',
    variante,
    format,
    impressum: visdp,
    slots,
    ...(stil ? { stil } : {}),
  });
  const FOTO_FORMATS = ['print-a1-hoch', 'print-a3-hoch', 'print-grossflaeche', 'print-citylight'];
  const cases: Array<[string, ReturnType<typeof spec>]> = [];
  for (const format of FOTO_FORMATS) {
    for (const stil of [undefined, 'tanne', 'klee']) {
      cases.push([
        `kandidat ${format} ${stil ?? 'foto'}`,
        spec('kandidat', format, kandidat, stil),
      ]);
      cases.push([`thema ${format} ${stil ?? 'foto'}`, spec('thema', format, thema, stil)]);
    }
  }
  for (const format of ['print-a3-hoch', 'print-a3-quer', 'print-a1-hoch', 'print-a1-quer']) {
    cases.push([`veranstaltung ${format}`, spec('veranstaltung', format, veranstaltung)]);
    const portraits = {
      ...veranstaltung,
      mitwirkende: leute.map((m) => ({ ...m, foto: 'vorlage:p.jpg' })),
    };
    cases.push([
      `veranstaltung ${format} portraits`,
      spec('veranstaltung', format, portraits, 'portraits'),
    ]);
  }

  const circleBox = (c: { x: number; y: number; radius: number }): PrintRect => ({
    x: c.x - c.radius,
    y: c.y - c.radius,
    width: 2 * c.radius,
    height: 2 * c.radius,
  });
  const overlaps = (a: PrintRect, b: PrintRect) =>
    a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  for (const [name, s] of cases) {
    describe(name, () => {
      const result = compose(s);
      const slide = result.slides[0]!;
      const format = getCanvasFormat(s.format)!;
      const { trim, safe } = printGeometry(format as never);

      it('has no fade: every plane is one flat colour with hard edges', () => {
        expect(slide.shapeInstances.filter((x) => x.fillGradient)).toEqual([]);
      });

      it('lays one page out within the safe zone', () => {
        expect(result.slides).toHaveLength(1);
        expectInSafeZone(result);
        for (const c of slide.circleBadgeInstances) {
          expect(inside(circleBox(c), safe), c.id).toBe(true);
        }
      });

      it('keeps the Störer off every text', () => {
        for (const c of slide.circleBadgeInstances) {
          expect(c.backgroundColor).toBe('#0BA1DD');
          expect(c.textColor).toBe('#F5F1E9');
          for (const t of slide.additionalTexts) {
            expect(overlaps(circleBox(c), textBox(t)), `${c.id} / ${t.id}`).toBe(false);
          }
        }
      });

      it('cuts the sunflower at an edge', () => {
        const [blume] = sunflowers(result);
        expect(blume?.assetId).toBe('sunflower');
        const size = blume!.scale * ASSET_TARGET_SIZE;
        const box = { x: blume!.x - size / 2, y: blume!.y - size / 2, width: size, height: size };
        expect(inside(box, trim)).toBe(false);
      });

      it('carries the V.i.S.d.P. turned in the margin', () => {
        expect(textOf(result, 0, PRINT_IMPRESSUM_ID)?.rotation).toBe(-90);
      });
    });
  }

  it('puts the photo behind a framed motif and covers the rest with the ground', () => {
    const full = compose(spec('kandidat', 'print-a1-hoch', kandidat)).slides[0]!;
    expect(full.backgroundMode).toBe('image');
    expect(full.currentImageSrc).toBe('/api/sharepic-vorlagen/assets/person.jpg');
    expect(full.shapeInstances.filter((s) => s.id.startsWith('pr-grund'))).toEqual([]);
    for (const [stil, ground] of [
      ['tanne', SHAREPIC_COLOR_HEX.tanne],
      ['klee', '#008939'],
    ] as const) {
      const framed = compose(spec('thema', 'print-a1-hoch', thema, stil)).slides[0]!;
      expect(framed.currentImageSrc).toBe('/api/image-picker/stock-image/wind-unsplash.jpg');
      const grund = framed.shapeInstances.filter((s) => s.id.startsWith('pr-grund'));
      expect(grund.length).toBeGreaterThan(0);
      for (const g of grund) expect(g.fill).toBe(ground);
    }
  });

  it('takes the photo route the caller gives', () => {
    const result = composePrint(
      printSpecSchema.parse(spec('kandidat', 'print-a1-hoch', kandidat)),
      {
        measure,
        photoSrc: (foto) => `blob:${foto}`,
      }
    );
    expect(result.slides[0]!.currentImageSrc).toBe('blob:vorlage:person.jpg');
  });

  it('keeps every text of the billboard off its joins', () => {
    for (const stil of [undefined, 'tanne', 'klee']) {
      for (const variante of ['kandidat', 'thema'] as const) {
        const result = compose(
          spec(variante, 'print-grossflaeche', variante === 'kandidat' ? kandidat : thema, stil)
        );
        const { trim } = printGeometry(getCanvasFormat('print-grossflaeche') as never);
        const midX = trim.x + trim.width / 2;
        const midY = trim.y + trim.height / 2;
        const boxes = [
          ...result.slides[0]!.additionalTexts.map((t) => [t.id, textBox(t)] as const),
          ...result.slides[0]!.circleBadgeInstances.map((c) => [c.id, circleBox(c)] as const),
        ];
        for (const [id, b] of boxes) {
          const crossesX = b.x < midX && b.x + b.width > midX;
          const crossesY = b.y < midY && b.y + b.height > midY;
          expect(crossesX || crossesY, `${variante} ${stil ?? 'foto'} ${id}`).toBe(false);
        }
      }
    }
  });

  it('shows each speaker; the portraits variant beside a round picture', () => {
    for (const format of ['print-a3-hoch', 'print-a3-quer']) {
      const v1 = compose(spec('veranstaltung', format, veranstaltung)).slides[0]!;
      expect(v1.additionalTexts.filter((t) => t.id.startsWith('pr-person-'))).toHaveLength(3);
      expect(v1.circleBadgeInstances.map((c) => c.id)).toEqual(['pr-datum']);
      const portraits = {
        ...veranstaltung,
        mitwirkende: leute.map((m) => ({ ...m, foto: 'vorlage:p.jpg' })),
      };
      const v2 = compose(spec('veranstaltung', format, portraits, 'portraits')).slides[0]!;
      expect(v2.backgroundMode).toBe('color');
      expect(v2.userImageInstances.map((i) => i.mask)).toEqual(['kreis', 'kreis', 'kreis']);
    }
  });
});

describe('composePrint: AT posters', () => {
  const slots = {
    headline: 'Das ist eine dreizeilige Headline.',
    akzent: 'dreizeilige',
    subline: 'Das ist eine Subline.',
    stoerer: 'Hier steht ein Störer.',
    foto: 'wind-unsplash.jpg',
  };
  const spec = (variante: string, format: string, stil?: string) => ({
    locale: 'de-AT',
    produkt: 'plakat',
    variante,
    format,
    impressum: impressum('de-AT'),
    slots,
    ...(stil ? { stil } : {}),
  });
  const at = getBrandTheme('de-AT').colors;
  const cases: Array<[string, ReturnType<typeof spec>]> = [];
  for (const format of ['print-a1-hoch', 'print-a1-quer', 'print-a3-hoch', 'print-a3-quer']) {
    cases.push([`geteilt ${format}`, spec('geteilt', format)]);
    cases.push([`overlay ${format}`, spec('overlay', format)]);
    cases.push([`overlay ${format} hellgruen`, spec('overlay', format, 'hellgruen')]);
    cases.push([`person ${format}`, spec('person', format)]);
  }

  for (const [name, s] of cases) {
    describe(name, () => {
      const result = compose(s);
      const slide = result.slides[0]!;

      it('lays one page out within the safe zone, with the white logo and no sunflower', () => {
        expect(result.templateType).toBe('freeform-at');
        expectInSafeZone(result);
        expect(slide.assetInstances.map((a) => a.assetId)).toEqual(['gruene-at-logo-weiss']);
        expect(sunflowers(result)).toEqual([]);
      });

      it('has no fade: every plane is one flat colour with hard edges', () => {
        expect(slide.shapeInstances.filter((x) => x.fillGradient)).toEqual([]);
      });

      it('sets the accent in yellow Vollkorn and the Störer in Magenta', () => {
        expect(textOf(result, 0, 'pr-headline')?.accent).toEqual({
          fill: at.accent,
          fontFamily: 'Vollkorn',
          fontStyle: 'bold italic',
        });
        const [stoerer] = slide.circleBadgeInstances;
        expect(stoerer?.backgroundColor).toBe(at.stoerer);
        expect(stoerer?.textColor).toBe('#FFFFFF');
      });

      it('keeps the Störer and the logo off the text', () => {
        const boxes = slide.additionalTexts.map((t) => textBox(t));
        const [stoerer] = slide.circleBadgeInstances;
        const logo = assetBox(slide.assetInstances[0]!);
        const circle = {
          x: stoerer!.x - stoerer!.radius,
          y: stoerer!.y - stoerer!.radius,
          width: 2 * stoerer!.radius,
          height: 2 * stoerer!.radius,
        };
        for (const b of boxes) {
          for (const other of [circle, logo]) {
            const apart =
              b.x + b.width <= other.x ||
              other.x + other.width <= b.x ||
              b.y + b.height <= other.y ||
              other.y + other.height <= b.y;
            expect(apart).toBe(true);
          }
        }
      });
    });
  }

  it('puts the overlay box, 0.6 × the short side, in Dunkelgrün or flat Hellgrün', () => {
    const { trim } = printGeometry(getCanvasFormat('print-a1-hoch') as never);
    for (const [stil, fill] of [
      [undefined, at.primary],
      ['hellgruen', at.secondary],
    ] as const) {
      const box = compose(spec('overlay', 'print-a1-hoch', stil)).slides[0]!.shapeInstances.find(
        (sh) => sh.id === 'pr-box'
      )!;
      expect(box.fill).toBe(fill);
      expect(box.fillGradient).toBeUndefined();
      expect(box.width).toBeCloseTo(0.6 * Math.min(trim.width, trim.height));
      expect(box.width).toBe(box.height);
    }
  });

  it('measures the accent word in its wider face, so it never breaks', () => {
    // Vollkorn twice as wide as Gotham in this stand-in measure.
    const wide = (text: string, size: number, family: string) =>
      text.length * size * (family === 'Vollkorn' ? 1 : 0.5);
    const result = composePrint(printSpecSchema.parse(spec('geteilt', 'print-a3-quer')), {
      measure: wide,
    });
    const h = textOf(result, 0, 'pr-headline')!;
    expect(wide('dreizeilige', h.fontSize, 'Vollkorn')).toBeLessThanOrEqual(h.width);
  });
});

describe('composePrint: flyer, letterhead, newspaper', () => {
  const kontakt = {
    organisation: 'BÜNDNIS 90/DIE GRÜNEN Musterstadt',
    name: 'Kim Grün',
    adresse: 'Musterstraße 1, 12345 Musterstadt',
    telefon: '0123 456789',
    mail: 'ov@beispiel.de',
    web: 'gruene-musterstadt.de',
  };
  const absatz = 'Ein Absatz mit ein paar Sätzen zum Thema, der auf dem Flyer gut lesbar bleibt.';
  const flyer = {
    locale: 'de-DE',
    produkt: 'flyer',
    variante: 'flyer-falz',
    format: 'print-flyer-dinlang',
    impressum: impressum('de-DE'),
    slots: {
      headline: 'Mehr Grün für Musterstadt',
      akzent: 'Grün',
      subline: 'Was wir vorhaben.',
      abschnitte: Array.from({ length: 5 }, (_, i) => ({
        ueberschrift: `Teil ${i + 1}`,
        text: absatz,
      })),
      liste: { ueberschrift: 'Unsere Ziele', punkte: ['Radwege', 'Bäume', 'Busse'] },
      kontakt,
      stoerer: 'Jetzt Mitglied werden!',
      web: 'gruene.de',
      fotos: ['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg'],
    },
  };
  const a6 = (format: string) => ({
    locale: 'de-AT',
    produkt: 'flyer',
    variante: 'flyer-a6',
    format,
    impressum: impressum('de-AT'),
    slots: {
      headline: 'Das ist eine dreizeilige Headline.',
      akzent: 'Headline.',
      stoerer: 'Hier steht ein Störer.',
      foto: 'a.jpg',
      rueckseite: {
        headline: 'Worum es geht',
        abschnitte: [
          { ueberschrift: 'Eins', text: absatz },
          { ueberschrift: 'Zwei', text: absatz },
        ],
        foto: 'b.jpg',
      },
    },
  });
  const brief = {
    locale: 'de-DE',
    produkt: 'briefbogen',
    variante: 'briefbogen',
    format: 'print-briefbogen-a4',
    impressum: null,
    slots: kontakt,
  };
  const artikel = Array.from({ length: 12 }, () => absatz).join('\n\n');
  const zeitung = {
    locale: 'de-AT',
    produkt: 'zeitung',
    variante: 'gemeindezeitung',
    format: 'print-zeitung-a4',
    impressum: impressum('de-AT'),
    slots: {
      titel: 'Grünes Blatt',
      ausgabe: 'Ausgabe 02/26',
      stoerer: 'Neu!',
      foto: 'a.jpg',
      teaser: Array.from({ length: 6 }, (_, i) => ({ headline: `Thema ${i + 1}`, text: 'Kurz.' })),
      artikel: [
        { headline: 'Ein Artikel', vorspann: 'Vorspann.', text: artikel, foto: 'b.jpg' },
        { headline: 'Noch einer', text: artikel },
      ],
      kontakt,
    },
  };

  const imprintPages = (result: ComposedPrint) =>
    result.slides.flatMap((s, i) =>
      s.additionalTexts.some((t) => t.id === PRINT_IMPRESSUM_ID) ? [i] : []
    );

  it.each([
    ['flyer DIN lang', flyer, 2, [0]],
    ['flyer A6 hoch', a6('print-a6-hoch'), 2, [1]],
    ['flyer A6 quer', a6('print-a6-quer'), 2, [1]],
    ['letterhead', brief, 2, []],
    ['newspaper', zeitung, 4, [3]],
  ] as const)(
    '%s: its pages, the imprint where the format wants it, inside the safe zone, no fades',
    (_, s, pages, imprint) => {
      const result = compose(s);
      expect(result.slides).toHaveLength(pages);
      expect(imprintPages(result)).toEqual(imprint);
      const format = getCanvasFormat(result.format)!;
      expect(format.print?.seiten).toBe(pages);
      expectInSafeZone(result);
      for (const slide of result.slides) {
        expect(slide.shapeInstances.filter((x) => x.fillGradient)).toEqual([]);
      }
    }
  );

  it('puts the folded flyer’s imprint along the fold to the title panel', () => {
    const result = compose(flyer);
    const { trim } = printGeometry(getCanvasFormat('print-flyer-dinlang') as never);
    const box = textBox(textOf(result, 0, PRINT_IMPRESSUM_ID)!);
    const fold = trim.x + (197 / 297) * trim.width;
    expect(box.x + box.width).toBeLessThan(fold);
    expect(box.x).toBeGreaterThan(fold - 0.06 * trim.width);
  });

  it('keeps every flyer photo replaceable and in the sunflower’s CD colour', () => {
    const result = compose(flyer);
    const fotos = result.slides.flatMap((s) => s.userImageInstances.map((i) => i.fileName));
    expect(fotos.sort()).toEqual(['a.jpg', 'b.jpg', 'c.jpg', 'd.jpg']);
    expect(sunflowers(result).every((a) => a.assetId === 'sunflower')).toBe(true);
  });

  it('sets the articles in three balanced columns', () => {
    const result = compose(zeitung);
    for (const page of [1, 2]) {
      const spalten = result.slides[page]!.additionalTexts.filter((t) =>
        t.id.startsWith('pr-spalte-')
      );
      expect(spalten.map((t) => t.id)).toEqual(['pr-spalte-1', 'pr-spalte-2', 'pr-spalte-3']);
      const lines = spalten.map((t) => t.text.split('\n').length);
      expect(Math.max(...lines) - Math.min(...lines)).toBeLessThanOrEqual(2);
    }
    // Nothing of a fitting article is lost.
    const words = (text: string) => text.replace(/\s+/g, ' ').trim();
    const set = result.slides[2]!.additionalTexts.filter((t) => t.id.startsWith('pr-spalte-'))
      .map((t) => t.text)
      .join(' ');
    expect(words(set).length).toBe(words(artikel.replace(/\n\s*\n/g, ' ')).length);
  });

  it('gives the letterhead its band on the first page only', () => {
    const result = compose(brief);
    expect(result.slides[0]!.shapeInstances.map((s) => s.id)).toEqual(['pr-band']);
    expect(result.slides[1]!.shapeInstances).toEqual([]);
    expect(result.slides[0]!.assetInstances.map((a) => a.assetId)).toEqual(['gruene-de-logo']);
  });
});
