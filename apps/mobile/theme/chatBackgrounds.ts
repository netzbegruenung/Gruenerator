import { type ChatBackground } from '@gruenerator/contracts';

import { colors } from './colors';

/**
 * What each chat-background preset looks like on mobile: one flat colour, not a
 * gradient.
 *
 * Web stores a CSS gradient per preset — several stops plus a fade — which has
 * no equivalent here: the picker draws plain circles, and the chat-start glow is
 * a single radial whose centre is one colour. So mobile keeps its own values out
 * of the app palette rather than borrowing web's stops, which are tuned for a
 * wide surface and read muddy on a phone.
 *
 * The keys come from `chatBackgroundSchema`; names and descriptions from
 * `@gruenerator/shared/settings`. Only the colour is ours.
 *
 * `null` means the preset paints nothing — the plain theme background shows.
 */
export const CHAT_BACKGROUND_COLORS: Record<ChatBackground, string | null> = {
  // Drawn as a mesh, not as one glow — see MESH_LAYERS below. Null keeps every
  // consumer of this table (the settings swatch, the single-glow renderer) from
  // treating it as a one-colour preset by accident.
  mesh: null,
  // The glow this screen had for a long time, and the default before `mesh`.
  sunrise: '#E9D696',
  tanne: colors.primary[500],
  // No blue or pink in the brand palette, so these two are defined here —
  // desaturated to sit at the same weight as the tokens either side of them.
  himmel: '#7FA8C9',
  sand: '#D8C7AC',
  magenta: '#D98FB4',
  regenbogen: '#B49BD6',
  neutral: null,
};

export function chatBackgroundColor(key: ChatBackground): string | null {
  return CHAT_BACKGROUND_COLORS[key];
}

/** One soft colour cloud of the `mesh` preset. */
export interface MeshLayer {
  /** Opaque colour of the cloud's core. */
  color: string;
  /** Alpha at the core. */
  opacity: number;
  /** Centre, as a fraction of the surface. */
  cx: number;
  cy: number;
  /** Radii, as fractions of the surface's width and height. */
  rx: number;
  ry: number;
  /** Fraction of the radius at which the cloud has faded to nothing. */
  end: number;
}

/** The flat ground the clouds sit on. */
export const MESH_BASE = '#FCF9F4';

/**
 * The `mesh` preset, ported 1:1 from the design document (claude.ai/design,
 * "Grünerator Mobile"), whose source is a CSS `background` of five
 * `radial-gradient()`s over `#FCF9F4`:
 *
 *   radial-gradient(120% 80% at 12% 24%, rgba(248,205,197,.95) 0%, …0) 62%)
 *   radial-gradient(100% 70% at 44% 82%, rgba(244,238,186,.85) 0%, …0) 60%)
 *   radial-gradient( 95% 65% at 92% 58%, rgba(199,228,215,.95) 0%, …0) 62%)
 *   radial-gradient( 85% 55% at 82% 100%, rgba(215,213,243,.90) 0%, …0) 58%)
 *   radial-gradient(110% 55% at 50%  0%, rgba(253,247,237,1.0) 0%, …0) 60%)
 *
 * The translation is exact rather than approximate, and it is worth saying why
 * each part can be:
 *
 * - A CSS radial with two sizes is an **ellipse** whose radii are fractions of
 *   the box's width and height. `react-native-svg`'s `RadialGradient` takes
 *   `rx`/`ry` separately and defaults to `objectBoundingBox` units, so the same
 *   two numbers mean the same two things. A single `LinearGradient`, which is
 *   what `expo-linear-gradient` offers, cannot express this at all.
 * - Both stops of each layer carry the **same colour** and differ only in
 *   alpha, so CSS's premultiplied interpolation and SVG's separate
 *   `stop-color`/`stop-opacity` interpolation produce identical pixels. Layers
 *   with two different hues would not survive this translation unchanged.
 * - Past its last stop a CSS gradient holds that stop's value, which is fully
 *   transparent here — so does SVG. Nothing paints outside the falloff.
 *
 * **Order is reversed on purpose.** In CSS the first listed background layer is
 * the topmost; stacked SVG rects paint in document order. This array is in
 * paint order, bottom-first, so it reads as the inverse of the CSS above.
 */
export const MESH_LAYERS: readonly MeshLayer[] = [
  { color: '#FDF7ED', opacity: 1, cx: 0.5, cy: 0, rx: 1.1, ry: 0.55, end: 0.6 },
  { color: '#D7D5F3', opacity: 0.9, cx: 0.82, cy: 1, rx: 0.85, ry: 0.55, end: 0.58 },
  { color: '#C7E4D7', opacity: 0.95, cx: 0.92, cy: 0.58, rx: 0.95, ry: 0.65, end: 0.62 },
  { color: '#F4EEBA', opacity: 0.85, cx: 0.44, cy: 0.82, rx: 1.0, ry: 0.7, end: 0.6 },
  { color: '#F8CDC5', opacity: 0.95, cx: 0.12, cy: 0.24, rx: 1.2, ry: 0.8, end: 0.62 },
];
