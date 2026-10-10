import { describe, expect, it } from 'vitest';

import { stickerBox } from './profilbildStickers';

describe('stickerBox', () => {
  it('bakes the node scale into width and height and keeps position and rotation', () => {
    expect(
      stickerBox(
        { width: 200, height: 100 },
        { x: 300, y: 400, scaleX: 1.5, scaleY: 0.5, rotation: 45 }
      )
    ).toEqual({ x: 300, y: 400, width: 300, height: 50, rotation: 45 });
  });

  it('is the identity at scale 1', () => {
    expect(
      stickerBox({ width: 80, height: 60 }, { x: 1, y: 2, scaleX: 1, scaleY: 1, rotation: 0 })
    ).toEqual({ x: 1, y: 2, width: 80, height: 60, rotation: 0 });
  });
});
