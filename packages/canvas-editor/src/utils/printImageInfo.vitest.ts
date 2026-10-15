import type Konva from 'konva';
import { describe, expect, it } from 'vitest';

import { printImageInfo } from './printImageInfo';

function fakeNode(opts: {
  cropWidth: number;
  natural: number | null;
  width: number;
  scale: number;
}) {
  return {
    image: () => (opts.natural === null ? null : { naturalWidth: opts.natural }),
    cropWidth: () => opts.cropWidth,
    width: () => opts.width,
    getAbsoluteScale: () => ({ x: opts.scale, y: opts.scale }),
  } as unknown as Konva.Image;
}

describe('printImageInfo', () => {
  it('uses the natural width for an uncropped image (Konva cropWidth is 0)', () => {
    const info = printImageInfo(fakeNode({ cropWidth: 0, natural: 3000, width: 500, scale: 1 }), 1);
    expect(info).toEqual({ naturalWidthPx: 3000, displayedWidthPx: 500 });
  });

  it('uses the crop width for a cropped image', () => {
    const info = printImageInfo(
      fakeNode({ cropWidth: 1200, natural: 3000, width: 400, scale: 0.5 }),
      0.5
    );
    expect(info).toEqual({ naturalWidthPx: 1200, displayedWidthPx: 400 });
  });

  it('skips a node without a loaded image', () => {
    expect(
      printImageInfo(fakeNode({ cropWidth: 0, natural: null, width: 1, scale: 1 }), 1)
    ).toBeNull();
  });
});
