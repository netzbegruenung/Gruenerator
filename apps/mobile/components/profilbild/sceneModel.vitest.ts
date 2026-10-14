import {
  COLOR_SWATCHES_AT,
  COLOR_SWATCHES_DE,
  defaultPlacement,
  PRIDE_STRIPES,
  PROFILBILD_STICKERS,
} from '@gruenerator/shared/profilbild';
import { describe, expect, it } from 'vitest';

import { galleryStickerSource } from './galleryModel';
import {
  initialModel,
  newSticker,
  restoreStickers,
  savedStickers,
  sceneScale,
  stripeRects,
  swatchGradient,
  type SceneSticker,
} from './sceneModel';

import type { SavedProfilbildSticker } from '@gruenerator/shared/profilbild';

const UUID = '0b6f3c1e-8a4d-4f5e-9c2a-7d1e5b3a9f10';
const SHARE_SRC = '/api/share/0123456789abcdef0123456789abcdef/download';
const BOX = { x: 10, y: 20, width: 30, height: 40, rotation: 5 };

describe('stripeRects', () => {
  it('covers the canvas with gapless bands, remainder in the last one', () => {
    const rects = stripeRects(PRIDE_STRIPES);
    expect(rects).toHaveLength(6);
    expect(rects.reduce((sum, r) => sum + r.height, 0)).toBe(1080);
    rects.forEach((r, i) => {
      expect(r.y).toBe(i === 0 ? 0 : rects[i - 1].y + rects[i - 1].height);
      expect(r.color).toBe(PRIDE_STRIPES[i]);
    });
    expect(rects[5].height).toBeGreaterThanOrEqual(rects[0].height);
  });

  it('puts the rounding remainder into the last band', () => {
    const rects = stripeRects(['#000', '#111', '#222'], 100);
    expect(rects.map((r) => r.height)).toEqual([33, 33, 34]);
  });
});

describe('sceneScale', () => {
  it('maps view size to scene scale', () => {
    expect(sceneScale(270)).toBe(0.25);
  });
});

describe('initialModel', () => {
  it('starts on the first colour swatch with the person placed and no stickers', () => {
    const de = initialModel({ width: 400, height: 800 }, false);
    expect(de.background).toEqual(COLOR_SWATCHES_DE[0].background);
    expect(de.person).toEqual(defaultPlacement({ width: 400, height: 800 }));
    expect(de.stickers).toEqual([]);
    expect(initialModel({ width: 400, height: 800 }, true).background).toEqual(
      COLOR_SWATCHES_AT[0].background
    );
  });
});

describe('newSticker', () => {
  it('centres the sticker at its default width and keeps the aspect ratio', () => {
    const teamgruen = PROFILBILD_STICKERS.find((s) => s.id === 'teamgruen')!;
    const s = newSticker(teamgruen, { width: 200, height: 100 }, 'u1');
    expect(s).toEqual({
      uid: 'u1',
      id: 'teamgruen',
      src: teamgruen.src,
      x: 540,
      y: 540,
      width: 0.25 * 1080 * 1.6,
      height: (0.25 * 1080 * 1.6) / 2,
      rotation: 0,
    });
  });
});

describe('gallery stickers', () => {
  it('start at the base width with their asset id and share path', () => {
    const s = newSticker(
      galleryStickerSource({ id: UUID, src: SHARE_SRC }),
      { width: 100, height: 50 },
      'u2'
    );
    expect(s).toMatchObject({
      uid: 'u2',
      id: `asset:${UUID}`,
      src: SHARE_SRC,
      width: 270,
      height: 135,
    });
  });
});

describe('restoreStickers / savedStickers', () => {
  const saved: SavedProfilbildSticker[] = [
    { id: 'teamgruen', ...BOX },
    { id: `asset:${UUID}`, src: SHARE_SRC, ...BOX },
  ];

  it('places system and loaded gallery stickers back', () => {
    const { stickers, unrestored } = restoreStickers(saved, () => true);
    expect(unrestored).toEqual([]);
    expect(stickers.map(({ id, src }) => ({ id, src }))).toEqual([
      { id: 'teamgruen', src: '/studio-tools/stickers/teamgruen.svg' },
      { id: `asset:${UUID}`, src: SHARE_SRC },
    ]);
    expect(new Set(stickers.map((s) => s.uid)).size).toBe(2);
  });

  it('keeps a gallery sticker that failed to load and saves it again unchanged', () => {
    const { stickers, unrestored } = restoreStickers(saved, () => false);
    expect(stickers.map((s) => s.id)).toEqual(['teamgruen']);
    expect(unrestored).toEqual([saved[1]]);
    expect(savedStickers(stickers, unrestored)).toEqual(saved);
  });

  it('round-trips: saving restored stickers gives the saved list back', () => {
    const { stickers, unrestored } = restoreStickers(saved, () => true);
    expect(savedStickers(stickers, unrestored)).toEqual(saved);
  });

  it('writes src only for gallery stickers', () => {
    const placed: SceneSticker[] = [
      { uid: 'a', id: 'vielfalt', src: '/studio-tools/stickers/vielfalt.svg', ...BOX },
      { uid: 'b', id: `asset:${UUID}`, src: SHARE_SRC, ...BOX },
    ];
    const out = savedStickers(placed, []);
    expect(out[0]).toEqual({ id: 'vielfalt', ...BOX });
    expect(out[1]).toEqual({ id: `asset:${UUID}`, src: SHARE_SRC, ...BOX });
  });
});

describe('swatchGradient', () => {
  it('maps a 180deg gradient to top → bottom', () => {
    const g = swatchGradient({ kind: 'gradient', stops: ['#000', '#fff'], angle: 180 });
    expect(g.colors).toEqual(['#000', '#fff']);
    expect(g.locations).toBeNull();
    expect(g.start.x).toBeCloseTo(0.5);
    expect(g.start.y).toBeCloseTo(0);
    expect(g.end.x).toBeCloseTo(0.5);
    expect(g.end.y).toBeCloseTo(1);
  });

  it('draws stripes as hard stops', () => {
    const g = swatchGradient({ kind: 'stripes', colors: ['#a', '#b'] });
    expect(g.colors).toEqual(['#a', '#a', '#b', '#b']);
    expect(g.locations).toEqual([0, 0.5, 0.5, 1]);
  });
});
