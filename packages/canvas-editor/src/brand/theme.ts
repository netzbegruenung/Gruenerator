/**
 * Brand themes — per-locale design tokens for sharepic configs.
 *
 * Single source of truth for country-specific brand identity (colours, fonts,
 * logo, quote mark). A new locale = one entry in BRAND_THEMES; the config
 * factories and layout constants read tokens from here instead of hardcoding
 * Die-Grünen-Deutschland green.
 *
 * Mirrors the audience pattern in packages/shared/src/agents/audience.ts.
 *
 * de-AT sources: "Grüne CI Workshop 2026" (The Odd) — Dunkelgrün #257639
 * (Hauptfarbe), Hellgrün #56af31, Gelb #FCEC00 (Headline-Hervorhebung),
 * Magenta #E4007C (Störer); Fonts Gotham Narrow (Ultra/Book) + Vollkorn
 * (Betonung/Zitate); Zeilenabstand = Schriftgröße × 0,9; reduziertes
 * Ein-Balken-Logo "G DIE GRÜNEN".
 */

import { SYSTEM_ASSETS } from '../utils/canvasAssets';

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

export const BRAND_THEMES: Record<BrandLocale, BrandTheme> = {
  'de-DE': {
    locale: 'de-DE',
    colors: {
      primary: '#005538', // Tanne
      secondary: '#6CCD87', // Hellgrün
      accent: '#008939', // Klee
      stoerer: '#E5007D',
      textOnDark: '#ffffff',
      textOnLight: '#005538',
    },
    backgroundColors: [
      { id: 'tanne', label: 'Tanne', color: '#005538' },
      { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    ],
    defaultBackgroundColor: '#005538',
    textColorMap: {
      '#005538': '#ffffff',
      '#F5F1E9': '#005538',
    },
    fonts: {
      headline: 'GrueneTypeNeue',
      body: 'PTSans-Regular',
      quoteShort: 'GrueneTypeNeue',
      quoteEmphasis: 'GrueneTypeNeue',
    },
    lineHeightFactor: 1.2,
    logo: null,
    quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  },
  'de-AT': {
    locale: 'de-AT',
    colors: {
      primary: '#257639', // Dunkelgrün — Hauptfarbe
      secondary: '#56af31', // Hellgrün
      accent: '#FCEC00', // Gelb — Headline-Hervorhebung
      stoerer: '#E4007C', // Magenta — Störer
      textOnDark: '#ffffff',
      textOnLight: '#257639',
    },
    backgroundColors: [
      { id: 'dunkelgruen', label: 'Dunkelgrün', color: '#257639' },
      { id: 'hellgruen', label: 'Hellgrün', color: '#56af31' },
    ],
    defaultBackgroundColor: '#257639',
    textColorMap: {
      '#257639': '#ffffff',
      '#56af31': '#ffffff',
    },
    fonts: {
      headline: 'GothamNarrow-Ultra',
      body: 'GothamNarrow-Book',
      quoteShort: 'GothamNarrow-Bold',
      quoteEmphasis: 'Vollkorn',
    },
    lineHeightFactor: 0.9,
    logo: {
      src: SYSTEM_ASSETS.logoAt.weiss.src,
      label: SYSTEM_ASSETS.logoAt.weiss.label,
    },
    quoteMark: { src: SYSTEM_ASSETS.quote.white.src },
  },
};

/** Resolve a brand theme, falling back to de-DE for unknown/undefined locales. */
export function getBrandTheme(locale?: BrandLocale | string | null): BrandTheme {
  if (locale && locale in BRAND_THEMES) {
    return BRAND_THEMES[locale as BrandLocale];
  }
  return BRAND_THEMES['de-DE'];
}
