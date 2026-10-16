import { describe, expect, it } from 'vitest';

import {
  FlipFilter,
  VignetteFilter,
  backgroundAdjustments,
  getActiveImageFilters,
} from './imageFilters';

import type Konva from 'konva';

type Filter = (this: Konva.Node, imageData: ImageData) => void;

/** Runs a filter on a node stand-in: the filters only read attrs. */
const run = (filter: Filter, attrs: Record<string, unknown>, img: ImageData) =>
  filter.call({ getAttr: (k: string) => attrs[k] } as unknown as Konva.Node, img);

/** width × height pixels; the red channel holds the pixel's index. */
function pixels(width: number, height: number, value?: number): ImageData {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    data[i * 4] = value ?? i;
    data[i * 4 + 1] = value ?? 0;
    data[i * 4 + 2] = value ?? 0;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data, colorSpace: 'srgb' } as ImageData;
}
const reds = (img: ImageData) => Array.from(img.data.filter((_, i) => i % 4 === 0));

describe('image filters', () => {
  it('turns the vignette and the flip on only when set', () => {
    expect(getActiveImageFilters({})).toEqual([]);
    expect(getActiveImageFilters({ vignette: 0.5 })).toEqual([VignetteFilter]);
    expect(getActiveImageFilters({ flipY: true })).toEqual([FlipFilter]);
  });

  it('mirrors left–right and top–bottom', () => {
    const img = pixels(3, 2);
    run(FlipFilter, { flipX: true }, img);
    expect(reds(img)).toEqual([2, 1, 0, 5, 4, 3]);
    run(FlipFilter, { flipX: true, flipY: true }, img);
    expect(reds(img)).toEqual([3, 4, 5, 0, 1, 2]);
  });

  it('darkens the corners and leaves the middle', () => {
    const img = pixels(9, 9, 200);
    run(VignetteFilter, { vignette: 1 }, img);
    const at = (x: number, y: number) => img.data[(y * 9 + x) * 4]!;
    expect(at(4, 4)).toBe(200);
    expect(at(0, 0)).toBeLessThan(20);
    expect(img.data[3]).toBe(255);
  });

  it('reads the background photo look off the page state', () => {
    expect(backgroundAdjustments({})).toBeNull();
    expect(backgroundAdjustments({ backgroundImageAdjustments: { vignette: 0.3 } })).toEqual({
      vignette: 0.3,
    });
  });
});
