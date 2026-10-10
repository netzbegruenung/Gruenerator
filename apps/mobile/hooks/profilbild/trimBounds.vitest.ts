import { describe, expect, it } from 'vitest';

import { trimBounds } from './trimBounds';

function rgba(width: number, height: number, opaque: Array<[number, number]>) {
  const data = new Uint8Array(width * height * 4);
  for (const [x, y] of opaque) data[(y * width + x) * 4 + 3] = 255;
  return data;
}

describe('trimBounds', () => {
  it('pads by 1px and clamps to the image', () => {
    const data = rgba(4, 4, [
      [1, 1],
      [2, 2],
    ]);
    expect(trimBounds(data, 4, 4)).toEqual({ x: 0, y: 0, width: 4, height: 4 });
  });

  it('pads a single pixel by 1px on each side', () => {
    expect(trimBounds(rgba(10, 10, [[5, 5]]), 10, 10)).toEqual({ x: 4, y: 4, width: 3, height: 3 });
  });

  it('returns null for a fully transparent image', () => {
    expect(trimBounds(rgba(4, 4, []), 4, 4)).toBeNull();
  });
});
