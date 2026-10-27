import { covers, framedPhotoRect, photoRectAround } from '@ggraphic/editor/utils/coverFit';
import { straightenWindowPhoto } from '@ggraphic/editor/utils/straighten';
import { describe, expect, it } from 'vitest';

import {
  backgroundSmartCropView,
  backgroundSmartCropWindow,
  smartCropUpdate,
  smartCropView,
  userImageSmartCropPatch,
  userImageSmartCropView,
  viewAround,
} from './smartCrop';

import type { UserImageInstance } from './userImageUtils';
import type { CanvasElementConfig, LayoutResult } from '../configs/types';

const IMAGE: UserImageInstance = {
  id: 'photo',
  src: '/photo.jpg',
  fileName: 'photo.jpg',
  x: 0,
  y: 0,
  width: 200,
  height: 200,
  rotation: 0,
  scale: 1,
  opacity: 1,
};

const PAGE = { width: 1080, height: 1350 };
const ELEMENTS = [
  {
    id: 'background-image',
    type: 'image',
    x: 0,
    y: 0,
    width: PAGE.width,
    height: PAGE.height,
    offsetKey: 'imageOffset',
    scaleKey: 'imageScale',
    coverFit: true,
  },
] as unknown as CanvasElementConfig[];
const LAYOUT = {} as LayoutResult;

function seeded(seed: number) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 2 ** 32;
    return s / 2 ** 32;
  };
}

describe('viewAround', () => {
  it('centres the view on the region', () => {
    expect(
      viewAround(
        { width: 1000, height: 500 },
        { width: 200, height: 500 },
        {
          x: 400,
          y: 0,
          width: 200,
          height: 500,
        }
      )
    ).toEqual({ x: 400, y: 0, width: 200, height: 500 });
  });

  it('holds the view inside the photo at both edges', () => {
    const natural = { width: 1000, height: 500 };
    const view = { width: 300, height: 500 };
    expect(viewAround(natural, view, { x: 0, y: 0, width: 50, height: 50 }).x).toBe(0);
    expect(viewAround(natural, view, { x: 980, y: 450, width: 20, height: 50 })).toEqual({
      x: 700,
      y: 0,
      width: 300,
      height: 500,
    });
  });

  it('never grows past the photo', () => {
    expect(
      viewAround(
        { width: 100, height: 100 },
        { width: 140, height: 90 },
        {
          x: 0,
          y: 0,
          width: 100,
          height: 100,
        }
      )
    ).toEqual({ x: 0, y: 5, width: 100, height: 90 });
  });
});

describe('eigenes Bild', () => {
  const natural = { width: 600, height: 400 };

  it('sees the frame at zoom 1', () => {
    expect(userImageSmartCropView(natural, { width: 200, height: 200 })).toEqual({
      width: 400,
      height: 400,
    });
  });

  it('pans to the suggested part, -1 … 1 from edge to edge', () => {
    const at = (cx: number) =>
      userImageSmartCropPatch(IMAGE, natural, { x: cx - 200, y: 0, width: 400, height: 400 });
    expect(at(200).panX).toBe(1);
    expect(at(300).panX).toBe(0);
    expect(at(400).panX).toBe(-1);
    // Am Rand: der Vorschlag ragt nicht über das Foto hinaus, der Pan bleibt im Bereich.
    expect(at(590).panX).toBe(-1);
    expect(at(250)).toEqual({ fit: 'cover', panX: 0.5, panY: 0, cropZoom: 1 });
  });

  it('puts the suggestion exactly into the frame', () => {
    const patch = userImageSmartCropPatch(IMAGE, natural, {
      x: 120,
      y: 0,
      width: 400,
      height: 400,
    });
    const photo = framedPhotoRect(
      natural,
      IMAGE,
      { x: patch.panX!, y: patch.panY! },
      patch.cropZoom
    );
    // Maßstab 0,5: Foto-px 120 liegt am linken Rahmenrand.
    expect(photo.x).toBeCloseTo(-60);
  });

  it('resets straighten and zoom, and turns a stretched image into a cover', () => {
    const patch = userImageSmartCropPatch(
      { ...IMAGE, fit: 'cover', cropRotation: 30, cropZoom: 2.5 },
      natural,
      { x: 100, y: 0, width: 400, height: 400 }
    );
    expect(patch).toMatchObject({ cropRotation: 0, cropZoom: 1, fit: 'cover' });
    expect('cropRotation' in userImageSmartCropPatch(IMAGE, natural, IMAGE)).toBe(false);
  });

  it('always covers the frame (random cases)', () => {
    const random = seeded(7);
    for (let i = 0; i < 2000; i++) {
      const n = { width: 20 + random() * 4000, height: 20 + random() * 4000 };
      const frame = { width: 10 + random() * 1500, height: 10 + random() * 1500 };
      const view = userImageSmartCropView(n, frame);
      const region = {
        x: random() * n.width,
        y: random() * n.height,
        width: view.width,
        height: view.height,
      };
      const patch = userImageSmartCropPatch({ ...IMAGE, ...frame }, n, region);
      expect(Math.abs(patch.panX!)).toBeLessThanOrEqual(1 + 1e-9);
      expect(Math.abs(patch.panY!)).toBeLessThanOrEqual(1 + 1e-9);
      const photo = framedPhotoRect(n, frame, { x: patch.panX!, y: patch.panY! }, 1);
      expect(covers(photo, { x: 0, y: 0, ...frame })).toBe(true);
    }
  });
});

