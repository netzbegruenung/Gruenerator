/**
 * Country-brand tokens for 'presentations' documents (DE vs AT corporate
 * design): fonts, colours, logo. Single source for the web renderer
 * (SlideSurface/gruene-deck.css), the server PPTX export, the AI op-planner
 * prompt, and the mobile slide viewer — contracts is the only layer all three
 * already import. Values mirror the established CI sources
 * (packages/canvas-editor brand/theme.ts, apps/api pdfRenderer THEMES); do not
 * import those here (canvas-editor is browser-only, pdfRenderer is api-only).
 *
 * The brand itself is never user-facing: it is written once into the deck's
 * Y.Doc meta from the creating user's profile locale and read everywhere else.
 */

import { type SupportedLocale } from './schemas/userProfile.js';

export type PresentationBrand = SupportedLocale;

export interface PresentationBrandLogo {
  /** Asset path under the web app's public root (SVG allowed). */
  webPath: string;
  /** Filename under apps/api/public (PNG only — pptxgenjs has no SVG support). */
  apiFile: string;
}

export interface PresentationBrandTheme {
  brand: PresentationBrand;
  /** Deck accent used when meta.accentColor is unset. */
  defaultAccent: string;
  colors: {
    primary: string;
    accent: string;
    /** Soft tint for bullets/quote rules on dark surfaces. */
    onDarkSoft: string;
    ink: string;
  };
  /** CSS stacks; the font-face names load via the web app's typography.css. */
  cssFonts: { heading: string; body: string; quoteEmphasis: string | null };
  /**
   * PowerPoint fontFace names — must match the fonts' family metadata exactly
   * (read from the TTF/OTF name tables; pptxgenjs cannot embed fonts).
   */
  pptxFonts: {
    heading: string;
    body: string;
    /**
     * Quote-layout face; null falls back to `body`. Mirrors
     * `cssFonts.quoteEmphasis` — AT quotes are set in Vollkorn, which ships
     * only bold faces, so a renderer using it must also set bold.
     */
    quote: string | null;
  };
  /** Headline line-height (AT CI mandates 0.9 × font size). */
  headingLineHeight: number;
  /** "Marke (Akzentfarbe)" swatches offered in the design panel. */
  accentOptions: { value: string; name: string }[];
  /** "Hintergrund" swatches offered in the design panel. */
  backgroundSwatches: { value: string; name: string }[];
  /** Accent hexes advertised to the AI op-planner prompt. */
  aiPalette: string[];
  logo: {
    /** Variant for light slide backgrounds. */
    light: PresentationBrandLogo;
    /** Variant for dark slide backgrounds. */
    dark: PresentationBrandLogo;
    /** Render height in slide px (960×540 space). */
    heightPx: number;
    /** width / height, so exporters can size without decoding the image. */
    aspect: number;
    label: string;
  };
}

export const PRESENTATION_BRANDS: Record<PresentationBrand, PresentationBrandTheme> = {
  'de-DE': {
    brand: 'de-DE',
    defaultAccent: '#005538',
    colors: { primary: '#005538', accent: '#008939', onDarkSoft: '#a9d3be', ink: '#262a28' },
    cssFonts: {
      heading: "'GrueneTypeNeue', 'Raleway', 'PT Sans', system-ui, sans-serif",
      body: "'PT Sans', system-ui, -apple-system, 'Segoe UI', sans-serif",
      quoteEmphasis: null,
    },
    pptxFonts: { heading: 'GrueneType Neue', body: 'PT Sans', quote: null },
    headingLineHeight: 1.1,
    accentOptions: [
      { value: '#005538', name: 'Tanne' },
      { value: '#008939', name: 'Klee' },
      // Legacy default before country brands: kept so existing decks that
      // picked it still highlight in the panel.
      { value: '#316049', name: 'Moosgrün' },
    ],
    backgroundSwatches: [
      { value: '#005538', name: 'Tanne' },
      { value: '#008939', name: 'Klee' },
      { value: '#F5F1E9', name: 'Sand' },
      { value: '#ffffff', name: 'Weiß' },
    ],
    aiPalette: ['#005538', '#008939', '#316049'],
    logo: {
      light: { webPath: '/sonnenblume_dunkelgruen.svg', apiFile: 'sonnenblume_gruen.png' },
      dark: { webPath: '/Sonnenblume.png', apiFile: 'Sonnenblume.png' },
      heightPx: 56,
      aspect: 1,
      label: 'Sonnenblume',
    },
  },
  'de-AT': {
    brand: 'de-AT',
    defaultAccent: '#257639',
    colors: { primary: '#257639', accent: '#56af31', onDarkSoft: '#a4d78f', ink: '#262a28' },
    cssFonts: {
      heading: "'GothamNarrow-Ultra', 'Raleway', system-ui, sans-serif",
      body: "'GothamNarrow-Book', 'PT Sans', system-ui, sans-serif",
      quoteEmphasis: "'Vollkorn', Georgia, serif",
    },
    pptxFonts: { heading: 'Gotham Narrow', body: 'Gotham Narrow Book', quote: 'Vollkorn' },
    headingLineHeight: 0.9,
    accentOptions: [
      { value: '#257639', name: 'Dunkelgrün' },
      { value: '#56af31', name: 'Hellgrün' },
    ],
    backgroundSwatches: [
      { value: '#257639', name: 'Dunkelgrün' },
      { value: '#56af31', name: 'Hellgrün' },
      { value: '#ffffff', name: 'Weiß' },
    ],
    aiPalette: ['#257639', '#56af31'],
    logo: {
      light: { webPath: '/gruene-at-logo-gruen.png', apiFile: 'gruene-at-logo-gruen.png' },
      dark: { webPath: '/gruene-at-logo-weiss.png', apiFile: 'gruene-at-logo-weiss.png' },
      heightPx: 52,
      aspect: 1410 / 1239,
      label: 'Die Grünen',
    },
  },
};

export function getPresentationBrandTheme(brand?: string | null): PresentationBrandTheme {
  return brand && brand in PRESENTATION_BRANDS
    ? PRESENTATION_BRANDS[brand as PresentationBrand]
    : PRESENTATION_BRANDS['de-DE'];
}

export function isPresentationBrand(value: unknown): value is PresentationBrand {
  return typeof value === 'string' && value in PRESENTATION_BRANDS;
}
