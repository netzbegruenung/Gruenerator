import { describe, expect, it } from 'vitest';

import { cssLinearGradient } from './sharepicGround';

/** Where a point sits on ggraphic's line (its `gradientToKonvaProps`: centre ∓ (w/2·cos, h/2·sin)). */
function ggraphicParam(angle: number, w: number, h: number, x: number, y: number) {
  const rad = (angle * Math.PI) / 180;
  const [ex, ey] = [(w / 2) * Math.cos(rad), (h / 2) * Math.sin(rad)];
  const [sx, sy] = [w / 2 - ex, h / 2 - ey];
  return ((x - sx) * 2 * ex + (y - sy) * 2 * ey) / (4 * (ex * ex + ey * ey));
}

/** Where a point sits on a CSS `linear-gradient(<angle>deg)` line (CSS Images 3, §3.1.1). */
function cssParam(angle: number, w: number, h: number, x: number, y: number) {
  const rad = (angle * Math.PI) / 180;
  const [dx, dy] = [Math.sin(rad), -Math.cos(rad)];
  const length = Math.abs(w * dx) + Math.abs(h * dy);
  return 0.5 + ((x - w / 2) * dx + (y - h / 2) * dy) / length;
}

describe('cssLinearGradient', () => {
  it('keeps a straight top-to-bottom gradient as it is', () => {
    const fill = cssLinearGradient(180, [{ offset: 0.2, color: '#000000' }], 1000, 1000);
    expect(fill.angle).toBeCloseTo(90);
    expect(fill.stops[0]!.offset).toBeCloseTo(0.2);
  });

  it.each([
    [1080, 1350],
    [1080, 1440],
  ])('puts each CSS stop on the pixels CSS puts it on (%i×%i)', (w, h) => {
    const offsets = [0.1476, 0.3508, 0.6047, 0.8537];
    const fill = cssLinearGradient(
      200,
      offsets.map((offset) => ({ offset, color: '#000000' })),
      w,
      h
    );
    // The two lines are the same line with another scale: a stop lands where
    // CSS has it exactly when every point maps by that same scale.
    const scale = (fill.stops[3]!.offset - fill.stops[0]!.offset) / (offsets[3]! - offsets[0]!);
    for (const [x, y] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
      [w * 0.3, h * 0.7],
    ] as const) {
      const css = cssParam(200, w, h, x, y);
      const ours = ggraphicParam(fill.angle, w, h, x, y);
      expect(ours).toBeCloseTo(fill.stops[0]!.offset + (css - offsets[0]!) * scale, 6);
    }
    expect(fill.stops.every((s) => s.offset > 0 && s.offset < 1)).toBe(true);
  });
});
