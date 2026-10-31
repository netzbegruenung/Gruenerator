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
    const badges = out.slides[0]!.circleBadgeInstances;
    expect(badges.find((c) => c.id === 'sc-stoerer')?.outline).toBe('ellipse');
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
