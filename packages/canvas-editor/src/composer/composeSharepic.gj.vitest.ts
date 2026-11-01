import {
  SHAREPIC_BRAND_COLORS,
  sharepicSpecSchema,
  type SharepicColor,
  type SharepicSpec,
} from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic, SHAREPIC_COLOR_HEX } from './composeSharepic';

const photoSrc = (f: string) => f;

const gj = (locale: 'de-DE' | 'de-AT', slides: unknown[]): SharepicSpec =>
  sharepicSpecSchema.parse({ locale, brand: 'gruene-jugend', slides });

const colourSlide = (color: SharepicColor, extra: Record<string, unknown> = {}) => ({
  background: { kind: 'farbe', color },
  position: 'oben',
  align: 'links',
  items: [{ type: 'headline', lines: ['Schluss mit', 'Praktika!'] }],
  logo: true,
  ...extra,
});

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
}
const contrast = (a: string, b: string) => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi! + 0.05) / (lo! + 0.05);
};

describe('GRÜNE JUGEND Deutschland', () => {
  it('opens in its own editor page and sets its word mark bottom-left', () => {
    const out = composeSharepic(gj('de-DE', [colourSlide('limette')]), { photoSrc });
    expect(out.templateType).toBe('freeform-gj');
    const logo = out.slides[0]!.assetInstances.find((a) => a.id === 'sc-logo');
    expect(logo?.assetId).toBe('gj-logo-schwarz');
    expect(logo!.x).toBeLessThan(540);
  });

  it('sets the word mark light green on black', () => {
    const out = composeSharepic(gj('de-DE', [colourSlide('schwarz')]), { photoSrc });
    expect(out.slides[0]!.assetInstances.find((a) => a.id === 'sc-logo')?.assetId).toBe(
      'gj-logo-hellgruen'
    );
  });

  it('sets line boxes square, the first on white and the rest on light green', () => {
    const out = composeSharepic(
      gj('de-DE', [
        {
          background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' },
          position: 'unten',
          align: 'links',
          zeilenboxen: true,
          items: [{ type: 'headline', lines: ['Wir gehen', 'auf die Straße', 'für Klimageld!'] }],
          logo: false,
        },
      ]),
      { photoSrc }
    );
    const boxes = out.slides[0]!.pillBadgeInstances;
    expect(boxes.map((b) => b.backgroundColor)).toEqual(['#FFFFFF', '#C7FF7A', '#C7FF7A']);
    expect(boxes.every((b) => b.cornerRadius === 0 && b.textColor === '#000000')).toBe(true);
  });

  it('sets the accent line on white on light green, and on light green elsewhere', () => {
    const boxOf = (color: SharepicColor) => {
      const out = composeSharepic(
        gj('de-DE', [
          {
            ...colourSlide(color),
            items: [{ type: 'headline', lines: ['Schluss mit', 'Praktika!'], akzent: 1 }],
          },
        ]),
        { photoSrc }
      );
      return out.slides[0]!.additionalTexts.find((t) => t.marker)?.marker?.fill ?? null;
    };
    expect(boxOf('limette')).toBe('#FFFFFF');
    expect(boxOf('lavendel')).toBe('#C7FF7A');
  });

  it('draws its Störer as a burst', () => {
    const out = composeSharepic(
      gj('de-DE', [colourSlide('apricot', { stoerer: { text: '!!!' } })]),
      {
        photoSrc,
      }
    );
    expect(out.slides[0]!.circleBadgeInstances.find((c) => c.id === 'sc-stoerer')?.outline).toBe(
      'burst'
    );
  });

  it('never sets the sunflower', () => {
    expect(
      sharepicSpecSchema.safeParse({
        locale: 'de-DE',
        brand: 'gruene-jugend',
        slides: [colourSlide('limette', { blume: true })],
      }).success
    ).toBe(false);
  });
});

