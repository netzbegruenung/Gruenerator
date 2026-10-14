import { badgeGeometry, BADGE_SHAPES, STICKER_MAX_SIDE } from '@gruenerator/shared/stickers';
import { describe, expect, it } from 'vitest';

import {
  badgeBaselines,
  badgeCanvas,
  discRects,
  isStickerFile,
  parseCreatorReturn,
  stickerFilename,
  tintThresholdMatrix,
} from './creatorModel';

describe('discRects', () => {
  it.each([1, 4, 8, 12, 16])('approximates a %ipx disc within a pixel', (r) => {
    const rects = discRects(r);
    expect(rects[0]).toEqual({ rx: r, ry: 0 });
    expect(rects.at(-1)).toEqual({ rx: 0, ry: r });
    for (let i = 1; i < rects.length; i++) {
      // Corners walk from the x axis to the y axis …
      expect(rects[i]!.rx).toBeLessThanOrEqual(rects[i - 1]!.rx);
      expect(rects[i]!.ry).toBeGreaterThanOrEqual(rects[i - 1]!.ry);
      // … and the step between two corners stays shallow.
      expect(r - Math.hypot(rects[i]!.rx, rects[i - 1]!.ry)).toBeLessThanOrEqual(1);
    }
    // No corner pokes out of the disc.
    rects.forEach(({ rx, ry }) => expect(Math.hypot(rx, ry)).toBeLessThanOrEqual(r + 0.5));
  });

  it('stays a handful of filters at the widest work radius', () => {
    expect(discRects(16).length).toBeLessThanOrEqual(10);
  });

  it('has nothing to dilate without a width', () => {
    expect(discRects(0)).toEqual([]);
  });
});

describe('tintThresholdMatrix', () => {
  it('paints the colour and clears alpha at the threshold', () => {
    const m = tintThresholdMatrix('#FF8000');
    expect(m).toHaveLength(20);
    expect([m[4], m[9], m[14]]).toEqual([1, 128 / 255, 0]);
    const alpha = (a: number) => m[18]! * (a / 255) + m[19]!;
    expect(alpha(8)).toBeCloseTo(0);
    expect(alpha(255)).toBeCloseTo(1);
    expect(alpha(128)).toBeGreaterThan(0.45);
  });
});

describe('badgeCanvas', () => {
  it.each(BADGE_SHAPES.map((s) => s.id))('exports %s with its longer side at 1024', (id) => {
    const canvas = badgeCanvas(badgeGeometry(id));
    const exported = [canvas.width * canvas.scale, canvas.height * canvas.scale];
    expect(Math.max(...exported)).toBeCloseTo(STICKER_MAX_SIDE);
    expect(Math.min(...exported)).toBeGreaterThanOrEqual(64);
  });
});

describe('badgeBaselines', () => {
  it('centres the lines in the box', () => {
    const metrics = { ascent: -80, descent: 20 };
    const [first, second] = badgeBaselines(2, { y: 100, height: 400 }, 100, 1, metrics);
    expect(second! - first!).toBe(100);
    // The block's middle sits in the box's middle, shifted by the glyphs' own offset.
    expect((first! + second!) / 2).toBe(300 + 30);
  });
});

describe('creator helpers', () => {
  it('accepts only formats that can be transparent', () => {
    expect(isStickerFile({ uri: 'file:///a.jpg', mimeType: 'image/png' })).toBe(true);
    expect(isStickerFile({ uri: 'file:///a.png', mimeType: 'image/jpeg' })).toBe(false);
    expect(isStickerFile({ uri: 'file:///a.WEBP?x=1' })).toBe(true);
    expect(isStickerFile({ uri: 'file:///a.heic' })).toBe(false);
  });

  it('names the upload after the title', () => {
    expect(stickerFilename('Grün wählen!')).toBe('gruen-waehlen.png');
    expect(stickerFilename('  ')).toBe('sticker.png');
  });

  it('only knows the Profilbild as a way back', () => {
    expect(parseCreatorReturn('profilbild')).toBe('profilbild');
    expect(parseCreatorReturn('canvas')).toBeNull();
    expect(parseCreatorReturn(['profilbild'])).toBeNull();
  });
});
