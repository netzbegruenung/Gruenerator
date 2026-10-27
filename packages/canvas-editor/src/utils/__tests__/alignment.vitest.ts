import { alignDelta, distributeDeltas } from '@ggraphic/editor/utils/alignment';
import { describe, expect, it } from 'vitest';

const page = { x: 0, y: 0, width: 1000, height: 500 };
const box = { x: 100, y: 50, width: 200, height: 100 };

describe('alignDelta', () => {
  it.each([
    ['left', { x: -100, y: 0 }],
    ['center-h', { x: 300, y: 0 }],
    ['right', { x: 700, y: 0 }],
    ['top', { x: 0, y: -50 }],
    ['center-v', { x: 0, y: 150 }],
    ['bottom', { x: 0, y: 350 }],
  ] as const)('%s', (dir, expected) => {
    expect(alignDelta(box, page, dir)).toEqual(expected);
  });
});

describe('distributeDeltas', () => {
  it('verteilt drei Kästen mit gleichen Abständen, die äußeren bleiben', () => {
    const boxes = [
      { x: 0, y: 0, width: 100, height: 10 },
      { x: 500, y: 0, width: 50, height: 10 },
      { x: 120, y: 0, width: 200, height: 10 },
    ];
    const deltas = distributeDeltas(boxes, 'x');
    const moved = boxes.map((b, i) => ({ ...b, x: b.x + deltas[i]!.x }));
    const sorted = [...moved].sort((a, b) => a.x - b.x);
    const gaps = sorted.slice(1).map((b, i) => b.x - (sorted[i]!.x + sorted[i]!.width));
    expect(gaps[0]).toBeCloseTo(gaps[1]!);
    expect(deltas[0]).toEqual({ x: 0, y: 0 });
    expect(deltas[1]).toEqual({ x: 0, y: 0 });
    expect(deltas.every((d) => d.y === 0)).toBe(true);
  });

  it('verteilt vertikal', () => {
    const boxes = [
      { x: 0, y: 0, width: 10, height: 100 },
      { x: 0, y: 110, width: 10, height: 100 },
      { x: 0, y: 400, width: 10, height: 100 },
    ];
    expect(distributeDeltas(boxes, 'y').map((d) => d.y)).toEqual([0, 90, 0]);
  });

  it('lässt weniger als drei Kästen stehen', () => {
    expect(distributeDeltas([box, page], 'x')).toEqual([
      { x: 0, y: 0 },
      { x: 0, y: 0 },
    ]);
  });
});