describe('Grüne Jugend Österreich', () => {
  it('sets headlines in capitals and no logo', () => {
    const out = composeSharepic(gj('de-AT', [colourSlide('waldgruen')]), { photoSrc });
    expect(out.templateType).toBe('freeform-gj-at');
    const texts = out.slides[0]!.additionalTexts.map((t) => t.text).join(' ');
    expect(texts).toMatch(/SCHLUSS\sMIT\sPRAKTIKA!/);
    expect(out.slides[0]!.assetInstances.some((a) => a.id === 'sc-logo')).toBe(false);
  });

  it('puts a card on a black edge with a hard shadow', () => {
    const out = composeSharepic(
      gj('de-AT', [
        {
          ...colourSlide('waldgruen'),
          items: [
            { type: 'headline', lines: ['Programm'] },
            { type: 'liste', items: ['Workshop', 'Theorie', 'Theater'] },
          ],
        },
      ]),
      { photoSrc }
    );
    const shapes = out.slides[0]!.shapeInstances;
    const card = shapes.find((s) => s.id.endsWith('-card'))!;
    const edge = shapes.find((s) => s.id === `${card.id}-rand`)!;
    expect(card.cornerRadius).toBe(0);
    expect(edge).toMatchObject({ fill: '#000000', shadowBlur: 0, shadowOpacity: 1 });
    expect(shapes.indexOf(edge)).toBeLessThan(shapes.indexOf(card));
  });

  it('draws its Störer as an ellipse and its date circle in the Störer colours', () => {
    const out = composeSharepic(
      gj('de-AT', [
        colourSlide('waldgruen', { stoerer: { text: 'Komm mit!' }, datum: { date: '23.10.' } }),
      ]),
      { photoSrc }
    );
    const slide = out.slides[0]!;
    expect(slide.circleBadgeInstances.find((c) => c.id === 'sc-stoerer')?.outline).toBe('ellipse');
    // The date is a label on a black edge, top right, not a circle.
    expect(slide.circleBadgeInstances.some((c) => c.id === 'sc-datum')).toBe(false);
    const label = slide.shapeInstances.find((s) => s.id === 'sc-datum')!;
    expect(label.fill).toBe('#FCD800');
    expect(label.y).toBeLessThan(300);
    expect(slide.shapeInstances.find((s) => s.id === 'sc-datum-rand')?.shadowOpacity).toBe(1);
  });

  it('sets the place on a light-green footer band', () => {
    const out = composeSharepic(
      gj('de-AT', [colourSlide('waldgruen', { ort: { lines: ['Linz'] } })]),
      { photoSrc }
    );
    const slide = out.slides[0]!;
    expect(slide.shapeInstances.find((s) => s.id === 'sc-ort-band')?.fill).toBe('#92CE26');
    expect(slide.additionalTexts.find((t) => t.id === 'sc-ort')?.text).toBe('LINZ');
  });

  it('frames a dark slide in hairlines and sets its paragraph light green', () => {
    const out = composeSharepic(
      gj('de-AT', [
        {
          ...colourSlide('waldgruen'),
          items: [
            { type: 'headline', lines: ['Wer zahlt?'] },
            { type: 'absatz', text: 'Die Teuerung trifft nicht alle gleich.' },
          ],
        },
      ]),
      { photoSrc }
    );
    const slide = out.slides[0]!;
    expect(slide.shapeInstances.filter((s) => s.id.startsWith('sc-raster-'))).toHaveLength(3);
    expect(slide.additionalTexts.find((t) => t.text.startsWith('Die Teuerung'))?.fill).toBe(
      '#92CE26'
    );
  });

  it('sets no hairlines on a light ground', () => {
    const out = composeSharepic(gj('de-AT', [colourSlide('creme')]), { photoSrc });
    expect(out.slides[0]!.shapeInstances.some((s) => s.id.startsWith('sc-raster-'))).toBe(false);
  });

  it('sets each date on a label, and on a card on a dark ground', () => {
    const termine = (color: SharepicColor) =>
      composeSharepic(
        gj('de-AT', [
          {
            ...colourSlide(color),
            items: [
              { type: 'headline', lines: ['Juni'] },
              {
                type: 'termine',
                eintraege: [
                  { datum: '13. Juni', titel: 'Wien' },
                  { datum: '20. Juni', titel: 'Linz', ort: 'Graz' },
                ],
              },
            ],
          },
        ]),
        { photoSrc }
      ).slides[0]!;
    const light = termine('creme');
    expect(light.shapeInstances.filter((s) => /-chip$/.test(s.id))).toHaveLength(2);
    expect(light.shapeInstances.some((s) => /-card$/.test(s.id))).toBe(false);
    expect(light.additionalTexts.find((t) => t.id.endsWith('-0-datum'))?.text).toBe('13. JUNI');
    const dark = termine('waldgruen');
    expect(dark.shapeInstances.filter((s) => /-card-rand$/.test(s.id))).toHaveLength(2);
  });
});

