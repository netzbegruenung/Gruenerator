import { describe, expect, it } from 'vitest';

import {
  clampPan,
  coverPhotoRect,
  covers,
  framedPhotoRect,
  panOfFramedPhoto,
  panWindowPhoto,
  photoRectAround,
  shownArea,
  visiblePart,
  windowInPhoto,
  zoomBackground,
  zoomWindow,
} from './coverFit';

const page = { x: 0, y: 0, width: 1080, height: 1350 };
const landscape = { width: 5306, height: 3542 };
const portrait = { width: 2160, height: 3240 };

describe('photoRectAround', () => {
  it('widens a page window to a landscape photo, centred', () => {
    const photo = photoRectAround(landscape, page);
    expect(photo.height).toBe(1350);
    expect(photo.width).toBeCloseTo(1350 * (5306 / 3542));
    expect(photo.x + photo.width / 2).toBeCloseTo(540);
  });

  it('draws exactly the old centre crop inside the window', () => {
    // The legacy CanvasImage crop for this pair: x = (5306 - 3542 * 0.8) / 2.
    const part = visiblePart(landscape, photoRectAround(landscape, page), page)!;
    expect(part.box).toEqual(page);
    expect(part.crop.x).toBeCloseTo((5306 - 3542 * 0.8) / 2);
    expect(part.crop.width).toBeCloseTo(3542 * 0.8);
    expect(part.crop.y).toBeCloseTo(0);
  });

  it('round-trips through windowInPhoto', () => {
    const window = { x: -40, y: 25, width: 1300, height: 1625 };
    const back = windowInPhoto(photoRectAround(portrait, window), 1080 / 1350);
    expect(back.x).toBeCloseTo(window.x);
    expect(back.y).toBeCloseTo(window.y);
    expect(back.width).toBeCloseTo(window.width);
  });
});

describe('shownArea', () => {
  it('draws an old composer strip (photo pushed 405 px down) exactly as before', () => {
    const window = { ...page, y: 405 };
    const area = shownArea(portrait, window, page);
    expect(area).toEqual({ x: 0, y: 405, width: 1080, height: 945 });
    const part = visiblePart(portrait, photoRectAround(portrait, window), area)!;
    expect(part.box).toEqual(area);
    // Legacy: centre crop starts at source y 270, drawn from the node's top.
    expect(part.crop.y).toBeCloseTo(270);
  });

  it('opens the whole frame while the photo covers it, even with the window panned off', () => {
    // Panned 120 px down: the window leaves a gap, the photo around it does not.
    expect(shownArea(portrait, { ...page, y: 120 }, page)).toEqual(page);
  });
});

describe('clampPan', () => {
  it('lets a photo pan across all of its overhang and no further', () => {
    const photo = photoRectAround(portrait, page);
    // 1620 px of photo on a 1350 px page: 135 px over each edge.
    expect(clampPan(photo, 0, 9999, page).dy).toBeCloseTo(135);
    expect(clampPan(photo, 0, -9999, page).dy).toBeCloseTo(-135);
    expect(clampPan(photo, 50, 0, page).dx).toBe(0);
  });

  it('never yanks a photo that did not cover the frame', () => {
    const photo = { x: 0, y: 405, width: 1080, height: 1350 };
    expect(clampPan(photo, 0, -3, page).dy).toBe(-3);
    expect(clampPan(photo, 0, -9999, page).dy).toBeCloseTo(-405);
    expect(clampPan(photo, 0, 9999, page).dy).toBe(0);
  });
});

describe('coverPhotoRect', () => {
  it('just covers the frame at zoom 1 and keeps covering when panned within range', () => {
    const frame = { width: 1080, height: 450 };
    const photo = coverPhotoRect(portrait, frame);
    expect(photo.width).toBeCloseTo(1080);
    expect(covers(photo, { x: 0, y: 0, ...frame })).toBe(true);
    const { dy } = clampPan(photo, 0, 10_000, { x: 0, y: 0, ...frame });
    expect(covers({ ...photo, y: photo.y + dy }, { x: 0, y: 0, ...frame })).toBe(true);
  });
});

