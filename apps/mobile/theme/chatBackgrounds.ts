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
  // Drawn as meshes, not as one glow — see CHAT_BACKGROUND_MESHES below. Null
  // keeps every consumer of this table (the settings swatch, the single-glow
  // renderer) from treating them as one-colour presets by accident.
  mesh: null,
  nebel: null,
  dunst: null,
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

/** One point of a cloud's falloff: how opaque it is that far out. */
export interface MeshStop {
  /** Fraction of the radius. */
  offset: number;
  opacity: number;
}

/** One soft colour cloud. */
export interface MeshLayer {
  /** Opaque colour; every stop shares it and varies only in alpha. */
  color: string;
  /** Centre, as a fraction of the surface. May sit outside 0…1. */
  cx: number;
  cy: number;
  /** Radii, as fractions of the surface's width and height. */
  rx: number;
  ry: number;
  stops: readonly MeshStop[];
}

/** A whole mesh: clouds over a flat ground. */
export interface MeshPreset {
  /** Omitted for a glow that tints whatever it is laid over. */
  base?: string;
  /** In paint order, bottom first — see the note on ordering below. */
  layers: readonly MeshLayer[];
}

/** Shorthand for the common case: full strength at the core, gone at `end`. */
function cloud(
  color: string,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  opacity: number,
  end: number
): MeshLayer {
  return {
    color,
    cx,
    cy,
    rx,
    ry,
    stops: [
      { offset: 0, opacity },
      { offset: end, opacity: 0 },
    ],
  };
}

/**
 * The mesh chat backgrounds, ported 1:1 from the design document
 * (claude.ai/design, "Grünerator Mobile"), where each is a CSS `background` of
 * several `radial-gradient()`s over a flat colour.
 *
 * The translation is exact rather than approximate, and it is worth saying why
 * each part can be:
 *
 * - A CSS radial with two sizes is an **ellipse** whose radii are fractions of
 *   the box's width and height. `react-native-svg`'s `RadialGradient` takes
 *   `rx`/`ry` separately and defaults to `objectBoundingBox` units, so the same
 *   two numbers mean the same two things. A single `LinearGradient`, which is
 *   what `expo-linear-gradient` offers, cannot express this at all.
 * - Every stop of a layer carries the **same colour** and differs only in
 *   alpha, so CSS's premultiplied interpolation and SVG's separate
 *   `stop-color`/`stop-opacity` interpolation produce identical pixels. A layer
 *   fading between two different hues would not survive this translation.
 * - Past its last stop a CSS gradient holds that stop's value, which is fully
 *   transparent here — so does SVG. Nothing paints outside the falloff.
 * - Centres outside 0…1 (`at 50% -4%`, `at 88% 110%`) are coordinates, not
 *   clamped positions; both engines simply place the ellipse off-surface.
 *
 * **Order is reversed on purpose.** In CSS the first listed background layer is
 * the topmost; stacked SVG rects paint in document order. These arrays are in
 * paint order, bottom-first, so each reads as the inverse of its CSS source.
 */
