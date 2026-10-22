import { describe, expect, it } from 'vitest';

import { HAND_ARROW_TYPES, handArrowEnds } from '../utils/handDrawn';

import { arrowPose, shapePoint } from './steckbriefLayout';

const runs = [
  { from: { x: 300, y: 200 }, to: { x: 520, y: 260 }, bow: 1 },
  { from: { x: 800, y: 120 }, to: { x: 610, y: 330 }, bow: 1 },
  { from: { x: 150, y: 900 }, to: { x: 330, y: 720 }, bow: -1 },
  { from: { x: 500, y: 400 }, to: { x: 520, y: 470 }, bow: 1 },
] as const;

describe('arrowPose', () => {
  it.each(HAND_ARROW_TYPES)(
    'lands the tail of %s on its label and the tip on the person',
    (type) => {
      for (const { from, to, bow } of runs) {
        const pose = arrowPose(type, from, to, 9, bow);
        const { tail, tip } = handArrowEnds(type, pose.width, pose.height, 9);
        const start = shapePoint(pose, tail);
        const end = shapePoint(pose, tip);
        expect(Math.hypot(start.x - from.x, start.y - from.y)).toBeLessThan(1);
        expect(Math.hypot(end.x - to.x, end.y - to.y)).toBeLessThan(1);
      }
    }
  );
});
