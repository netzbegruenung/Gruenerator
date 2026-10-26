/**
 * Brand themes — per-locale design tokens for sharepic configs.
 *
 * Single source of truth for country-specific brand identity (colours, fonts,
 * logo, quote mark). The identity lives as data in two ggraphic brand packs,
 * GRUENE_DE and GRUENE_AT; BRAND_THEMES is read off them for the readers of
 * getBrandTheme(). A new locale = one pack and one entry in BRAND_THEMES; the
 * config factories and layout constants read tokens from here instead of
 * hardcoding Die-Grünen-Deutschland green.
 *
 * Mirrors the audience pattern in packages/shared/src/agents/audience.ts.
 *
 * de-AT sources: "Grüne CI Workshop 2026" (The Odd) — Dunkelgrün #257639
 * (Hauptfarbe), Hellgrün #56af31, Gelb #FCEC00 (Headline-Hervorhebung),
 * Magenta #E4007C (Störer); Fonts Gotham Narrow (Ultra/Book) + Vollkorn
 * (Betonung/Zitate); Zeilenabstand = Schriftgröße × 0,9; reduziertes
 * Ein-Balken-Logo "G DIE GRÜNEN".
 */

import { type BrandPack } from '@ggraphic/core';

import { SYSTEM_ASSETS } from '../utils/canvasAssets';

import { type ComposerBrand } from './composerBrand';

import type { BackgroundColorOption } from '../sidebar/types';

export type BrandLocale = 'de-DE' | 'de-AT';

export interface BrandTheme {
  locale: BrandLocale;
  colors: {
    /** dominant / main brand colour (solid-background default) */
    primary: string;
    /** secondary / alternative brand colour */
    secondary: string;
    /** highlight colour for emphasised headline words / quote authors */
    accent: string;
    /** highlight colour for emphasised words on white / light ground */
    accentOnLight: string;
    /** attention badge ("Störer") colour */
    stoerer: string;
    /** text colour on dark backgrounds */
    textOnDark: string;
    /** text colour on light backgrounds */
    textOnLight: string;
  };
  /** background options offered by the colour picker on solid-bg templates */
  backgroundColors: BackgroundColorOption[];
  /** default solid background colour */
  defaultBackgroundColor: string;
  /** background colour → derived text colour */
  textColorMap: Record<string, string>;
  fonts: {
    /** primary display / headline font */
    headline: string;
    /** body / subline / hierarchy font */
    body: string;
    /** short-quote font (bold sans) */
    quoteShort: string;
    /** emphasis word + long-quote font (serif italic) */
    quoteEmphasis: string;
  };
  /** headline line height = fontSize × lineHeightFactor */
  lineHeightFactor: number;
  /** party logo shown on sujets (null → template uses its own mark, e.g. sunflower) */
  logo: { src: string; label: string } | null;
  /** quotation-mark asset */
  quoteMark: { src: string };
}

/**
 * Hellgrün (#56AF31) carries white at 2.77:1. The posts never set text on it
 * flat but on a dark green with a light glow; the brightest stop keeps white at
 * 4.68:1 and yellow at 3.82:1.
 */
export const HELLGRUEN_GLOW = ['#318437', '#287A35', '#1B6630'] as const;

/**
 * Both packs set a quote mark, which every BrandTheme carries, and the
 * composer's per-brand values (see composerBrand.ts).
 */
type GruenePack = BrandPack & { quoteMark: { src: string }; composer: ComposerBrand };