export const CHAT_BACKGROUND_MESHES: Partial<Record<ChatBackground, MeshPreset>> = {
  /**
   * Round 1. The strongest of the three: no white veil, so the colour reaches
   * the middle of the screen and the composer sits on tinted ground.
   */
  mesh: {
    base: '#FCF9F4',
    layers: [
      cloud('#FDF7ED', 0.5, 0, 1.1, 0.55, 1, 0.6),
      cloud('#D7D5F3', 0.82, 1, 0.85, 0.55, 0.9, 0.58),
      cloud('#C7E4D7', 0.92, 0.58, 0.95, 0.65, 0.95, 0.62),
      cloud('#F4EEBA', 0.44, 0.82, 1.0, 0.7, 0.85, 0.6),
      cloud('#F8CDC5', 0.12, 0.24, 1.2, 0.8, 0.95, 0.62),
    ],
  },

  /**
   * Round 2, variant 2a. The same four colours spread wider and weaker, with a
   * white haze over the centre — that layer is what frees the composer from the
   * colour rather than fading the colour itself, which is why it is a layer and
   * not a lower alpha on the clouds.
   */
  nebel: {
    base: '#FDFBF7',
    layers: [
      cloud('#FDF8F0', 0.5, -0.04, 1.3, 0.62, 1, 0.64),
      cloud('#DCDAF4', 0.84, 1.02, 1.2, 0.75, 0.5, 0.66),
      cloud('#CEE6DB', 0.96, 0.56, 1.3, 0.85, 0.55, 0.7),
      cloud('#F4EFC7', 0.44, 0.84, 1.4, 0.9, 0.5, 0.68),
      cloud('#F8D6CF', 0.1, 0.2, 1.5, 1.0, 0.6, 0.7),
      {
        color: '#FFFFFF',
        cx: 0.5,
        cy: 0.5,
        rx: 1.3,
        ry: 0.78,
        stops: [
          { offset: 0, opacity: 0.82 },
          { offset: 0.38, opacity: 0.45 },
          { offset: 0.68, opacity: 0.08 },
          { offset: 0.88, opacity: 0 },
        ],
      },
    ],
  },

  /**
   * Round 2, variant 2c. Colour pooled along the bottom edge — three of the
   * four clouds sit at or past 84% height — under a white veil centred high, so
   * the greeting reads on near-white and the tint gathers under the composer.
   */
  dunst: {
    base: '#FDFCFA',
    layers: [
      cloud('#FDF9F2', 0.5, 0, 1.2, 0.4, 1, 0.58),
      cloud('#DBD9F5', 0.88, 1.1, 1.1, 0.4, 0.6, 0.62),
      cloud('#CBE5D9', 0.96, 0.84, 1.2, 0.46, 0.7, 0.66),
      cloud('#F4EEC0', 0.56, 1.04, 1.3, 0.44, 0.7, 0.66),
      cloud('#F8D2CA', 0.14, 0.92, 1.2, 0.46, 0.75, 0.68),
      {
        color: '#FFFFFF',
        cx: 0.5,
        cy: 0.24,
        rx: 1.2,
        ry: 0.6,
        stops: [
          { offset: 0, opacity: 0.95 },
          { offset: 0.46, opacity: 0.6 },
          { offset: 0.82, opacity: 0 },
        ],
      },
    ],
  },
};

/** The mesh a preset draws, or null for the single-glow presets. */
export function chatBackgroundMesh(key: ChatBackground): MeshPreset | null {
  return CHAT_BACKGROUND_MESHES[key] ?? null;
}

/**
 * Light gathered around the composer, and nowhere else — what the conversation
 * screen wears instead of a full-screen mesh.
 *
 * A thread is a wall of bubbles and quoted text, and colour behind those costs
 * legibility the start screen never has to pay. Confined to a band at the foot
 * of the screen, the same palette becomes an accent on the composer rather than
 * a tint on the reading.
 *
 * Three things make it a band rather than a cropped mesh:
 *
 * - **No base.** A flat ground would draw the band's own rectangle. Without one
 *   the clouds tint whatever the page already is, so the band has no edges of
 *   its own — only its clouds' falloff.
 * - **Every cloud centred at or below the bottom edge** (`cy` ≥ 0.98), so the
 *   band is brightest where the composer sits and dissolves upward.
 * - **Falloffs that complete inside the band.** The largest reaches zero at
 *   0.72 of its radius; nothing is still painting at the band's top edge, which
 *   is what keeps the top from reading as a seam.
 *
 * Geometry is in the *band's* box, not the screen's — `MeshSurface` is given a
 * height, and these fractions are of that. Reusing `dunst`'s numbers here would
 * put its clouds far off-screen.
 */
export const COMPOSER_GLOW: MeshPreset = {
  layers: [
    cloud('#DBD9F5', 0.88, 1.12, 0.7, 0.85, 0.34, 0.7),
    cloud('#CBE5D9', 0.94, 1.0, 0.7, 0.8, 0.4, 0.72),
    cloud('#F4EEC0', 0.52, 1.14, 0.8, 0.85, 0.36, 0.7),
    cloud('#F8D2CA', 0.1, 0.98, 0.75, 0.8, 0.42, 0.72),
  ],
};

/** How tall the composer's glow band is, before `typeScale`. */
export const COMPOSER_GLOW_HEIGHT = 260;

