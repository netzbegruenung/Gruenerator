// SPDX-License-Identifier: MPL-2.0
import { describe, expect, it } from 'vitest';

import { framedPhotoRect, visiblePart } from '@ggraphic/editor/utils/coverFit';
import { userImageCropUpdate } from '@ggraphic/editor/utils/userImageCrop';
import { type UserImageInstance } from '@ggraphic/editor/utils/userImageUtils';

const natural = { width: 1200, height: 800 };
const image: UserImageInstance = {
  id: 'photo',
  src: 'https://assets.test/photo.jpg',
  fileName: 'photo.jpg',
  x: 50,
  y: 80,
  width: 600,
  height: 400,
  scale: 1,
  rotation: 0,
  opacity: 1,
};

describe('free photo cropping', () => {
  it('retains the exact source pixels when cropping both axes, including mirrors', () => {
    const photo = { x: 0, y: 0, width: 600, height: 400 };
    const window = { x: 100, y: 50, width: 300, height: 200 };
    const next = { ...image, ...userImageCropUpdate(image, natural, photo, window) };
    expect(next).toMatchObject({ x: 150, y: 130, width: 300, height: 200, cropZoom: 2 });
    const reconstructed = framedPhotoRect(
      natural,
      next,
      { x: next.panX!, y: next.panY! },
      next.cropZoom
    );
    for (const mirror of [{}, { x: true }, { y: true }, { x: true, y: true }]) {
      expect(visiblePart(natural, reconstructed, { ...next, x: 0, y: 0 }, mirror)?.crop).toEqual(
        visiblePart(natural, photo, window, mirror)?.crop
      );
    }
    expect(next.src).toBe(image.src);
  });

  it('keeps the crop in place on a scaled, rotated photo', () => {
    const patch = userImageCropUpdate(
      { ...image, rotation: 90, scale: 2 },
      natural,
      { x: 0, y: 0, width: 600, height: 400 },
      { x: 100, y: 50, width: 300, height: 200 }
    );
    expect(patch.x).toBeCloseTo(-50);
    expect(patch.y).toBeCloseTo(280);
  });

  it('can expand a previously cropped window back to the full photo', () => {
    const patch = userImageCropUpdate(
      image,
      natural,
      { x: -100, y: -50, width: 600, height: 400 },
      { x: -100, y: -50, width: 600, height: 400 }
    );
    expect(patch).toMatchObject({ cropZoom: 1, panX: 0, panY: 0, width: 600, height: 400 });
  });
});
