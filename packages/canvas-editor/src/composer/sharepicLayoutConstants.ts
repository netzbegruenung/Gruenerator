import { HELLGRUEN_GLOW } from '../brand/theme';
import { type TextMarker } from '../utils/textUtils';

import { SHAREPIC_COLOR_HEX } from './chromeParts';
import { type PhotoTone } from './composeTypes';

import type {
  SharepicColor,
  SharepicCreatorLocale,
  SharepicItem,
  SharepicTextSide,
} from '@gruenerator/contracts';

/** 6.5 % of the width — the margin the posts use. */
export const MARGIN = 70;
export const GAP = 30;
export const FOOTER = 130;
/**
 * Logo: longer side and gap to the bottom edge, measured on the posts (10/2026).
 * DE: the "BÜNDNIS 90/DIE GRÜNEN" word mark (710 × 379), ~250–300 px, bottom-left
 * at the margin, in a tone of the ground (Dd_BXcKiDy2/03, Ddouf0QiL1w/02).
 * AT: the "G DIE GRÜNEN" logo with claim (1410 × 1239), ~210 px, centred.
 */
export const LOGO = {
  'de-DE': { size: 260, height: (260 * 379) / 710, bottom: 80 },
  'de-AT': { size: 210, height: (210 * 1239) / 1410, bottom: 91 },
} as const;
/**
 * AI label, looking like `imagine_label_canvas.ts` at 1080 px: PT Sans Bold 27,
 * pill bottom-left. Kept in sync by hand, the API cannot import the editor.
 */
export const KI_LABEL = {
  texts: { slide: 'KI-Generiert', closing: 'Klimaschonend KI-generiert mit dem Grünerator' },
  fontFamily: 'PT Sans',
  fontSize: 27,
  margin: 11,
  paddingX: 16,
  paddingY: 9,
  radius: 8,
  gap: 8,
} as const;
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
export const SCRIM_MIN_DEPTH = 0.42;
/** …and fades over this share beyond the dense band. */
export const SCRIM_FADE = 0.15;
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
 * DE quote leading: the posts' marker boxes stand apart line by line
 * (DdjWsbhCHCI), which 1.2 does not leave room for.
 */
export const QUOTE_LINE_HEIGHT = 1.3;
/** DE `++marker++` box overhang beside its words, in em. */
export const MARKER_PAD_X = 0.1;
/** The marker on creme: the soft mint of the candidates' text slides (DdEhd82js3K, DdEv6ZPDs-O). */
export const MARKER_MINT = '#77F6A5';
/** Line-box ink: near-black, as on the story posts. */
export const BOX_INK = '#0B0F0C';
/** DE `++marker++` inside a white card: grass green, dark ink. */
export const CARD_MARKER: TextMarker = {
  fill: SHAREPIC_COLOR_HEX.grasgruen,
  color: SHAREPIC_COLOR_HEX.dunkeltanne,
  padX: MARKER_PAD_X,
};
/**
 * `steckbrief`: label width and the name's width (shares of the width), where
 * the greeting's middle sits (share of the height), the hand and the
 * sunflower in px, the arrows' length, gap to the person and stroke, how far a
 * photo with its own background fades in from its edges (share of its width),
 * how far the dim reaches down a background photo (share of the height).
 */
export const STECKBRIEF = {
  column: 0.36,
  greetAt: { foto: 0.62, frei: 0.55 },
  nameWidth: 0.21,
  hand: 100,
  blume: 96,
  arrowMin: 190,
  arrowMax: 370,
  arrowGap: 22,
  curlMin: 240,
  stroke: 11,
  fade: 0.22,
  scrimTop: 0.18,
  scrimMax: 0.3,
} as const;
/** `blume`: the faded sunflower's size and strength per ground. */
export const BLUME = { size: 760, onLight: 0.12, onGrass: 0.1, onDark: 0.08 } as const;
/** `absatz.klein`: the body size of the candidates' long text slides at 1080 px. */
export const ABSATZ_KLEIN = 36;
/** A DE quote this long is a text page (DdEhd82js3K/02), not a hero: body size, small mark. */
export const QUOTE_LONG = 300;
/** DE accent words on light ground — lime would vanish there. */
export const KLEE = '#008939';
/** The DE "swipe on" arrow — an icon from the editor's own sets, so it stays swappable. */
export const ARROW_ICON = 'tabler:arrow-narrow-right';
/**
 * Arrow box and its gap to the right edge, measured on the posts: DE a
 * small arrow ~22 px from the corner, AT a long stroke ~280 px wide, ~40 px in.
 * The drawn arrow is narrower than its box (DE ≈ 0.64, AT ≈ 0.8).
 */
export const ARROW = {
  'de-DE': { size: 42, right: 22, bottom: 22, glyph: 0.64 },
  'de-AT': { size: 350, right: 40, bottom: 60, glyph: 0.8 },
} as const;
/** Headline: widest line at this share of its column, up to `HEADLINE_MAX` px. */
export const HEADLINE_FILL = 0.95;
export const HEADLINE_MAX = 230;
export const HEADLINE_WITH_CARD = 130;
export const CARD_ITEMS: readonly SharepicItem['type'][] = [
  'schlagzeile',
  'bingo',
  'zahl',
  'rechnung',
  'termine',
  'liste',
  'diagramm',
  'iconliste',
  'vergleich',
  'faktencheck',
  'infografik',
];
/** A cover headline alone on a colour: larger, filling up to this share of the height. */
export const HEADLINE_COVER_MAX = 260;
/** `groesse: 'gross'` — "Schrift größer": the caps rise by this much, where the slide has room. */
export const HEADLINE_GROSS = 1.3;
export const COVER_SHARE = 0.6;
export const QUOTE_ALONE_MAX = 120;
/** Paragraphs stay at most this share of the headline size. */
export const HEADLINE_RATIO = 1.8;
/** Top padding of a block that starts at the canvas top, measured on the posts. */
export const TOP_PAD: Record<SharepicCreatorLocale, number> = { 'de-DE': 110, 'de-AT': 120 };
/** AT centred text: ~100 px side margins on the argument slides. */
export const AT_CENTRED_MARGIN = 100;
/** Date circle on a colour or photo slide: free in the bottom-right corner. */
export const DATE_CIRCLE = { radius: 170, right: 40, bottom: 50 } as const;