describe('GRÜNE JUGEND Deutschland on colour and photo', () => {
  const boxed = (color: SharepicColor) =>
    composeSharepic(
      gj('de-DE', [
        {
          ...colourSlide(color),
          zeilenboxen: true,
          items: [{ type: 'headline', lines: ['Mobilität', 'für alle'] }],
        },
      ]),
      { photoSrc }
    ).slides[0]!.pillBadgeInstances;

  it('sets line boxes black with white type on a plain colour', () => {
    const boxes = boxed('apricot');
    expect(boxes.length).toBeGreaterThanOrEqual(2);
    expect(boxes.every((b) => b.backgroundColor === '#000000' && b.textColor === '#FFFFFF')).toBe(
      true
    );
  });

  it('sets a boxed cover headline as large as its widest line lets it', () => {
    const boxes = boxed('apricot');
    expect(boxes[0]!.fontSize).toBeGreaterThan(100);
    expect(boxes.every((b) => b.x >= 0)).toBe(true);
  });

  it('keeps white and light-green boxes on black', () => {
    const boxes = boxed('schwarz');
    expect(boxes[0]!.backgroundColor).toBe('#FFFFFF');
    expect(boxes.slice(1).every((b) => b.backgroundColor === '#C7FF7A')).toBe(true);
  });

  it('sets a quote on a full photo in light green and bold', () => {
    const quote = composeSharepic(
      gj('de-DE', [
        {
          background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten' },
          position: 'unten',
          align: 'links',
          items: [{ type: 'zitat', text: 'Die Rente ist eine Frage der Verteilung.', name: 'A B' }],
          logo: false,
        },
      ]),
      { photoSrc }
    ).slides[0]!.additionalTexts.find((t) => t.text.startsWith('Die Rente'))!;
    expect(quote).toMatchObject({ fill: '#C7FF7A', fontStyle: 'bold' });
  });
});

describe('GRÜNE JUGEND Deutschland handwriting', () => {
  const dach = (color: SharepicColor) =>
    composeSharepic(
      gj('de-DE', [
        {
          ...colourSlide(color),
          items: [
            { type: 'dachzeile', text: 'Neu hier?' },
            { type: 'headline', lines: ['Komm vorbei'] },
          ],
        },
      ]),
      { photoSrc }
    ).slides[0]!;

  it('writes the line above the headline by hand on a tilted tape', () => {
    const slide = dach('lavendel');
    const line = slide.additionalTexts.find((t) => t.text === 'Neu hier?')!;
    expect(line).toMatchObject({ fontFamily: 'KaushanScript', rotation: -4 });
    const tape = slide.shapeInstances.find((s) => s.id.endsWith('-tape'))!;
    expect(tape).toMatchObject({ fill: '#C7FF7A', rotation: -4 });
  });

  it('turns the tape white on light green', () => {
    expect(dach('limette').shapeInstances.find((s) => s.id.endsWith('-tape'))?.fill).toBe(
      '#FFFFFF'
    );
  });

  it('keeps the plain line on black', () => {
    const slide = dach('schwarz');
    expect(slide.shapeInstances.some((s) => s.id.endsWith('-tape'))).toBe(false);
    expect(slide.additionalTexts.find((t) => t.text === 'Neu hier?')?.fontFamily).not.toBe(
      'KaushanScript'
    );
  });
});

