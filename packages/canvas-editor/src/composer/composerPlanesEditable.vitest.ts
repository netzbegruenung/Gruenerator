import { describe, expect, it } from 'vitest';

import { isComposerPlane } from '../utils/shapes';

import { composeSharepic } from './composeSharepic';

import type { SharepicItem, SharepicSlide } from '@gruenerator/contracts';

/**
 * Everything the composer lays down is an ordinary shape the user can select,
 * move, recolour and delete — the colour planes under the text included. They
 * were briefly `locked` (07.–15.10.2026), which made them look stuck and let a
 * press on the panel grab the photo hidden beneath it.
 */

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/api/image-picker/stock-image/${f}`, measure };

const headline: SharepicItem = { type: 'headline', lines: ['Mach mit', 'bei uns!'] };
const kasten: SharepicItem = {
  type: 'liste',
  stil: 'kasten',
  items: ['++fast 7 Jahre++ das Ticket', '++82×++ das Debakel'],
};
const vergleich: SharepicItem = {
  type: 'vergleich',
  stil: 'spalten',
  links: { titel: 'Ihr Plan', punkte: ['teuer', 'kurz'] },
  rechts: { titel: 'Unser Plan', punkte: ['bezahlbar', 'dauerhaft'] },
};

const shapesOf = (
  locale: 'de-DE' | 'de-AT',
  background: SharepicSlide['background'],
  items: SharepicItem[]
) =>
  composeSharepic(
    { locale, slides: [{ background, position: 'unten', align: 'links', items, logo: true }] },
    options
  ).slides[0]!.shapeInstances;

describe('composer background planes', () => {
  it.each([
    ['gradient', 'de-AT', { kind: 'farbe', color: 'dunkelgruen' }, [headline], ['sc-bg']],
    [
      'scrim',
      'de-DE',
      { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' },
      [headline],
      ['sc-scrim'],
    ],
    [
      'panel',
      'de-DE',
      { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'mint' },
      [headline],
      ['sc-panel'],
    ],
    [
      'panel + tint',
      'de-AT',
      { kind: 'foto-unten', filename: 'wind.jpg', panelColor: 'dunkelgruen' },
      [headline],
      ['sc-panel', 'sc-tint'],
    ],
    [
      'kopfband',
      'de-DE',
      { kind: 'farbe', color: 'mint', kopfband: 'dunkeltanne' },
      [headline, kasten],
      ['sc-kopfband'],
    ],
    [
      'vergleich',
      'de-DE',
      { kind: 'farbe', color: 'weiss' },
      [vergleich],
      ['-links-flaeche', '-rechts-flaeche'],
    ],
  ] as const)('%s planes are ordinary shapes', (_name, locale, background, items, ids) => {
    const shapes = shapesOf(locale, background as SharepicSlide['background'], [...items]);
    for (const id of ids) {
      const plane = shapes.find((s) => s.id === id || s.id.endsWith(id));
      expect(plane, id).toBeDefined();
      expect(isComposerPlane(plane!.id), id).toBe(true);
    }
    expect(shapes.filter((s) => 'locked' in s)).toEqual([]);
  });

  it('names only the planes as planes', () => {
    expect(isComposerPlane('sc-ki-label-bg')).toBe(false);
    expect(isComposerPlane('sc-0-card')).toBe(false);
    expect(isComposerPlane('shape-1760000000000')).toBe(false);
  });
});
