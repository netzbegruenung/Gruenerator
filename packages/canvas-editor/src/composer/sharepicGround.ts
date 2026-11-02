import { type GradientFill } from '@ggraphic/editor/elements';

import { HELLGRUEN_GLOW } from '../brand/theme';

import { type PhotoTone } from './composeTypes';

import type { SharepicBrandId, SharepicColor, SharepicTextSide } from '@gruenerator/contracts';

/**
 * AT's dark greens get a gradient; the rest stays flat. DE colours are all
 * flat (CD 2024 p. 11, "Farben nur flach, 100 % Deckkraft"): the green
 * glow of the posts is the photo behind them, a Tanne plane runs edge to edge.
 */
export const GRADIENTS: Partial<
  Record<
    SharepicColor,
    {
      type?: 'radial';
      angle: number;
      stops: string[];
      /** Set: `angle` and these stop offsets read as CSS `linear-gradient(<angle>deg, …)`. */
      cssOffsets?: number[];
    }
  >
> = {
  // Measured on @diegruenen carousels (10/2026, median over text-free patches):
  // a deep, slightly bluish green, darker at the top, only a little lighter
  // below — no slide into yellow-green.
  dunkelgruen: { angle: 90, stops: ['#0B6620', '#1D7A35', '#23803B'] },
  // Hellgrün (#56AF31) carries white at 2.77:1 and yellow at 2.26:1. The posts
  // never set text on it flat: a dark green with a light glow in the middle
  // (Dc_L5vriG5z, edge #318338 → centre #56AE32). Ours stops darker, at the
  // brightest stop white keeps 4.68:1 and yellow 3.82:1.
  hellgruen: { type: 'radial', angle: 0, stops: [...HELLGRUEN_GLOW] },
  // Pride: deep violet at the top, where the text starts, warming to a dark
  // orange below; every stop keeps white above 4.5:1.
  pride: { angle: 90, stops: ['#4B1D8C', '#8A1D86', '#B0177A', '#C2402E'] },
  // GJ DE: the gruene-jugend.de homepage's `--gradient-1`, taken over as
  // written: linear-gradient(200deg, #FF8568 14.76%, #F28ADE 35.08%,
  // #9F88FF 60.47%, #C7FF7A 85.37%).
  verlauf: {
    angle: 200,
    stops: ['#FF8568', '#F28ADE', '#9F88FF', '#C7FF7A'],
    cssOffsets: [0.1476, 0.3508, 0.6047, 0.8537],
  },
};
export const evenStops = (stops: readonly string[]) =>
  stops.map((color, i) => ({ offset: i / (stops.length - 1), color }));

/**
 * A CSS `linear-gradient(<cssAngle>deg, …)` as ggraphic paints it on a
 * `width`×`height` box. CSS runs its line along the angle (0deg up, clockwise)
 * and puts the far corners on 0 % and 100 %; ggraphic's line runs from
 * centre ∓ (w/2·cos a, h/2·sin a). So: pick `a` whose axis points the CSS way,
 * then rescale each offset from the CSS line's length onto ggraphic's.
 */
export function cssLinearGradient(
  cssAngle: number,
  stops: readonly { offset: number; color: string }[],
  width: number,
  height: number
): GradientFill {
  const rad = (cssAngle * Math.PI) / 180;
  const [dx, dy] = [Math.sin(rad), -Math.cos(rad)];
  const cssHalf = (Math.abs(width * dx) + Math.abs(height * dy)) / 2;
  const a = Math.atan2(dy / height, dx / width);
  const half = Math.hypot((width / 2) * Math.cos(a), (height / 2) * Math.sin(a));
  return {
    type: 'linear',
    angle: (a * 180) / Math.PI,
    stops: stops.map(({ offset, color }) => ({
      // Canvas rejects stops outside [0, 1]; a CSS stop past ggraphic's end
      // only falls there on a far wider box than any sharepic format.
      offset: Math.min(1, Math.max(0, 0.5 + ((offset - 0.5) * cssHalf) / half)),
      color,
    })),
  };
}

