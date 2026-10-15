import Konva from 'konva';

import { gradientToKonvaProps, type GradientFill, type LocalRect } from './gradientFill';
import { HIT_ALPHA_THRESHOLD } from './pixelHitArea';

/** Beyond the gradient axis' ends the colour is clamped; a band reaching an end runs on this far. */
const OPEN_END = 1e3;

function stopAlpha(color: string): number {
  return Konva.Util.colorToRGBA(color)?.a ?? 1;
}

/**
 * The stretches of the gradient axis (0 = start, 1 = end) where its alpha is at
 * least `threshold`, interpolated linearly between stops like the canvas paints
 * it. A stretch touching an end runs on past it, since the end colour carries on.
 */
export function alphaIntervals(
  stops: GradientFill['stops'],
  threshold: number
): Array<[number, number]> {
  const sorted = [...stops].sort((a, b) => a.offset - b.offset);
  if (sorted.length === 0) return [];
  const points = sorted.map((s) => ({ t: s.offset, a: stopAlpha(s.color) }));
  points.unshift({ t: -OPEN_END, a: points[0]!.a });
  points.push({ t: OPEN_END, a: points[points.length - 1]!.a });

  const intervals: Array<[number, number]> = [];
  let start: number | null = null;
  for (let i = 0; i < points.length - 1; i++) {
    const p = points[i]!;
    const q = points[i + 1]!;
    if (start === null && p.a >= threshold) start = p.t;
    // Only read where p and q lie on opposite sides of the threshold.
    const crossing = (threshold - p.a) / (q.a - p.a);
    if (start === null && q.a >= threshold) {
      start = p.t + crossing * (q.t - p.t);
    } else if (start !== null && q.a < threshold) {
      intervals.push([start, p.t + crossing * (q.t - p.t)]);
      start = null;
    }
  }
  if (start !== null) intervals.push([start, OPEN_END]);
  return intervals;
}

/** A polygon per interval: the strip of the plane between two axis positions, cut generously wide. */
export function alphaBands(
  gradient: GradientFill,
  rect: LocalRect,
  threshold: number
): Array<Array<{ x: number; y: number }>> {
  const { fillLinearGradientStartPoint: s, fillLinearGradientEndPoint: e } = gradientToKonvaProps(
    gradient,
    rect
  );
  const dx = e.x - s.x;
  const dy = e.y - s.y;
  const reach = Math.hypot(rect.width, rect.height);
  const len = Math.hypot(dx, dy);
  if (!(len > 0)) return [];
  const nx = (-dy / len) * reach;
  const ny = (dx / len) * reach;
  return alphaIntervals(gradient.stops, threshold).map(([t0, t1]) => {
    const a = { x: s.x + dx * t0, y: s.y + dy * t0 };
    const b = { x: s.x + dx * t1, y: s.y + dy * t1 };
    return [
      { x: a.x + nx, y: a.y + ny },
      { x: b.x + nx, y: b.y + ny },
      { x: b.x - nx, y: b.y - ny },
      { x: a.x - nx, y: a.y - ny },
    ];
  });
}

/**
 * A hit function for a shape filled with a linear gradient that fades to
 * transparent (the sharepic scrim): it answers to the pointer only where the
 * fill can be seen, so a click on the clear part reaches the photo beneath.
 * `undefined` keeps Konva's full hit — an opaque gradient, or a wholly clear
 * one, which would otherwise not be reachable at all. Only the hit canvas is
 * affected; what is drawn and exported stays the same.
 */
export function translucentHitFunc(
  fillGradient: GradientFill | null | undefined
): ((context: Konva.Context, shape: Konva.Shape) => void) | undefined {
  if (!fillGradient || fillGradient.type !== 'linear') return undefined;
  const threshold = HIT_ALPHA_THRESHOLD / 255;
  const alphas = fillGradient.stops.map((s) => stopAlpha(s.color));
  if (!alphas.some((a) => a < threshold) || !alphas.some((a) => a >= threshold)) return undefined;

  return (context, shape) => {
    const bands = alphaBands(fillGradient, shape.getSelfRect(), threshold);
    context.save();
    context.beginPath();
    for (const band of bands) {
      context.moveTo(band[0]!.x, band[0]!.y);
      for (const p of band.slice(1)) context.lineTo(p.x, p.y);
      context.closePath();
    }
    context.clip();
    shape.sceneFunc().call(shape, context, shape);
    context.restore();
  };
}
