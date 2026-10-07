import { describe, expect, it } from 'vitest';

import { COMPOSER_PLANE_IDS, createShape, isLockedShape } from '../utils/shapes';

import { composeSharepic } from './composeSharepic';

import type { SharepicSlide } from '@gruenerator/contracts';

/**
 * The composer's full-canvas planes sit in `shapeInstances`, above the
 * template's background colour and photo. As ordinary shapes they caught the
 * click on "empty" canvas (select, drag, Delete) and covered the photo. They
 * are flagged `locked`, and only they are.
 */

const measure = (text: string, fontSize: number) => text.length * fontSize * 0.5;
const options = { photoSrc: (f: string) => `/api/image-picker/stock-image/${f}`, measure };

const slide = (background: SharepicSlide['background']): SharepicSlide => ({
  background,
  position: 'unten',
  align: 'links',
  items: [{ type: 'headline', lines: ['Mach mit', 'bei uns!'] }],
  logo: true,
});

const shapesOf = (locale: 'de-DE' | 'de-AT', background: SharepicSlide['background']) =>
  composeSharepic({ locale, slides: [slide(background)] }, options).slides[0]!.shapeInstances;

describe('composer background planes', () => {
  it.each([
    ['gradient', 'de-DE', { kind: 'farbe', color: 'tanne' }, ['sc-bg']],
    ['scrim', 'de-DE', { kind: 'foto', filename: 'wind.jpg', textSeite: 'unten' }, ['sc-scrim']],
    [
      'panel',
      'de-DE',
      { kind: 'foto-oben', filename: 'wind.jpg', panelColor: 'mint' },
      ['sc-panel'],
    ],
    [
      'panel + tint',
      'de-AT',
      { kind: 'foto-unten', filename: 'wind.jpg', panelColor: 'dunkelgruen' },
      ['sc-panel', 'sc-tint'],
    ],
  ] as const)('%s planes are locked', (_name, locale, background, ids) => {
    const shapes = shapesOf(locale, background as SharepicSlide['background']);
    for (const id of ids) {
      expect(shapes.find((s) => s.id === id)?.locked, id).toBe(true);
    }
    const others = shapes.filter((s) => !COMPOSER_PLANE_IDS.includes(s.id));
    expect(others.filter((s) => s.locked)).toEqual([]);
  });

  it('treats planes from canvases composed before the flag as locked', () => {
    const legacy = { ...createShape('rect', 0, 0, '#000', '#000'), id: 'sc-bg' };
    delete (legacy as { locked?: boolean }).locked;
    expect(isLockedShape(legacy)).toBe(true);
    expect(isLockedShape(createShape('rect', 0, 0, '#000', '#000'))).toBe(false);
    expect(isLockedShape({ id: 'sc-bg', locked: false })).toBe(false);
  });
});
