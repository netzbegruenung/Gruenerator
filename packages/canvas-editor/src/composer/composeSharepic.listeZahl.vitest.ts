import { type SharepicItem, type SharepicSlide, type SharepicSpec } from '@gruenerator/contracts';
import { describe, expect, it } from 'vitest';

import { composeSharepic } from './composeSharepic';

/** Monospace stand-in: half the font size per character. */
const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/media/${f}`, measure };

const slide = (items: SharepicItem[], extra: Partial<SharepicSlide> = {}): SharepicSlide => ({
  background: { kind: 'farbe', color: 'dunkeltanne' },
  position: 'mitte',
  align: 'links',
  items,
  logo: false,
  ...extra,
});
const one = (item: SharepicItem, locale: SharepicSpec['locale'] = 'de-DE') =>
  composeSharepic({ locale, slides: [slide([item])] }, options).slides[0]!;
const texts = (s: ReturnType<typeof one>) => s.additionalTexts;

describe('composeSharepic — liste stil', () => {
  it('sets numerals in a column left of the points', () => {
    const s = one({
      type: 'liste',
      stil: 'ziffern',
      items: ['Mehr Busse', 'Mehr Bahn', 'Mehr Rad'],
    });
    const markers = texts(s).filter((t) => t.id.endsWith('-marker'));
    expect(markers.map((m) => m.text)).toEqual(['1', '2', '3']);
    const points = texts(s).filter((t) => /-\d$/.test(t.id));
    points.forEach((p, k) => expect(p.x).toBeGreaterThan(markers[k]!.x));
    // No bullets left in the text itself.
    expect(points.every((p) => !p.text.startsWith('•'))).toBe(true);
  });

  it('ticks a Bilanz, straight on the AT green without a card', () => {
    const s = one(
      { type: 'liste', stil: 'haken', items: ['Klimaticket', 'Mehr Ökostrom'] },
      'de-AT'
    );
    expect(
      texts(s)
        .filter((t) => t.id.endsWith('-marker'))
        .map((m) => m.text)
    ).toEqual(['✓', '✓']);
    expect(s.shapeInstances.some((sh) => sh.id.endsWith('-card'))).toBe(false);
  });

  it('keeps the plain bullet list as it was', () => {
    const s = one({ type: 'liste', items: ['Mehr Busse', 'Mehr Bahn'] });
    expect(texts(s).some((t) => t.text.startsWith('• Mehr Busse'))).toBe(true);
  });
});

describe('composeSharepic — nummer', () => {
  const absatz: SharepicItem = { type: 'absatz', text: 'Ein Grund, der überzeugt.' };
  it('counts only the numbered slides', () => {
    const spec: SharepicSpec = {
      locale: 'de-AT',
      slides: [
        slide([{ type: 'headline', lines: ['3 Gründe'] }]),
        slide([absatz], { nummer: 'gross' }),
        slide([absatz], { nummer: 'gross' }),
      ],
    };
    const slides = composeSharepic(spec, options).slides;
    expect(slides.map((s) => s.additionalTexts.find((t) => t.id === 'sc-nummer')?.text)).toEqual([
      undefined,
      '1.',
      '2.',
    ]);
  });

  it('draws a ghost numeral behind the text', () => {
    const s = composeSharepic(
      { locale: 'de-AT', slides: [slide([absatz], { nummer: 'geist' })] },
      options
    ).slides[0]!;
    const ghost = s.additionalTexts.find((t) => t.id === 'sc-nummer')!;
    expect(ghost.text).toBe('1');
    expect(ghost.fontSize).toBeGreaterThan(600);
    expect(s.layerOrder.indexOf('sc-nummer')).toBeLessThan(s.layerOrder.indexOf('sc-0-absatz'));
  });
});

describe('composeSharepic — zahl', () => {
  it('sets the figure over its label', () => {
    const s = one({ type: 'zahl', stil: 'stapel', wert: '6,3 Mrd. €', label: 'kostet die Hitze' });
    const wert = texts(s).find((t) => t.id.endsWith('-wert'))!;
    const label = texts(s).find((t) => t.id.endsWith('-label'))!;
    expect(wert.fontSize).toBeGreaterThan(label.fontSize * 3);
    expect(label.y).toBeGreaterThan(wert.y + wert.fontSize * 0.8);
  });

  it('lets a short figure fill the width', () => {
    const s = one({ type: 'zahl', stil: 'riesenwort', wert: '−40°' });
    const wert = texts(s).find((t) => t.id.endsWith('-wert'))!;
    expect(measure(wert.text, wert.fontSize)).toBeGreaterThan(wert.width * 0.6);
  });

  it('puts a countdown in a disc', () => {
    const s = one({ type: 'zahl', stil: 'countdown', wert: '3', label: 'Tage bis zur Wahl' });
    expect(s.shapeInstances.some((sh) => sh.id.endsWith('-disc') && sh.type === 'circle')).toBe(
      true
    );
  });
});

describe('composeSharepic — rechnung und termine', () => {
  it('sets a sum as rows, a rule and the result below', () => {
    const s = one({
      type: 'rechnung',
      glieder: [
        { wert: '63 €', label: 'Ticket' },
        { op: '−', wert: '8,90 €', label: 'Zuschuss' },
      ],
      ergebnis: { wert: '54,10 €', label: 'im Monat' },
    });
    const ops = texts(s)
      .filter((t) => t.id.endsWith('-op'))
      .map((t) => t.text);
    expect(ops).toEqual(['−', '=']);
    const result = texts(s).find((t) => t.id.endsWith('-ergebnis-wert'))!;
    const rule = s.shapeInstances.find((sh) => sh.id.endsWith('-rule'))!;
    expect(result.y).toBeGreaterThan(rule.y);
  });

  it('lines dates up in a column with titles beside them', () => {
    const s = one({
      type: 'termine',
      eintraege: [
        { datum: 'Mo 12.5.', titel: 'Radtour', ort: 'Rathaus' },
        { datum: 'Sa 17.5.', titel: 'Baumpflanzaktion' },
      ],
    });
    const dates = texts(s).filter((t) => t.id.endsWith('-datum'));
    const titles = texts(s).filter((t) => t.id.endsWith('-titel'));
    expect(new Set(dates.map((d) => d.x)).size).toBe(1);
    titles.forEach((t, k) => expect(t.x).toBeGreaterThan(dates[k]!.x));
    expect(dates[1]!.y).toBeGreaterThan(dates[0]!.y);
  });
});