describe('panWindowPhoto', () => {
  const strip = { ...page, y: 405 };

  it('never opens a gap above an old strip, however often it is dragged down', () => {
    let window = strip;
    for (let i = 0; i < 5; i++) {
      const { dy, part } = panWindowPhoto(portrait, window, page, 0, 135);
      window = { ...window, y: window.y + dy };
      expect(part!.box.y).toBeLessThanOrEqual(405);
    }
  });

  it('lets an old strip move up, showing more of the photo', () => {
    const { dy, part } = panWindowPhoto(portrait, strip, page, 0, -100);
    expect(dy).toBe(-100);
    expect(part!.box.y).toBeCloseTo(305);
  });

  it('pans a covering photo across its overhang', () => {
    expect(panWindowPhoto(portrait, page, page, 0, 500).dy).toBeCloseTo(135);
  });
});

describe('zoomBackground', () => {
  const slot = { width: 1080, height: 1350 };

  it('zooms about the middle', () => {
    const next = zoomBackground({ imageOffset: { x: 0, y: 0 }, imageScale: 1 }, 2, slot);
    expect(next).toEqual({ imageScale: 2, imageOffset: { x: -540, y: -675 } });
  });

  it('never goes below 100 % and pulls a panned window back over the slot', () => {
    const next = zoomBackground({ imageOffset: { x: -1000, y: 0 }, imageScale: 2 }, 0.5, slot);
    expect(next).toEqual({ imageScale: 1, imageOffset: { x: 0, y: 0 } });
  });

  it('keeps what the viewer sees centred, also on a centre-anchored slot', () => {
    // Panned 100 px right at 150 %: zooming to 300 % doubles the pan.
    const plain = zoomBackground({ imageOffset: { x: -170, y: -337.5 }, imageScale: 1.5 }, 3, slot);
    expect(plain.imageOffset.x).toBeCloseTo(-1080 + 200);
    const centred = zoomBackground(
      { imageOffset: { x: 100, y: 0 }, imageScale: 1.5 },
      3,
      slot,
      true
    );
    expect(centred.imageOffset.x).toBeCloseTo(200);
  });
});

describe('framedPhotoRect', () => {
  it('round-trips a pan and keeps the chosen part when the frame is resized', () => {
    const photo = framedPhotoRect(landscape, { width: 400, height: 400 }, { x: 0.5, y: 0 });
    expect(panOfFramedPhoto(photo, { width: 400, height: 400 }).x).toBeCloseTo(0.5);
    const crop = (size: number) =>
      visiblePart(
        landscape,
        framedPhotoRect(landscape, { width: size, height: size }, { x: 0.5, y: 0 }),
        { x: 0, y: 0, width: size, height: size }
      )!.crop;
    expect(crop(800).x).toBeCloseTo(crop(400).x);
  });

  it('holds an out-of-range pan at the edge', () => {
    const photo = framedPhotoRect(landscape, { width: 400, height: 400 }, { x: 5, y: 0 });
    expect(photo.x).toBeCloseTo(0);
  });
});

describe('zoomWindow', () => {
  it('zooms about the middle and never below the slot', () => {
    expect(zoomWindow(page, 2, page)).toEqual({ x: -540, y: -675, width: 2160, height: 2700 });
    expect(zoomWindow(page, 0.5, page)).toEqual(page);
  });
});

describe('panWindowPhoto, below 100 %', () => {
  it('lets an old shrunken photo move inside the slot as before', () => {
    const window = { x: 270, y: 337, width: 540, height: 675 };
    expect(panWindowPhoto(landscape, window, page, -100, 50)).toMatchObject({ dx: -100, dy: 50 });
    expect(panWindowPhoto(landscape, window, page, -1000, 0).dx).toBe(-270);
  });
});
