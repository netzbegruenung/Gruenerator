import { describe, expect, it } from 'vitest';

import { clampPerson, rotatedBounds, snapNudge, snapPerson, snapSticker } from './profilbildSnap';

const SIZE = 1080;
const person = (x: number, y: number) => ({ x, y, width: 400, height: 600 });

describe('snapPerson', () => {
  it('snaps the horizontal centre to the canvas centre', () => {
    // centre at 200 + 337 = 537 → 3 px from 540
    const r = snapPerson(person(337, 100), SIZE);
    expect(r.x).toBe(340);
    expect(r.guideX).toBe(540);
  });

  it('snaps an edge to a third', () => {
    // left edge 352 → third at 360
    const r = snapPerson(person(352, 100), SIZE);
    expect(r.x).toBe(360);
    expect(r.guideX).toBe(360);
  });

  it('snaps the bottom to the canvas bottom', () => {
    // bottom 470 + 600 = 1070 → 1080
    const r = snapPerson(person(100, 470), SIZE);
    expect(r.y).toBe(480);
    expect(r.guideY).toBe(1080);
  });

  it('picks the closest guide per axis', () => {
    // top 350 (10 from 360), centre 650, bottom 950 – top wins
    const r = snapPerson({ x: 0, y: 350, width: 100, height: 600 }, SIZE);
    expect(r.y).toBe(360);
    expect(r.guideY).toBe(360);
  });

  it('does not snap outside the threshold', () => {
    // edges 100/300/500 and 100/400/700 are all > 12 px from any guide
    const r = snapPerson(person(100, 100), SIZE);
    expect(r).toEqual({ x: 100, y: 100, guideX: null, guideY: null });
  });

  it('honours a custom threshold', () => {
    expect(snapPerson(person(337, 100), SIZE, 2).guideX).toBeNull();
  });
});

describe('clampPerson', () => {
  it('keeps the person centre on the canvas', () => {
    expect(clampPerson(person(-500, 2000), SIZE)).toEqual({ x: -200, y: 780 });
    expect(clampPerson(person(1000, -400), SIZE)).toEqual({ x: 880, y: -300 });
  });

  it('leaves in-bounds positions alone', () => {
    expect(clampPerson(person(100, 200), SIZE)).toEqual({ x: 100, y: 200 });
  });
});

describe('stickers', () => {
  it('computes the bounds of a rotated box', () => {
    const b = rotatedBounds({ x: 100, y: 100, width: 200, height: 100, rotation: 90 });
    expect(b.x).toBeCloseTo(50);
    expect(b.y).toBeCloseTo(0);
    expect(b.width).toBeCloseTo(100);
    expect(b.height).toBeCloseTo(200);
  });

  it('snaps the sticker centre to the canvas centre', () => {
    expect(
      snapSticker({ x: 545, y: 300, width: 200, height: 100, rotation: 0 }, 1080)
    ).toMatchObject({ x: 540, guideX: 540 });
  });

  it('keeps the centre on the canvas', () => {
    const r = snapSticker({ x: -400, y: 2000, width: 200, height: 100, rotation: 0 }, 1080, 0);
    expect([r.x, r.y]).toEqual([0, 1080]);
  });
});

describe('snapNudge', () => {
  const nudge = (x: number, dx: number) => {
    const moved = { x: x + dx, y: 100 };
    return snapNudge({ x, y: 100 }, moved, snapPerson({ ...person(0, 0), ...moved }, SIZE));
  };

  it('snaps a nudge forward onto a guide', () => {
    // centre 330 + 200 = 530 → +5 → 535, 5 px short of 540
    expect(nudge(330, 5)).toMatchObject({ x: 340, guideX: 540 });
  });

  it('lets a nudge leave a guide instead of pulling it back', () => {
    // left edge on the third at 360; a 10 px step stays within the 12 px threshold
    expect(nudge(360, 10)).toEqual({ x: 370, y: 100, guideX: null, guideY: null });
    expect(nudge(360, -10)).toMatchObject({ x: 350, guideX: null });
    // half a pixel off the guide still counts as sitting on it
    expect(nudge(359.5, 10)).toMatchObject({ x: 369.5, guideX: null });
  });

  it('leaves the axis that did not move unsnapped', () => {
    // y = 352 would snap to the third at 360 if it were considered
    const moved = { x: 110, y: 352 };
    const r = snapNudge({ x: 100, y: 352 }, moved, snapPerson({ ...person(0, 0), ...moved }, SIZE));
    expect(r).toMatchObject({ y: 352, guideY: null });
  });
});
