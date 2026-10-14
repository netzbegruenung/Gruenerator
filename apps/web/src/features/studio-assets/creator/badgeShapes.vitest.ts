import { describe, expect, it } from 'vitest';

import {
  BADGE_SHAPES,
  badgeGeometry,
  badgeLines,
  fitFontSize,
  polygonPath,
  starburstPoints,
} from './badgeShapes';

describe('starburstPoints', () => {
  it('alternates outer and inner radius over twice the spike count', () => {
    const center = { x: 100, y: 100 };
    const points = starburstPoints(center, 20, 90, 70);
    expect(points).toHaveLength(40);
    points.forEach((p, i) =>
      expect(Math.hypot(p.x - center.x, p.y - center.y)).toBeCloseTo(i % 2 === 0 ? 90 : 70)
    );
    expect(points[0]!.x).toBeCloseTo(100);
    expect(points[0]!.y).toBeCloseTo(10);
  });
});

describe('polygonPath', () => {
  it('moves to the first point, lines to the rest and closes', () => {
    expect(
      polygonPath([
        { x: 0, y: 0 },
        { x: 10.04, y: 0 },
        { x: 5, y: 8.66 },
      ])
    ).toBe('M0 0 L10 0 L5 8.7 Z');
  });
});

describe('badgeGeometry', () => {
  it.each(BADGE_SHAPES.map((s) => s.id))('%s keeps its text box inside the shape', (id) => {
    const g = badgeGeometry(id);
    expect(g.path.startsWith('M')).toBe(true);
    expect(g.path.endsWith('Z')).toBe(true);
    expect(g.textBox.x).toBeGreaterThan(0);
    expect(g.textBox.y).toBeGreaterThan(0);
    expect(g.textBox.x + g.textBox.width).toBeLessThan(g.width);
    expect(g.textBox.y + g.textBox.height).toBeLessThan(g.height);
  });

  it('draws the Störer as a 20-spike starburst', () => {
    const vertices = badgeGeometry('stoerer').path.match(/[ML]/g);
    expect(vertices).toHaveLength(40);
  });
});

describe('badgeLines', () => {
  it('keeps up to three non-empty trimmed lines', () => {
    expect(badgeLines(' Jetzt \n\nGrün\nwählen\nam 1. März')).toEqual(['Jetzt', 'Grün', 'wählen']);
  });
});

describe('fitFontSize', () => {
  // 0.5 em per character at size 100.
  const measure = (line: string) => line.length * 50;

  it('is limited by the widest line', () => {
    expect(fitFontSize(['Grün', 'wählen!'], { width: 700, height: 1000 }, measure, 1)).toBe(200);
  });

  it('is limited by the stacked line height', () => {
    expect(fitFontSize(['a', 'b', 'c'], { width: 1000, height: 300 }, measure, 1.2)).toBe(83);
  });

  it('never exceeds the maximum for one short word', () => {
    expect(fitFontSize(['Ja'], { width: 1000, height: 1000 }, measure, 1, 260)).toBe(260);
  });
});
