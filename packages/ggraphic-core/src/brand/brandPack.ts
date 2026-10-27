// SPDX-License-Identifier: MPL-2.0

/**
 * A brand as data: the colours, grounds, fonts and marks a template reads
 * instead of hardcoding a look. The host hands in the pack in use; a pack
 * changes values, never behaviour. Fields join when a template needs one —
 * a layout that differs per brand becomes a field here, not a branch.
 */
export interface BrandPack {
  /** Stable key, stored with documents. Never rename one that has shipped. */
  id: string;
  /** Shown where a person picks the brand. */
  name: string;
  colors: BrandColors;
  /** Grounds offered on solid-background templates, in picker order. */
  backgrounds: BrandBackground[];
  /** `color` of the ground a new design starts on; one of `backgrounds`. */
  defaultBackground: string;
  /** Colours every colour picker offers, in picker order. */
  palette: BrandSwatch[];
  /** The colours offered for text, in picker order. */
  textPalette: BrandSwatch[];
  /** Text-marker boxes, the first one the default; `ink` is the dark text on them. */
  markers: { swatches: BrandSwatch[]; ink: string };
  /** Chart series, strongest first, one colour per part of a pie. */
  chart: readonly string[];
  fonts: BrandFonts;
  /** Font files the host loads before rendering; empty = the host provides the families. */
  fontFaces: BrandFontFace[];
  /** Headline line height = font size × this factor. */
  lineHeightFactor: number;
  /** The brand's mark on designs; null when the brand sets none. */
  logo: BrandImage | null;
  /** The quotation-mark graphic; null = typographic quotes. */
  quoteMark: { src: string } | null;
}

export interface BrandColors {
  /** Main colour and the default solid ground. */
  primary: string;
  secondary: string;
  /** Emphasised headline words and quote authors on dark ground. */
  accent: string;
  /** The same emphasis on white or light ground. */
  accentOnLight: string;
  /** Attention badge on a design. */
  attention: string;
  textOnDark: string;
  textOnLight: string;
  /** Light neutral ground behind a design that brings no background of its own. */
  surface: string;
}

export interface BrandSwatch {
  /** Stable key, stored with documents. */
  id: string;
  label: string;
  color: string;
}

export interface BrandBackground extends BrandSwatch {
  /** Text colour on this ground. */
  ink: string;
  /** Radial glow the ground is painted as, centre first; absent = flat. */
  glow?: readonly string[];
}

export interface BrandFonts {
  headline: string;
  body: string;
  /** Short quotes: a bold sans. */
  quoteShort: string;
  /** Emphasised words and long quotes. */
  quoteEmphasis: string;
  /** Families whose bold cut is declared as a family of its own, regular → bold. */
  boldFamilies?: Readonly<Record<string, string>>;
}

export interface BrandFontFace {
  family: string;
  /** File URL; a pack resolves its own files with `new URL(…, import.meta.url)`. */
  src: string;
  weight?: number;
  style?: 'normal' | 'italic';
}

export interface BrandImage {
  src: string;
  /** Alternative text. */
  label: string;
}
