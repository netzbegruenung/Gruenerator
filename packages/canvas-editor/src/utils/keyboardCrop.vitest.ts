import { covers, photoRectAround } from '@ggraphic/editor/utils/coverFit';
import {
  minStraightenZoom,
  straightFramedPhoto,
  straightenWindowPhoto,
  straightPhotoCovers,
} from '@ggraphic/editor/utils/straighten';
import { describe, expect, it } from 'vitest';

import { backgroundKeyCrop, userImageKeyCrop, type CropKey } from './keyboardCrop';

import type { UserImageInstance } from './userImageUtils';

const NATURAL = { width: 1200, height: 800 };
const pan = (dx: number, dy: number): CropKey => ({ pan: { dx, dy } });
const ZOOM_OUT: CropKey = { zoom: 1 / 1.1 };

type Crop = Pick<
  UserImageInstance,
  'width' | 'height' | 'panX' | 'panY' | 'cropZoom' | 'cropRotation'
>;

function press(image: Crop, key: CropKey, times: number): Crop {
  let current = image;
  for (let i = 0; i < times; i++) {
    const patch = userImageKeyCrop(NATURAL, current, key);
    if (patch) current = { ...current, ...patch };
  }
  return current;
}

describe('userImageKeyCrop, begradigt', () => {
  const rotated: Crop = {
    width: 400,
    height: 300,
    panX: 0,
    panY: 0,
    cropZoom: 1.4,
    cropRotation: 20,
  };
  const frame = { x: 0, y: 0, width: 400, height: 300 };

  it.each([
    ['links', pan(-10, 0)],
    ['rechts', pan(10, 0)],
    ['hoch', pan(0, -10)],
    ['runter', pan(0, 10)],
    ['schräg', pan(10, 10)],
  ])('öffnet nach vielen Pfeildrücken (%s) keine Lücke', (_, key) => {
    const after = press(rotated, key, 200);
    const photo = straightFramedPhoto(
      NATURAL,
      frame,
      { x: after.panX ?? 0, y: after.panY ?? 0 },
      after.cropZoom ?? 1,
      20
    );
    expect(straightPhotoCovers(photo, 20, frame)).toBe(true);
    expect(after.panX).not.toBe(rotated.panX ?? 0);
  });

  it('zoomt per Minus nie unter den Mindestzoom des Winkels', () => {
    const after = press(rotated, ZOOM_OUT, 50);
    expect(after.cropZoom).toBeCloseTo(minStraightenZoom(NATURAL, frame, 20), 9);
    // Am Boden ändert eine weitere Taste nichts und schreibt keinen Schritt.
    expect(userImageKeyCrop(NATURAL, after, ZOOM_OUT)).toBeNull();
  });

  it('ohne Winkel bleibt die alte Klemmung', () => {
    const plain: Crop = { width: 400, height: 300, cropZoom: 1 };
    // 1200×800 auf 400×300 deckend: Spielraum nur waagerecht.
    expect(userImageKeyCrop(NATURAL, plain, pan(0, 5))).toBeNull();
    expect(userImageKeyCrop(NATURAL, plain, pan(5, 0))).toMatchObject({ fit: 'cover' });
  });
});

describe('backgroundKeyCrop', () => {
  const slot = { x: 0, y: 0, width: 1080, height: 1350 };
  const window = { x: 0, y: 0, width: 1080, height: 1350 };

  it('verschiebt das Fenster und hält das Foto über der Seite', () => {
    let current = window;
    for (let i = 0; i < 300; i++)
      current = backgroundKeyCrop(NATURAL, current, slot, null, 0, pan(10, 0)) ?? current;
    expect(current.x).toBeGreaterThan(0);
    expect(covers(photoRectAround(NATURAL, current), slot)).toBe(true);
    expect(backgroundKeyCrop(NATURAL, current, slot, null, 0, pan(10, 0))).toBeNull();
  });

  it('begradigt: viele Pfeildrücke öffnen keine Lücke', () => {
    let current = window;
    for (let i = 0; i < 300; i++) {
      const straight = straightenWindowPhoto(NATURAL, photoRectAround(NATURAL, current), 15, slot);
      current = backgroundKeyCrop(NATURAL, current, slot, straight, 15, pan(10, -10)) ?? current;
    }
    const straight = straightenWindowPhoto(NATURAL, photoRectAround(NATURAL, current), 15, slot);
    expect(straightPhotoCovers(straight, 15, slot)).toBe(true);
  });

  it('zoomt per Plus um die Seitenmitte', () => {
    const next = backgroundKeyCrop(NATURAL, window, slot, null, 0, { zoom: 1.1 })!;
    expect(next.width).toBeCloseTo(window.width * 1.1, 6);
    expect(next.x + next.width / 2).toBeCloseTo(slot.width / 2, 6);
  });
});
