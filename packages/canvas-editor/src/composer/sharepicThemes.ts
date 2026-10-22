/**
 * What a theme (`thema`) changes on a sharepic, as data: one entry per theme,
 * each role per ground side. The composer asks for a role, never for a theme
 * by name; a role a theme leaves out (`null`) keeps the locale's CD. A new
 * `sharepicThemaSchema` value fails to compile until it has an entry here.
 *
 * The theme's grounds live in the contracts (`SHAREPIC_THEMA_COLORS`), their
 * hex values in `SHAREPIC_COLOR_HEX`, gradients in `sharepicGround.ts`.
 */
import { type SharepicColor, type SharepicThema } from '@gruenerator/contracts';

import { EUROPA_ASSETS, PRIDE_FLAG_ASSET, SHAREPIC_COLOR_HEX, THEMA_INK } from './chromeParts';

/** A box or disc and the ink set on it. */
export interface ThemeInkPair {
  fill: string;
  ink: string;
}

/**
 * Light ground (white, mint, flieder …) and dark ground (dark colours and
 * photos). DE grass green counts as dark unless a role says otherwise.
 */
interface BySide<T> {
  light: T;
  dark: T;
}

export interface SharepicThemeDef {
  /**
   * DE `==word==` runs, figures and numerals. `null` on a side keeps the CD
   * there; `grass` overrides `dark` on DE grass green.
   */
  accent: BySide<string | null> & { grass?: string | null };
  /** AT accent on light ground; on dark ground AT keeps its CD yellow. */
  atAccentOnLight: string | null;
  /** The DE `++` marker box and the headline's accent line (`akzent`). */
  marker: BySide<ThemeInkPair>;
  /** Topic icons on a disc and the date circle; `null` keeps the CD's. */
  badge: BySide<ThemeInkPair> | null;
  /** Card titles on the white card (charts, lists). */
  cardAccent: string | null;
  /** Chart colours on the white chart card, given the locale's dark ink; the theme's first. */
  chartPalette: (dark: string) => readonly string[];
  /**
   * Date rows each set on a pill of the next colour, in white or `darkInk`,
   * whichever reads better; `null` sets plain rows.
   */
  terminePills: { colors: readonly string[]; darkInk: string } | null;
  /** A big figure runs through these colours; `null` keeps the accent. */
  kennzahlGradient: BySide<readonly string[]> | null;
  /** The theme's sign in the footer, a sticker the user can move or drop. */
  sign: {
    /** Layer id. */
    id: string;
    /** Every asset it can take — also how a hand-placed sign names its theme. */
    assets: readonly string[];
    on: (surface: SharepicColor | 'foto') => { assetId: string; width: number; height: number };
  } | null;
  /** AT sets a photo strip in green monochrome; a theme keeps its photo's colours. */
  keepsPhotoColours: boolean;
}

const lila = SHAREPIC_COLOR_HEX.lila;
const flieder = SHAREPIC_COLOR_HEX.flieder;
const blau = SHAREPIC_COLOR_HEX.europablau;
const gelb = THEMA_INK.sternenGelb;
/** The rainbow without its yellow, which is too light on white. */
const regenbogenOhneGelb = THEMA_INK.regenbogen.filter((c) => c !== THEMA_INK.flaggenGelb);

export const SHAREPIC_THEMES = {
  // Pride: flag yellow on dark DE ground, matching its marker; light ground
  // and AT keep the CD accent.
  queer: {
    accent: { light: null, dark: THEMA_INK.flaggenGelb, grass: null },
    atAccentOnLight: null,
    marker: {
      light: { fill: THEMA_INK.flaggenGelb, ink: THEMA_INK.violettDunkel },
      dark: { fill: THEMA_INK.flaggenGelb, ink: THEMA_INK.violettDunkel },
    },
    // No badge colours of its own: icons, discs and the date circle stay CD.
    badge: null,
    cardAccent: null,
    chartPalette: () => regenbogenOhneGelb,
    // The flag's six stripes, then Progress Pride's.
    terminePills: {
      colors: [...THEMA_INK.regenbogen, ...THEMA_INK.progress],
      darkInk: THEMA_INK.violettDunkel,
    },
    // Bright stops on dark ground; on light ground the deep ones.
    kennzahlGradient: {
      light: regenbogenOhneGelb,
      dark: ['#FF6B6B', '#FFB347', '#FFED00', '#4ADE80', '#60A5FA', '#C084FC'],
    },
    sign: {
      id: 'sc-pride-flagge',
      assets: [PRIDE_FLAG_ASSET],
      on: () => ({ assetId: PRIDE_FLAG_ASSET, width: 120, height: (120 * 300) / 480 }),
    },
    keepsPhotoColours: true,
  },
  // Frauen: lila on light ground, flieder on dark — lila is the purple the
  // federal party already sets.
  frauen: {
    accent: { light: lila, dark: flieder },
    atAccentOnLight: lila,
    marker: {
      light: { fill: lila, ink: '#FFFFFF' },
      dark: { fill: flieder, ink: THEMA_INK.lilaDunkel },
    },
    badge: {
      light: { fill: lila, ink: '#FFFFFF' },
      dark: { fill: flieder, ink: THEMA_INK.lilaDunkel },
    },
    cardAccent: lila,
    chartPalette: (dark) => [lila, dark, '#A57BCF', THEMA_INK.violettDunkel],
    terminePills: null,
    kennzahlGradient: null,
    sign: null,
    keepsPhotoColours: true,
  },
  // Europa: the flag's blue on light ground, the stars' yellow on dark.
  europa: {
    accent: { light: blau, dark: gelb },
    atAccentOnLight: blau,
    marker: {
      light: { fill: blau, ink: '#FFFFFF' },
      dark: { fill: gelb, ink: blau },
    },
    badge: {
      light: { fill: blau, ink: '#FFFFFF' },
      dark: { fill: gelb, ink: blau },
    },
    cardAccent: blau,
    // The flag's yellow is too light on the white card.
    chartPalette: (dark) => [blau, dark, '#5B83D6', '#9DB5E6'],
    terminePills: null,
    kennzahlGradient: null,
    // The ring of stars on its blue, the flag on any other ground.
    sign: {
      id: 'sc-europa',
      assets: [EUROPA_ASSETS.sterne, EUROPA_ASSETS.flagge],
      on: (surface) =>
        surface === 'europablau'
          ? { assetId: EUROPA_ASSETS.sterne, width: 150, height: 150 }
          : { assetId: EUROPA_ASSETS.flagge, width: 120, height: (120 * 320) / 480 },
    },
    keepsPhotoColours: true,
  },
} satisfies Record<SharepicThema, SharepicThemeDef>;

/** A slide's theme definition, or `null` for the plain CD. */
export const sharepicTheme = (thema: SharepicThema | null): SharepicThemeDef | null =>
  thema ? SHAREPIC_THEMES[thema] : null;