describe('Hintergrund', () => {
  const natural = { width: 2000, height: 1000 };
  const slot = { x: 0, y: 0, ...PAGE };

  it('sees the page at scale 1', () => {
    const view = backgroundSmartCropView(natural, PAGE, slot);
    expect(view.width).toBeCloseTo(800);
    expect(view.height).toBeCloseTo(1000);
  });

  it('places the window so the suggestion fills the page', () => {
    const window = backgroundSmartCropWindow(natural, PAGE, slot, {
      x: 1100,
      y: 0,
      width: 800,
      height: 1000,
    });
    expect(window.width).toBe(PAGE.width);
    expect(window.height).toBe(PAGE.height);
    const photo = photoRectAround(natural, window);
    // Foto-px 1100 am linken Seitenrand (Maßstab 1,35).
    expect(photo.x).toBeCloseTo(-1100 * 1.35);
    expect(photo.y).toBeCloseTo(0);
  });

  it('holds the window at the photo edges', () => {
    const right = photoRectAround(
      natural,
      backgroundSmartCropWindow(natural, PAGE, slot, { x: 1990, y: 0, width: 10, height: 10 })
    );
    expect(right.x + right.width).toBeCloseTo(PAGE.width);
    const left = photoRectAround(
      natural,
      backgroundSmartCropWindow(natural, PAGE, slot, { x: 0, y: 0, width: 10, height: 10 })
    );
    expect(left.x).toBeCloseTo(0);
  });

  it('a photo strip keeps scale 1 and covers its slot', () => {
    const strip = { x: 0, y: 750, width: 1080, height: 600 };
    const n = { width: 1500, height: 1000 };
    const view = backgroundSmartCropView(n, PAGE, strip);
    const window = backgroundSmartCropWindow(n, PAGE, strip, {
      x: 0,
      y: 0,
      width: view.width,
      height: view.height,
    });
    expect(window.width / PAGE.width).toBe(1);
    const photo = photoRectAround(n, window);
    expect(covers(photo, strip)).toBe(true);
    expect(photo.y).toBeCloseTo(strip.y);
  });

  it('always covers the slot at scale ≥ 1, unturned without correction (random cases)', () => {
    const random = seeded(11);
    for (let i = 0; i < 2000; i++) {
      const n = { width: 20 + random() * 6000, height: 20 + random() * 6000 };
      const base = { width: 200 + random() * 2000, height: 200 + random() * 2000 };
      const top = random() * base.height * 0.6;
      const s =
        random() < 0.5
          ? { x: 0, y: 0, ...base }
          : { x: 0, y: top, width: base.width, height: base.height - top };
      const view = backgroundSmartCropView(n, base, s);
      const region = {
        x: random() * n.width,
        y: random() * n.height,
        width: view.width,
        height: view.height,
      };
      const window = backgroundSmartCropWindow(n, base, s, region);
      expect(window.width / base.width).toBeGreaterThanOrEqual(1);
      const photo = photoRectAround(n, window);
      expect(covers(photo, s)).toBe(true);
      // Gespeichert 0°: die Bühne verschiebt höchstens Rundungsrauschen.
      const held = straightenWindowPhoto(n, photo, 0, s);
      expect(Math.abs(held.x - photo.x) + Math.abs(held.y - photo.y)).toBeLessThan(1e-6);
      expect(held.width).toBe(photo.width);
    }
  });
});

describe('smartCropUpdate', () => {
  const natural = { width: 2000, height: 1000 };
  const region = { x: 1100, y: 0, width: 800, height: 1000 };

  it('writes offset and scale through the element keys and resets the angle to 0', () => {
    const input = {
      id: 'background-image',
      state: { imageOffset: { x: 5, y: 5 }, imageScale: 2, backgroundImageRotation: 20 },
      elements: ELEMENTS,
      layout: LAYOUT,
      natural,
    };
    expect(smartCropView(input)?.height).toBeCloseTo(1000);
    const update = smartCropUpdate(input, region);
    expect(update?.kind).toBe('template');
    const patch = update!.patch as Record<string, unknown>;
    expect(patch.imageScale).toBe(1);
    expect(patch.backgroundImageRotation).toBe(0);
    const window = backgroundSmartCropWindow(natural, PAGE, { x: 0, y: 0, ...PAGE }, region);
    expect(patch.imageOffset).toEqual({ x: window.x, y: window.y });
  });

  it('leaves a never-straightened background without an angle', () => {
    const update = smartCropUpdate(
      { id: 'background-image', state: {}, elements: ELEMENTS, layout: LAYOUT, natural },
      region
    );
    expect(update?.patch).not.toHaveProperty('backgroundImageRotation');
  });

  it('patches an own image and ignores missing ones', () => {
    const state = { userImageInstances: [{ ...IMAGE, cropRotation: -10 }] };
    const input = {
      id: 'photo',
      state,
      elements: ELEMENTS,
      layout: LAYOUT,
      natural: { width: 600, height: 400 },
    };
    expect(smartCropView(input)).toEqual({ width: 400, height: 400 });
    expect(smartCropUpdate(input, { x: 0, y: 0, width: 400, height: 400 })).toEqual({
      kind: 'user-image',
      patch: { fit: 'cover', panX: 1, panY: 0, cropZoom: 1, cropRotation: 0 },
    });
    expect(smartCropUpdate({ ...input, id: 'nope' }, region)).toBeNull();
    expect(smartCropView({ ...input, id: 'nope' })).toBeNull();
  });
});
