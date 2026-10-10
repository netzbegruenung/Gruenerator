import { describe, expect, it } from 'vitest';

import { clampPerson, snapPerson } from './profilbildSnap';

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