export const GRUENE_DE: GruenePack = {
  id: 'gruene-de',
  name: 'Bündnis 90/Die Grünen',
  colors: {
    primary: '#005538', // Tanne
    secondary: '#6CCD87', // Hellgrün
    accent: '#008939', // Klee
    accentOnLight: '#008939', // Klee, 4.53:1 on white
    attention: '#00CC4F', // Grasgrün — Störer, as on the current posts
    textOnDark: '#ffffff',
    textOnLight: '#005538',
  },
  backgrounds: [
    { id: 'tanne', label: 'Tanne', color: '#005538', ink: '#ffffff' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9', ink: '#005538' },
  ],
  defaultBackground: '#005538',
  fonts: {
    headline: 'GrueneTypeNeue',
    body: 'PT Sans',
    quoteShort: 'GrueneTypeNeue',
    quoteEmphasis: 'GrueneTypeNeue',
  },
  fontFaces: [],
  lineHeightFactor: 1.2,
  logo: null,
  quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  composer: {
    lineHeight: { headline: 0.96, absatz: 1.22, aufruf: 1 },
    fontSize: {
      weiter: 30,
      absatz: 48,
      steckbriefGruss: 52,
      steckbriefName: 180,
      steckbriefTrait: 64,
    },
    absatzGap: 0.6,
    headlineFace: { absatz: false, infografikTitel: false, datum: false },
  },
};

export const GRUENE_AT: GruenePack = {
  id: 'gruene-at',
  name: 'Die Grünen Österreich',
  colors: {
    primary: '#257639', // Dunkelgrün — Hauptfarbe
    secondary: '#56af31', // Hellgrün
    accent: '#FCEC00', // Gelb — Headline-Hervorhebung
    accentOnLight: '#257639', // Dunkelgrün, 5.63:1 on white (Hellgrün: 2.77:1)
    attention: '#E4007C', // Magenta — Störer
    textOnDark: '#ffffff',
    textOnLight: '#257639',
  },
  backgrounds: [
    { id: 'dunkelgruen', label: 'Dunkelgrün', color: '#257639', ink: '#ffffff' },
    { id: 'hellgruen', label: 'Hellgrün', color: '#56af31', ink: '#ffffff', glow: HELLGRUEN_GLOW },
  ],
  defaultBackground: '#257639',
  fonts: {
    headline: 'GothamNarrow-Ultra',
    body: 'GothamNarrow-Book',
    // Zitate tragen denselben Display-Schnitt wie Headlines und Untertitel —
    // Bold fiel als einziges AT-Sujet aus der Reihe.
    quoteShort: 'GothamNarrow-Ultra',
    quoteEmphasis: 'Vollkorn',
  },
  fontFaces: [],
  lineHeightFactor: 0.9,
  logo: {
    src: SYSTEM_ASSETS.logoAt.weiss.src,
    label: SYSTEM_ASSETS.logoAt.weiss.label,
  },
  // Weiß in Konturform wie in Deutschland (CI 2026 S. 77, Gewessler-Posts).
  quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  composer: {
    lineHeight: { headline: 0.95, absatz: 1.08, aufruf: 0.98 },
    fontSize: {
      weiter: 34,
      absatz: 70,
      steckbriefGruss: 46,
      steckbriefName: 150,
      steckbriefTrait: 58,
    },
    // AT stacks its paragraphs ~80 px apart on the posts.
    absatzGap: 0.9,
    // Gotham Book has no bold cut; AT sets the whole date circle in the
    // poster face (Dc_L5vriG5z), where a synthetic bold would only smear it.
    headlineFace: { absatz: true, infografikTitel: true, datum: true },
  },
};

/** The BrandTheme a pack stands for — the shape getBrandTheme() has always returned. */
function themeOf(locale: BrandLocale, pack: GruenePack): BrandTheme {
  const { colors } = pack;
  return {
    locale,
    colors: {
      primary: colors.primary,
      secondary: colors.secondary,
      accent: colors.accent,
      accentOnLight: colors.accentOnLight,
      stoerer: colors.attention,
      textOnDark: colors.textOnDark,
      textOnLight: colors.textOnLight,
    },
    backgroundColors: pack.backgrounds.map(({ id, label, color }) => ({ id, label, color })),
    defaultBackgroundColor: pack.defaultBackground,
    textColorMap: Object.fromEntries(pack.backgrounds.map((ground) => [ground.color, ground.ink])),
    fonts: { ...pack.fonts },
    lineHeightFactor: pack.lineHeightFactor,
    logo: pack.logo,
    quoteMark: pack.quoteMark,
  };
}

export const BRAND_THEMES: Record<BrandLocale, BrandTheme> = {
  'de-DE': themeOf('de-DE', GRUENE_DE),
  'de-AT': themeOf('de-AT', GRUENE_AT),
};

const SURFACE_GLOWS: Record<string, readonly string[]> = Object.fromEntries(
  [GRUENE_DE, GRUENE_AT].flatMap((pack) =>
    pack.backgrounds.flatMap((ground) =>
      ground.glow ? [[ground.color.toLowerCase(), ground.glow] as const] : []
    )
  )
);

/**
 * The radial glow a stored plane colour is drawn as, centre first — null when
 * it is drawn flat. The stored value stays what documents, descriptors and
 * swatches carry; only the paint changes.
 */
export function surfaceGlow(color: string): readonly string[] | null {
  return SURFACE_GLOWS[color.toLowerCase()] ?? null;
}

/** Resolve a brand pack, falling back to de-DE for unknown/undefined locales. */
export function getBrandPack(locale?: BrandLocale | string | null): GruenePack {
  return locale === 'de-AT' ? GRUENE_AT : GRUENE_DE;
}

/** Resolve a brand theme, falling back to de-DE for unknown/undefined locales. */
export function getBrandTheme(locale?: BrandLocale | string | null): BrandTheme {
  if (locale && locale in BRAND_THEMES) {
    return BRAND_THEMES[locale as BrandLocale];
  }
  return BRAND_THEMES['de-DE'];
}