describe('GRÜNE JUGEND photo washes and speakers', () => {
  it('washes a full photo in one brand colour', () => {
    const slide = composeSharepic(
      gj('de-DE', [
        {
          background: { kind: 'foto', filename: 'x.jpg', textSeite: 'unten', toenung: 'apricot' },
          position: 'unten',
          align: 'links',
          items: [{ type: 'headline', lines: ['Bus und Bahn'] }],
          logo: false,
        },
      ]),
      { photoSrc }
    ).slides[0]!;
    expect(slide.shapeInstances.find((s) => s.id === 'sc-toenung')).toMatchObject({
      fill: '#FF8568',
      blendMode: 'color',
    });
  });

  it('stands the speaker bottom right beside the speech bubble, uncropped', () => {
    const slide = composeSharepic(
      gj('de-AT', [
        {
          ...colourSlide('waldgruen'),
          items: [
            { type: 'zitat', text: 'Öffis müssen leistbar bleiben.', name: 'A B' },
            { type: 'bild', quelle: 'x.jpg', ausschnitt: 'freigestellt', filter: 'original' },
          ],
        },
      ]),
      { photoSrc }
    ).slides[0]!;
    const person = slide.userImageInstances[0]!;
    expect(person.x).toBeGreaterThan(400);
    expect(person.y + person.height).toBe(1350);
    expect(person.height / person.width).toBeCloseTo(1.5, 1);
    const bubble = slide.shapeInstances.find((s) => s.id.endsWith('-blase'))!;
    expect(bubble.x + bubble.width / 2).toBeLessThan(1080 * 0.7);
  });
});

describe('GRÜNE JUGEND Deutschland dates', () => {
  it('sets each date on a calendar tile, day above month', () => {
    const slide = composeSharepic(
      gj('de-DE', [
        {
          ...colourSlide('wiese'),
          items: [
            { type: 'headline', lines: ['Termine'] },
            {
              type: 'termine',
              eintraege: [
                { datum: '8.–9. Aug.', titel: 'Plakatstart' },
                { datum: '22. Aug.', titel: 'Konzert', ort: 'Schwerin' },
              ],
            },
          ],
        },
      ]),
      { photoSrc }
    ).slides[0]!;
    expect(slide.shapeInstances.filter((s) => /-kachel$/.test(s.id))).toHaveLength(2);
    expect(slide.additionalTexts.find((t) => t.id.endsWith('-0-datum'))?.text).toBe('8.–9.');
    expect(slide.additionalTexts.find((t) => t.id.endsWith('-0-monat'))?.text).toBe('Aug.');
  });
});

describe('Grüne Jugend Österreich quotes', () => {
  it('sets a quote in capitals in a light-green speech bubble', () => {
    const slide = composeSharepic(
      gj('de-AT', [
        {
          ...colourSlide('waldgruen'),
          items: [{ type: 'zitat', text: 'Öffis müssen leistbar bleiben.', name: 'A B' }],
        },
      ]),
      { photoSrc }
    ).slides[0]!;
    expect(slide.shapeInstances.find((s) => s.id.endsWith('-blase'))?.fill).toBe('#92CE26');
    expect(slide.shapeInstances.some((s) => s.id.endsWith('-blase-spitze'))).toBe(true);
    expect(slide.additionalTexts.some((t) => t.text === 'ÖFFIS MÜSSEN LEISTBAR BLEIBEN.')).toBe(
      true
    );
  });
});

describe.each([
  ['de-DE', 'gj-de'],
  ['de-AT', 'gj-at'],
] as const)('%s GJ grounds', (locale, id) => {
  it.each(SHAREPIC_BRAND_COLORS[id])('headline ink on %s reads at 4.5:1', (color) => {
    const out = composeSharepic(gj(locale, [colourSlide(color)]), { photoSrc });
    const ground = SHAREPIC_COLOR_HEX[color];
    for (const text of out.slides[0]!.additionalTexts.filter((t) => t.type !== 'body')) {
      expect(contrast(text.fill!, ground), `${text.id} on ${color}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
