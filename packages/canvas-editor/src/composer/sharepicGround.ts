import { HELLGRUEN_GLOW } from '../brand/theme';
import { type GradientFill } from '../utils/gradientFill';

import { type PhotoTone } from './composeTypes';

import type {
  SharepicColor,
  SharepicCreatorLocale,
  SharepicTextSide,
} from '@gruenerator/contracts';

/**
 * AT's dark greens get a gradient; the rest stays flat. DE colours are all
 * flat (CD 2024 p. 11, "Farben nur flach, 100 % Deckkraft"): the green
 * glow of the posts is the photo behind them, a Tanne plane runs edge to edge.
 */
export const GRADIENTS: Partial<
  Record<SharepicColor, { type?: 'radial'; angle: number; stops: string[] }>
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
};
export const evenStops = (stops: string[]) =>
  stops.map((color, i) => ({ offset: i / (stops.length - 1), color }));

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
/** DE: a very dark Tanne (#06251A); AT stays neutral-dark. */
export const SCRIM_DARK: Record<SharepicCreatorLocale, string> = {
  'de-DE': '6,37,26',
  'de-AT': '3,14,8',
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
  dark,
}: {
  side: SharepicTextSide;
  denseTo: number;
  canvasWidth: number;
  canvasHeight: number;
  /** Alpha of the dense band. */
  level: number;
  /** The scrim's colour as `r,g,b`. */
  dark: string;
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
          color: `rgba(${dark},${(level * t * t * (3 - 2 * t)).toFixed(3)})`,
        })),
        { offset: 1, color: `rgba(${dark},${edge})` },
      ],
    },
  };
}
