import { describe, expect, it } from 'vitest';

import { createDefaultGradient, gradientToKonvaProps, type GradientFill } from './gradientFill';

describe('gradientToKonvaProps', () => {
  const rect = { x: 0, y: 0, width: 100, height: 200 };

  it('projects a 90° gradient top→bottom, centered on the box', () => {
    const g: GradientFill = {
      type: 'linear',
      angle: 90,
      stops: [
        { offset: 0, color: '#000' },
        { offset: 1, color: '#fff' },
      ],
    };
    const props = gradientToKonvaProps(g, rect);
    // 90° → axis runs vertically through the horizontal center (x = 50).
    expect(props.fillLinearGradientStartPoint.x).toBeCloseTo(50);
    expect(props.fillLinearGradientEndPoint.x).toBeCloseTo(50);
    expect(props.fillLinearGradientStartPoint.y).toBeCloseTo(0);
    expect(props.fillLinearGradientEndPoint.y).toBeCloseTo(200);
    expect(props.fillLinearGradientColorStops).toEqual([0, '#000', 1, '#fff']);
  });

  it('projects a 0° gradient left→right, centered on the box', () => {
    const g: GradientFill = {
      type: 'linear',
      angle: 0,
      stops: [
        { offset: 0, color: '#000' },
        { offset: 1, color: '#fff' },
      ],
    };
    const props = gradientToKonvaProps(g, rect);
    expect(props.fillLinearGradientStartPoint.x).toBeCloseTo(0);
    expect(props.fillLinearGradientEndPoint.x).toBeCloseTo(100);
    expect(props.fillLinearGradientStartPoint.y).toBeCloseTo(100);
    expect(props.fillLinearGradientEndPoint.y).toBeCloseTo(100);
  });

  it('honors a non-zero rect origin (center-origin shapes)', () => {
    // A center-origin shape reports a self-rect starting at negative coords.
    const centered = { x: -50, y: -100, width: 100, height: 200 };
    const g = createDefaultGradient('#123456');
    const props = gradientToKonvaProps(g, centered);
    // Center is (0,0); 90° default spans y from -100 to 100.
    expect(props.fillLinearGradientStartPoint.x).toBeCloseTo(0);
    expect(props.fillLinearGradientStartPoint.y).toBeCloseTo(-100);
    expect(props.fillLinearGradientEndPoint.y).toBeCloseTo(100);
  });

  it('createDefaultGradient uses the base color as the first stop', () => {
    const g = createDefaultGradient('#abcdef');
    expect(g.stops[0].color).toBe('#abcdef');
    expect(g.stops).toHaveLength(2);
    expect(g.angle).toBe(90);
  });
});
