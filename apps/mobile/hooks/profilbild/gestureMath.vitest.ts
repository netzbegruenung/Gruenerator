import { describe, expect, it } from 'vitest';

import {
  dragPerson,
  hitSticker,
  pinchScale,
  roundModel,
  snapThreshold,
  viewToCanvas,
} from './gestureMath';

import type { ProfilbildModel, SceneSticker } from '../../components/profilbild/sceneModel';

const sticker = (uid: string, x: number, y: number, size = 200, rotation = 0): SceneSticker => ({
  uid,
  src: '/sonnenblume_gruen.png',
  x,
  y,
  width: size,
  height: size,
  rotation,
});

describe('viewToCanvas', () => {
  it('scales view points to 1080 canvas units', () => {
    expect(viewToCanvas(10, 270)).toBe(40);
  });
});

describe('snapThreshold', () => {
  it('turns 12 pt under the finger into canvas units', () => {
    expect(snapThreshold(270)).toBe(48);
  });
});

describe('dragPerson', () => {
  it('snaps a centre at 538 to the 540 centre line', () => {
    const r = dragPerson({ x: 330, y: 200, width: 400, height: 500 }, 8, 0, 12);
    expect(r.x + 200).toBe(540);
    expect(r.guideX).toBe(540);
  });

  it('keeps the centre on the canvas when dragged far left', () => {
    const r = dragPerson({ x: 100, y: 200, width: 400, height: 500 }, -5000, 0, 12);
    expect(r.x + 200).toBeGreaterThanOrEqual(0);
  });
});

describe('pinchScale', () => {
  it('clamps to 0.4–1.6', () => {
    expect(pinchScale(0.85, 10)).toBe(1.6);
    expect(pinchScale(0.85, 0.01)).toBe(0.4);
    expect(pinchScale(0.8, 1.25)).toBe(1);
  });
});

describe('hitSticker', () => {
  const stickers = [sticker('below', 500, 500), sticker('above', 550, 550)];

  it('returns the top sticker of two overlapping ones', () => {
    expect(hitSticker(stickers, 560, 560)).toBe('above');
    expect(hitSticker(stickers, 420, 420)).toBe('below');
  });

  it('returns null for a tap beside them', () => {
    expect(hitSticker(stickers, 100, 100)).toBeNull();
  });

  it('respects rotation', () => {
    const rotated = [sticker('r', 500, 500, 200, 45)];
    expect(hitSticker(rotated, 590, 590)).toBeNull();
    expect(hitSticker(rotated, 500, 630)).toBe('r');
  });
});

describe('roundModel', () => {
  it('rounds positions and sizes to pixels, scale to thousandths and rotation to tenths', () => {
    const model: ProfilbildModel = {
      background: { kind: 'color', color: '#000' },
      person: { x: 10.4, y: 20.6, scale: 0.85432 },
      stickers: [{ ...sticker('a', 100.5, 200.2, 50.7), rotation: 12.345 }],
    };
    const r = roundModel(model);
    expect(r.person).toEqual({ x: 10, y: 21, scale: 0.854 });
    expect(r.stickers[0]).toMatchObject({ x: 101, y: 200, width: 51, height: 51, rotation: 12.3 });
    expect(r.background).toBe(model.background);
  });
});
