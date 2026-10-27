import { type TextMarker } from '../utils/textUtils';

import { SHAREPIC_COLOR_HEX } from './chromeParts';

import type { SharepicCreatorLocale, SharepicItem } from '@gruenerator/contracts';

/** 6.5 % of the width — the margin the posts use. */
export const MARGIN = 70;
export const GAP = 30;
export const FOOTER = 130;
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