/**
 * What the conversation drawer wears: `nebel`'s palette, rearranged.
 *
 * Same colours, same radii, same alphas, same white haze — only the four clouds
 * trade places, so that **green sits top left** instead of the peach. That
 * corner is where the Grünerator wordmark is; peach arriving under it read as a
 * warning tone rather than as the brand.
 *
 * Rearranged rather than recoloured on purpose: it stays recognisably the same
 * background as the start screen, which is what makes the drawer feel like part
 * of the same surface sliding out rather than a second one.
 *
 * The other three follow from that move: peach takes the bottom left, lilac the
 * right edge, and the yellow keeps the foot of the panel, where it sits under
 * the profile row.
 */
export const DRAWER_MESH: MeshPreset = {
  base: '#FDFBF7',
  layers: [
    cloud('#FDF8F0', 0.5, -0.04, 1.3, 0.62, 1, 0.64),
    cloud('#DCDAF4', 1.0, 0.42, 1.2, 0.75, 0.5, 0.66),
    cloud('#F4EFC7', 0.6, 1.02, 1.4, 0.9, 0.5, 0.68),
    cloud('#F8D6CF', 0.08, 0.92, 1.5, 1.0, 0.6, 0.7),
    cloud('#CEE6DB', 0.05, 0.12, 1.3, 0.85, 0.55, 0.7),
    {
      color: '#FFFFFF',
      cx: 0.5,
      cy: 0.5,
      rx: 1.3,
      ry: 0.78,
      stops: [
        { offset: 0, opacity: 0.82 },
        { offset: 0.38, opacity: 0.45 },
        { offset: 0.68, opacity: 0.08 },
        { offset: 0.88, opacity: 0 },
      ],
    },
  ],
};

/** Sets a colour's lightness while keeping its hue and saturation. */
function relight(hex: string, lightness: number): string {
  const n = parseInt(hex.slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => v / 255) as [
    number,
    number,
    number,
  ];
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }

  const c = (1 - Math.abs(2 * lightness - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lightness - c / 2;
  const seg = Math.floor(h / 60) % 6;
  const rgb = [
    [c, x, 0],
    [x, c, 0],
    [0, c, x],
    [0, x, c],
    [x, 0, c],
    [c, 0, x],
  ][seg] as [number, number, number];
  return (
    '#' +
    rgb
      .map((v) =>
        Math.round((v + m) * 255)
          .toString(16)
          .padStart(2, '0')
      )
      .join('')
      .toUpperCase()
  );
}

/** The page colour a dark mesh sits on — the same one the dark theme uses. */
const DARK_BASE = colors.grey[950];

/**
 * The dark-mode reading of a mesh.
 *
 * Not the same operation for both kinds, because the two kinds mean different
 * things:
 *
 * - **A background** (it has a `base`) *is* the page. Dimming its pastels over
 *   black turns them into grey smudges — the hue survives, the colour does not.
 *   So the base becomes the dark page colour and each cloud keeps its hue and
 *   saturation at a low lightness, which reads as coloured depth rather than as
 *   a washed-out light theme. The white veil becomes the page colour: its job is
 *   to pull the middle back to the ground it sits on, and in the dark that
 *   ground is dark.
 * - **A glow** (no `base`) is light laid over whatever is behind it. Light stays
 *   light — darkening it would make it disappear against a dark page. It only
 *   gets quieter.
 */
export function darkMesh(mesh: MeshPreset): MeshPreset {
  if (!mesh.base) {
    return {
      layers: mesh.layers.map((layer) => ({
        ...layer,
        stops: layer.stops.map((stop) => ({ ...stop, opacity: stop.opacity * DARK_GLOW_STRENGTH })),
      })),
    };
  }

  return {
    base: DARK_BASE,
    layers: mesh.layers.map((layer) => ({
      ...layer,
      color: layer.color === '#FFFFFF' ? DARK_BASE : relight(layer.color, DARK_CLOUD_LIGHTNESS),
      stops: layer.stops.map((stop) => ({ ...stop, opacity: stop.opacity * DARK_CLOUD_ALPHA })),
    })),
  };
}

/** How light a cloud is in dark mode. Above ~0.28 it starts to glare. */
const DARK_CLOUD_LIGHTNESS = 0.19;
/** Dark clouds need no damping to stay readable, only a little restraint. */
const DARK_CLOUD_ALPHA = 0.85;
/** A glow is light on a dark page, so it survives only as a hint. */
const DARK_GLOW_STRENGTH = 0.3;