/** The fill of a gradient ground on a `width`×`height` canvas. */
export function groundGradient(
  gradient: NonNullable<(typeof GRADIENTS)[SharepicColor]>,
  width: number,
  height: number
): GradientFill {
  const { cssOffsets } = gradient;
  if (cssOffsets) {
    const stops = gradient.stops.map((color, i) => ({ offset: cssOffsets[i]!, color }));
    return cssLinearGradient(gradient.angle, stops, width, height);
  }
  return {
    type: gradient.type ?? 'linear',
    angle: gradient.angle,
    stops: evenStops(gradient.stops),
  };
}

/**
 * Scrim alpha under the text, per photo tone — capped at `SCRIM_MAX`: the posts
 * keep the photo bright and carry the text with a shadow, not a curtain.
 */
export const SCRIM_TEXT_ALPHA: Record<PhotoTone, number> = {
  dunkel: 0.4,
  mittel: 0.48,
  hell: 0.55,
};
export const SCRIM_MAX = 0.55;
/** The scrim covers at least this share of the photo from the text edge… */
const SCRIM_MIN_DEPTH = 0.42;
/** …and fades over this share beyond the dense band. */
const SCRIM_FADE = 0.15;
/** DE: a very dark Tanne (#06251A); AT stays neutral-dark; GJ DE black, GJ AT its forest green. */
export const SCRIM_DARK: Record<SharepicBrandId, string> = {
  'gruene-de': '6,37,26',
  'gruene-at': '3,14,8',
  'gj-de': '0,0,0',
  'gj-at': '0,30,13',
};
/** Dense scrim reaches this far past the text before it fades. */
export const SCRIM_GUTTER = 48;
/** Stops of the scrim's fade, as fractions of its length. */
export const SCRIM_EASE = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];

/** Gradient angle per side: offset 0 on the picture side. */
export const SCRIM_ANGLE: Record<SharepicTextSide, number> = {
  unten: 90,
  oben: 270,
  links: 180,
  rechts: 0,
};

/**
 * The scrim's box and fill: dense (`level` and up) from the text side's edge
 * to `denseTo` px inward, then a fade to nothing.
 */
export function scrimFill({
  side,
  denseTo,
  canvasWidth,
  canvasHeight,
  level,
  darkRgb,
}: {
  side: SharepicTextSide;
  denseTo: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Alpha of the dense band. */
  level: number;
  /** The scrim's colour as `r,g,b`. */
  darkRgb: string;
}): { x: number; y: number; width: number; height: number; fillGradient: GradientFill } {
  const vertical = side === 'unten' || side === 'oben';
  const full = vertical ? canvasHeight : canvasWidth;
  // Fade across all the photo left beside the text: a short ramp of near-black
  // over a bright photo reads as a curtain edge.
  // Top/bottom: only the text side's share of the photo, the rest stays as
  // shot. A side column fades across the whole width — a short ramp beside
  // a tall column reads as a curtain edge.
  const depth = vertical
    ? Math.min(full, Math.max(full * SCRIM_MIN_DEPTH, denseTo + full * SCRIM_FADE))
    : full;
  const fade = Math.max(0.01, 1 - denseTo / depth);
  const edge = level;
  const x = side === 'rechts' ? canvasWidth - depth : 0;
  const y = side === 'unten' ? canvasHeight - depth : 0;
  const w = side === 'links' || side === 'rechts' ? depth : canvasWidth;
  const h = side === 'unten' || side === 'oben' ? depth : canvasHeight;
  return {
    x: x + w / 2,
    y: y + h / 2,
    width: w,
    height: h,
    fillGradient: {
      type: 'linear',
      angle: SCRIM_ANGLE[side],
      stops: [
        // Smoothstep: flat at both ends, so neither the photo side nor the
        // start of the dense band shows a seam.
        ...SCRIM_EASE.map((t) => ({
          offset: fade * t,
          color: `rgba(${darkRgb},${(level * t * t * (3 - 2 * t)).toFixed(3)})`,
        })),
        { offset: 1, color: `rgba(${darkRgb},${edge})` },
      ],
    },
  };
}
