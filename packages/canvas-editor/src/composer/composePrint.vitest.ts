import { printSpecSchema, type PrintSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { getBrandTheme } from '../brand/theme';
import { getCanvasFormat, isPrintFormat, printGeometry, type PrintRect } from '../formats';
import { ASSET_TARGET_SIZE, type AssetInstance } from '../utils/canvasAssets';

import { layoutTextLines, LIME, SHAREPIC_COLOR_HEX } from './chromeParts';
import { composePrint, PRINT_IMPRESSUM_ID, type ComposedPrint } from './composePrint';

import type { AdditionalText } from '../configs/types';

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
