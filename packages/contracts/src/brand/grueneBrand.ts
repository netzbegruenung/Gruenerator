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

import { type BackgroundColorOption, type BrandPack, type ComposerBrand } from '@ggraphic/core';

import {
  brandIdFor,
  type SharepicBrand,
  type SharepicBrandId,
  type SharepicColor,
} from '../schemas/sharepicCreator.js';

export const GRUENE_SYSTEM_ASSETS = {
  sunflower: {
    yellow: {
      src: '/Sonnenblume.png',
      label: 'Sonnenblume (Gelb)',
    },
    green: {
      src: '/sonnenblume_dunkelgruen.svg',
      label: 'Sonnenblume (Grün)',
    },
    // Light-green flower matching the Info sharepic's server render
    // (apps/api/public/sonnenblume_gruen.png).
    greenLight: {
      src: '/sonnenblume_gruen.png',
      label: 'Sonnenblume (Hellgrün)',
    },
    white: {
      src: '/sonnenblume_weiss.svg',
      label: 'Sonnenblume (Weiß)',
    },
    black: {
      src: '/sonnenblume_schwarz.svg',
      label: 'Sonnenblume (Schwarz)',
    },
  },
  quoteWhite: {
    src: '/quote-white.svg',
    label: 'Anführungszeichen (Weiß)',
  },
  // Österreich (de-AT): das Anführungszeichen steht dort in Gelb (CI 2026).
  quoteGelb: {
    src: '/quote-gelb.svg',
    label: 'Anführungszeichen (Gelb)',
  },
  // Deutschland (de-DE) — Wortmarke "BÜNDNIS 90 / DIE GRÜNEN". Die Farbfassung
  // (sandfarbene Schrift) ist für dunkle Hintergründe gedacht.
  logoDe: {
    farbe: {
      src: '/gruene-de-logo.png',
      label: 'Logo Bündnis 90/Die Grünen',
    },
    weiss: {
      src: '/gruene-de-logo-weiss.png',
      label: 'Logo weiß',
    },
    schwarz: {
      src: '/gruene-de-logo-schwarz.png',
      label: 'Logo schwarz',
    },
  },
  // Österreich (de-AT) — reduziertes Ein-Balken-Logo "G DIE GRÜNEN" (CI 2026)
  logoAt: {
    weiss: {
      src: '/gruene-at-logo-weiss.png',
      label: 'Die Grünen (weiß)',
    },
    gruen: {
      src: '/gruene-at-logo-gruen.png',
      label: 'Die Grünen (grün)',
    },
  },
  // Österreich (de-AT): der Wischen-Pfeil der Karussells als Pinselstrich.
  brushArrow: {
    weiss: {
      src: '/brush-arrow-weiss.svg',
      label: 'Pinselpfeil (Weiß)',
    },
    gruen: {
      src: '/brush-arrow-gruen.svg',
      label: 'Pinselpfeil (Grün)',
    },
  },
  // GRÜNE JUGEND Deutschland: die Wortmarke (13° steigend, 790 × 386) in den
  // drei Farben des CD 2024 (S. 6): schwarz, hellgrün, weiß.
  logoGj: {
    schwarz: { src: '/gj-logo-schwarz.svg', label: 'GRÜNE JUGEND (schwarz)' },
    hellgruen: { src: '/gj-logo-hellgruen.svg', label: 'GRÜNE JUGEND (hellgrün)' },
    weiss: { src: '/gj-logo-weiss.svg', label: 'GRÜNE JUGEND (weiß)' },
  },
  backgrounds: {
    info: {
      tanne: '/Info_bg_tanne.png',
      sand: '/Info_bg_sand.png',
    },
  },
} as const;

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
export type GruenePack = BrandPack & {
  id: GrueneBrandId;
  quoteMark: { src: string };
  composer: ComposerBrand;
};

/** The Grünerator's packs; per-brand data elsewhere (themes) is keyed by them. */
export type GrueneBrandId = SharepicBrandId;

// DE composer inks. Literal on purpose: the composer's SHAREPIC_COLOR_HEX,
// KLEE and LIME import this module, so importing them back would be a cycle.
const DE_TANNE = '#005538';
const DE_DUNKELTANNE = '#00261A';
const DE_GRASGRUEN = '#00CC4F';
const DE_KLEE = '#008939';
const DE_LIME = '#BEFF60';
// AT colours that both `colors` and `composer` name.
const AT_DUNKELGRUEN = '#257639';
const AT_GELB = '#FCEC00';
const AT_MAGENTA = '#E4007C';

// Image tints, shadow and outline swatches: the same in both countries.
const GRUENE_EFFECTS = {
  tints: ['#005538', '#008939', '#257639', '#56AF31'],
  shadows: ['#000000', '#316049', '#40200e', '#1f3a5f'],
  outlines: ['#ffffff', '#000000', '#316049', '#e6007e'],
};

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
    surface: '#F5F1E9', // Sand
  },
  backgrounds: [
    { id: 'tanne', label: 'Tanne', color: '#005538', ink: '#ffffff' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9', ink: '#005538' },
  ],
  defaultBackground: '#005538',
  palette: [
    { id: 'tanne', label: 'Tanne', color: '#005538' },
    { id: 'klee', label: 'Klee', color: '#008939' },
    { id: 'grashalm', label: 'Grashalm', color: '#8ABD24' },
    { id: 'himmel', label: 'Himmel', color: '#0BA1DD' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    { id: 'hellgruen', label: 'Hellgrün', color: '#6CCD87' },
    { id: 'dunkelgrau', label: 'Dunkelgrau', color: '#2E2E3D' },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'black', label: 'Schwarz', color: '#000000' },
  ],
  textPalette: [
    { id: 'black', label: 'Schwarz', color: '#000000' },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'tanne', label: 'Tanne', color: '#005538' },
    { id: 'sand', label: 'Sand', color: '#F5F1E9' },
    { id: 'klee', label: 'Klee', color: '#008939' },
  ],
  // Limette and Mint are the box colours of the DE posts (see
  // `sharepicLayoutConstants.ts` and `slideInk.ts`).
  markers: {
    swatches: [
      { id: 'limette', label: 'Limette', color: DE_LIME },
      { id: 'mint', label: 'Mint', color: '#77F6A5' },
      { id: 'grasgruen', label: 'Grasgrün', color: DE_GRASGRUEN },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    ],
    ink: DE_DUNKELTANNE,
  },
  // Light ones (grass green and lime) never open the list: on white they only
  // read next to a dark green.
  chart: [DE_DUNKELTANNE, DE_KLEE, DE_GRASGRUEN, DE_TANNE, DE_LIME],
  effects: GRUENE_EFFECTS,
  fonts: {
    headline: 'GrueneTypeNeue',
    body: 'PT Sans',
    quoteShort: 'GrueneTypeNeue',
    quoteEmphasis: 'GrueneTypeNeue',
  },
  fontFaces: [],
  lineHeightFactor: 1.2,
  logo: null,
  quoteMark: { src: GRUENE_SYSTEM_ASSETS.quoteWhite.src },
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
    features: {
      markerBox: true,
      zeilenboxen: true,
      kopfband: true,
      widowGuard: true,
      vergleichSpalten: true,
      hinweisPill: true,
    },
    darkText: DE_DUNKELTANNE,
    // Klee on light ground, white on grass green, lime on dark ground and photos.
    accent: { fill: { light: DE_KLEE, grass: '#FFFFFF', dark: DE_LIME }, emphasis: false },
    // Klee on light ground, Tanne on grass green, lime on dark ground and photos.
    badge: {
      light: { fill: DE_KLEE, ink: '#FFFFFF' },
      grass: { fill: DE_TANNE, ink: '#FFFFFF' },
      dark: { fill: DE_LIME, ink: DE_DUNKELTANNE },
    },
    // Tanne on light ground, lime everywhere else, grass green included.
    button: {
      light: { fill: DE_TANNE, ink: '#FFFFFF' },
      dark: { fill: DE_LIME, ink: DE_DUNKELTANNE },
    },
    cardAccent: DE_KLEE,
    ghostNumeral: { fill: { light: DE_GRASGRUEN, dark: DE_LIME }, opacity: 0.2 },
    countdownInk: { light: '#FFFFFF', dark: DE_DUNKELTANNE },
    handMarks: { white: '#FFFFFF', green: DE_KLEE, greenOnGrass: DE_TANNE },
    quoteStyle: 'card',
    // The "BÜNDNIS 90/DIE GRÜNEN" word mark (710 × 379), measured on the posts
    // (10/2026, Dd_BXcKiDy2/03, Ddouf0QiL1w/02): ~250–300 px, black in a tone
    // of the ground (muted on light, deep on grass green), white on dark.
    logo: {
      asset: {
        light: { assetId: 'gruene-de-logo-schwarz', opacity: 0.5 },
        grass: { assetId: 'gruene-de-logo-schwarz', opacity: 0.8 },
        dark: { assetId: 'gruene-de-logo-weiss', opacity: 1 },
      },
      size: 260,
      height: (260 * 379) / 710,
      bottom: 80,
    },
    // As on the current posts: Grasgrün with Dunkeltanne text, Tanne with
    // white on a grass-green surface, 7° ascending, as large as the text
    // block lets it grow.
    stoerer: {
      rotation: -7,
      colors: {
        light: { fill: DE_GRASGRUEN, ink: DE_DUNKELTANNE },
        grass: { fill: DE_TANNE, ink: '#FFFFFF' },
        dark: { fill: DE_GRASGRUEN, ink: DE_DUNKELTANNE },
      },
      size: 'fit',
    },
    headlineCase: 'satz',
    stoererShape: 'circle',
    cardStyle: 'plain',
    layout: {
      centredMargin: null,
      centreShortBlocks: false,
      listCard: 'always',
      tintPhotoStrip: false,
      // Never on a full-bleed photo.
      logoPlacement: 'left',
      swipeArrow: 'drawn',
      datumCircle: 'ink',
      contrastPanel: 'solid',
      sunflower: true,
      frageAccent: 'green',
      termine: 'spalte',
      raster: false,
    },
  },
};

export const GRUENE_AT: GruenePack = {
  id: 'gruene-at',
  name: 'Die Grünen Österreich',
  colors: {
    primary: AT_DUNKELGRUEN, // Hauptfarbe
    secondary: '#56af31', // Hellgrün
    accent: AT_GELB, // Headline-Hervorhebung
    accentOnLight: AT_DUNKELGRUEN, // 5.63:1 on white (Hellgrün: 2.77:1)
    attention: AT_MAGENTA, // Störer
    textOnDark: '#ffffff',
    textOnLight: '#257639',
    surface: '#FFFFFF',
  },
  backgrounds: [
    { id: 'dunkelgruen', label: 'Dunkelgrün', color: '#257639', ink: '#ffffff' },
    { id: 'hellgruen', label: 'Hellgrün', color: '#56af31', ink: '#ffffff', glow: HELLGRUEN_GLOW },
  ],
  defaultBackground: '#257639',
  // Palette, text colours and markers are not in use yet: the editor takes its
  // defaults from the first registered pack, GRUENE_DE, in both countries.
  palette: [
    { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT_DUNKELGRUEN },
    { id: 'hellgruen', label: 'Hellgrün', color: '#56af31' },
    { id: 'gelb', label: 'Gelb', color: AT_GELB },
    { id: 'magenta', label: 'Magenta', color: AT_MAGENTA },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'black', label: 'Schwarz', color: '#000000' },
  ],
  textPalette: [
    { id: 'black', label: 'Schwarz', color: '#000000' },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'dunkelgruen', label: 'Dunkelgrün', color: AT_DUNKELGRUEN },
  ],
  markers: {
    swatches: [
      { id: 'gelb', label: 'Gelb', color: AT_GELB },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    ],
    ink: AT_DUNKELGRUEN,
  },
  // Yellow never opens the list: on white it only reads next to a dark green.
  chart: [AT_DUNKELGRUEN, '#56af31', AT_GELB, '#0B6620', '#7CC650'],
  effects: GRUENE_EFFECTS,
  fonts: {
    headline: 'GothamNarrow-Ultra',
    body: 'GothamNarrow-Book',
    // Zitate tragen denselben Display-Schnitt wie Headlines und Untertitel —
    // Bold fiel als einziges AT-Sujet aus der Reihe.
    quoteShort: 'GothamNarrow-Ultra',
    quoteEmphasis: 'Vollkorn',
    // Gotham Book has no bold cut of its own; Bold is declared as a family.
    boldFamilies: { 'GothamNarrow-Book': 'GothamNarrow-Bold' },
  },
  fontFaces: [],
  lineHeightFactor: 0.9,
  logo: {
    src: GRUENE_SYSTEM_ASSETS.logoAt.weiss.src,
    label: GRUENE_SYSTEM_ASSETS.logoAt.weiss.label,
  },
  // Weiß in Konturform wie in Deutschland (CI 2026 S. 77, Gewessler-Posts).
  quoteMark: { src: GRUENE_SYSTEM_ASSETS.quoteWhite.src },
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
    // AT highlights with its yellow Vollkorn accent only and has no pills,
    // boxes or bands; a hint stays a line of text.
    features: {
      markerBox: false,
      zeilenboxen: false,
      kopfband: false,
      widowGuard: false,
      vergleichSpalten: false,
      hinweisPill: false,
    },
    darkText: AT_DUNKELGRUEN,
    // Yellow in Vollkorn Black Italic, its dark green on light ground.
    accent: { fill: { light: AT_DUNKELGRUEN, dark: AT_GELB }, emphasis: true },
    // The yellow accent on dark ground, its dark green on white.
    badge: {
      light: { fill: AT_DUNKELGRUEN, ink: '#FFFFFF' },
      dark: { fill: AT_GELB, ink: AT_DUNKELGRUEN },
    },
    button: {
      light: { fill: AT_DUNKELGRUEN, ink: '#FFFFFF' },
      dark: { fill: AT_GELB, ink: AT_DUNKELGRUEN },
    },
    cardAccent: AT_DUNKELGRUEN,
    // A third light green beside #56af31 and BILD_TINT's #56AF31, kept as found.
    ghostNumeral: { fill: { light: '#56AE33', dark: '#56AE33' }, opacity: 0.55 },
    countdownInk: { light: '#FFFFFF', dark: AT_DUNKELGRUEN },
    handMarks: { white: AT_GELB, green: AT_DUNKELGRUEN },
    // As on the Gewessler posts.
    quoteStyle: 'poster',
    // The "G DIE GRÜNEN" logo with claim (1410 × 1239), ~210 px: green on
    // light ground, white elsewhere.
    logo: {
      asset: {
        light: { assetId: 'gruene-at-logo-gruen', opacity: 1 },
        dark: { assetId: 'gruene-at-logo-weiss', opacity: 1 },
      },
      size: 210,
      height: (210 * 1239) / 1410,
      bottom: 91,
    },
    // Magenta with white text on every ground, one size for every text.
    stoerer: {
      rotation: -8,
      colors: {
        light: { fill: AT_MAGENTA, ink: '#FFFFFF' },
        dark: { fill: AT_MAGENTA, ink: '#FFFFFF' },
      },
      size: { radius: 125, fontSize: 38 },
    },
    headlineCase: 'satz',
    stoererShape: 'circle',
    cardStyle: 'plain',
    layout: {
      // ~100 px side margins on the argument slides.
      centredMargin: 100,
      centreShortBlocks: true,
      listCard: 'light',
      // The posts set a photo strip in green monochrome.
      tintPhotoStrip: true,
      // Only on the last slide, on a plain colour, never on a quote (2 of 42 posts).
      logoPlacement: 'closing',
      swipeArrow: 'brush',
      datumCircle: 'attention',
      contrastPanel: 'veil',
      sunflower: false,
      frageAccent: 'accent',
      termine: 'spalte',
      raster: false,
    },
  },
};

// GRÜNE JUGEND Deutschland, CD März 2024 (TAU), S. 11. The primaries carry
// white at 2.2–2.8:1 only, so text on them is black (as in the CD, S. 13/27).
const GJ_HELLGRUEN = '#C7FF7A';
const GJ_LAVENDEL = '#9F88FF';
const GJ_PINK = '#F28ADE';
const GJ_APRICOT = '#FF8568';
const GJ_DUNKELGRUEN = '#33C270';
const GJ_SCHWARZ = '#000000';

export const GJ_DE: GruenePack = {
  id: 'gj-de',
  name: 'GRÜNE JUGEND',
  colors: {
    primary: GJ_HELLGRUEN,
    secondary: GJ_LAVENDEL,
    accent: GJ_HELLGRUEN,
    accentOnLight: GJ_SCHWARZ,
    attention: GJ_SCHWARZ,
    textOnDark: '#ffffff',
    textOnLight: GJ_SCHWARZ,
    surface: '#FFFFFF',
  },
  backgrounds: [
    { id: 'limette', label: 'Hellgrün', color: GJ_HELLGRUEN, ink: GJ_SCHWARZ },
    { id: 'lavendel', label: 'Lavendel', color: GJ_LAVENDEL, ink: GJ_SCHWARZ },
    { id: 'pink', label: 'Pink', color: GJ_PINK, ink: GJ_SCHWARZ },
    { id: 'apricot', label: 'Apricot', color: GJ_APRICOT, ink: GJ_SCHWARZ },
    { id: 'wiese', label: 'Grün', color: GJ_DUNKELGRUEN, ink: GJ_SCHWARZ },
  ],
  defaultBackground: GJ_HELLGRUEN,
  palette: [
    { id: 'limette', label: 'Hellgrün', color: GJ_HELLGRUEN },
    { id: 'lavendel', label: 'Lavendel', color: GJ_LAVENDEL },
    { id: 'pink', label: 'Pink', color: GJ_PINK },
    { id: 'apricot', label: 'Apricot', color: GJ_APRICOT },
    { id: 'dunkelgruen', label: 'Dunkelgrün', color: GJ_DUNKELGRUEN },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'black', label: 'Schwarz', color: GJ_SCHWARZ },
  ],
  textPalette: [
    { id: 'black', label: 'Schwarz', color: GJ_SCHWARZ },
    { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    { id: 'limette', label: 'Hellgrün', color: GJ_HELLGRUEN },
  ],
  // The highlight bars (CD S. 19–21): white or light green, black text.
  markers: {
    swatches: [
      { id: 'limette', label: 'Hellgrün', color: GJ_HELLGRUEN },
      { id: 'white', label: 'Weiß', color: '#FFFFFF' },
    ],
    ink: GJ_SCHWARZ,
  },
  chart: [GJ_SCHWARZ, GJ_LAVENDEL, GJ_APRICOT, GJ_PINK, GJ_DUNKELGRUEN],
  effects: GRUENE_EFFECTS,
  fonts: {
    headline: 'WixMadeforDisplay-ExtraBold',
    body: 'WixMadeforText',
    quoteShort: 'WixMadeforDisplay-ExtraBold',
    quoteEmphasis: 'WixMadeforDisplay-ExtraBold',
    boldFamilies: { WixMadeforText: 'WixMadeforText-Bold' },
  },
  fontFaces: [],
  lineHeightFactor: 1.15,
  logo: null,
  quoteMark: { src: GRUENE_SYSTEM_ASSETS.quoteWhite.src },
  composer: {
    lineHeight: { headline: 1.12, absatz: 1.35, aufruf: 1.08 },
    fontSize: {
      weiter: 30,
      absatz: 44,
      steckbriefGruss: 52,
      steckbriefName: 170,
      steckbriefTrait: 60,
    },
    absatzGap: 0.6,
    headlineFace: { absatz: false, infografikTitel: false, datum: false },
    features: {
      markerBox: true,
      zeilenboxen: true,
      kopfband: false,
      widowGuard: true,
      vergleichSpalten: true,
      hinweisPill: true,
    },
    darkText: GJ_SCHWARZ,
    // The posts highlight with bars (`++`); a `==` run stays black on the
    // primaries and turns light green on black and photos.
    accent: { fill: { light: GJ_SCHWARZ, dark: GJ_HELLGRUEN }, emphasis: false },
    badge: {
      light: { fill: GJ_SCHWARZ, ink: GJ_HELLGRUEN },
      dark: { fill: GJ_HELLGRUEN, ink: GJ_SCHWARZ },
    },
    button: {
      light: { fill: GJ_SCHWARZ, ink: '#FFFFFF' },
      dark: { fill: GJ_HELLGRUEN, ink: GJ_SCHWARZ },
    },
    cardAccent: GJ_SCHWARZ,
    ghostNumeral: { fill: { light: '#FFFFFF', dark: GJ_HELLGRUEN }, opacity: 0.35 },
    countdownInk: { light: '#FFFFFF', dark: GJ_SCHWARZ },
    handMarks: { white: '#FFFFFF', green: GJ_SCHWARZ },
    quoteStyle: 'card',
    // The word mark (790 × 386) on the text slides (CD S. 27, DbFqUILjMfU):
    // black on light ground, light green on black. The posts set it bottom-right
    // or bottom-left; left keeps it clear of the swipe arrow.
    logo: {
      asset: {
        light: { assetId: 'gj-logo-schwarz', opacity: 1 },
        dark: { assetId: 'gj-logo-hellgruen', opacity: 1 },
      },
      size: 220,
      height: (220 * 386) / 790,
      bottom: 64,
    },
    // The black burst with white text (DY1k7UhDK1S/04, Dba6T9SjPRb/04).
    stoerer: {
      rotation: -8,
      colors: {
        light: { fill: GJ_SCHWARZ, ink: '#FFFFFF' },
        dark: { fill: GJ_HELLGRUEN, ink: GJ_SCHWARZ },
      },
      size: { radius: 125, fontSize: 36 },
    },
    headlineCase: 'satz',
    stoererShape: 'burst',
    cardStyle: 'plain',
    // CD S. 19/20: the first line on white, the rest on light green.
    // Quotes on a full photo in light green, bold (Dem9hTrxHEG/01).
    quoteOnPhoto: GJ_HELLGRUEN,
    lineBoxes: {
      first: { fill: '#FFFFFF', ink: GJ_SCHWARZ },
      rest: { fill: GJ_HELLGRUEN, ink: GJ_SCHWARZ },
      onColour: { fill: GJ_SCHWARZ, ink: '#FFFFFF' },
    },
    layout: {
      centredMargin: null,
      centreShortBlocks: false,
      listCard: 'always',
      tintPhotoStrip: false,
      logoPlacement: 'left',
      swipeArrow: 'drawn',
      datumCircle: 'stoerer',
      contrastPanel: 'solid',
      sunflower: false,
      frageAccent: 'accent',
      termine: 'kachel',
      raster: false,
    },
  },
};

// Grüne Jugend Österreich: no CD exists. Colours measured on @gruenejugend.at
// (10/2026, design/styleguide-gj-at-2026.json). Its wide capitals face is
// unknown; Unbounded Black (SIL OFL) stands in until the federation names it.
const GJAT_WALDGRUEN = '#005424';
const GJAT_MAIGRUEN = '#92CE26';
const GJAT_CREME = '#F2F0E0';
const GJAT_GELB = '#FCD800';
const GJAT_VEILCHEN = '#5C448C';

export const GJ_AT: GruenePack = {
  id: 'gj-at',
  name: 'Grüne Jugend Österreich',
  colors: {
    primary: GJAT_WALDGRUEN,
    secondary: GJAT_MAIGRUEN,
    accent: GJAT_GELB,
    accentOnLight: GJAT_WALDGRUEN,
    attention: GJAT_GELB,
    textOnDark: GJAT_CREME,
    textOnLight: GJAT_WALDGRUEN,
    surface: GJAT_CREME,
  },
  backgrounds: [
    { id: 'waldgruen', label: 'Waldgrün', color: GJAT_WALDGRUEN, ink: GJAT_CREME },
    { id: 'maigruen', label: 'Maigrün', color: GJAT_MAIGRUEN, ink: GJAT_WALDGRUEN },
    { id: 'creme', label: 'Creme', color: GJAT_CREME, ink: GJAT_WALDGRUEN },
  ],
  defaultBackground: GJAT_WALDGRUEN,
  palette: [
    { id: 'waldgruen', label: 'Waldgrün', color: GJAT_WALDGRUEN },
    { id: 'maigruen', label: 'Maigrün', color: GJAT_MAIGRUEN },
    { id: 'creme', label: 'Creme', color: GJAT_CREME },
    { id: 'gelb', label: 'Gelb', color: GJAT_GELB },
    { id: 'veilchen', label: 'Violett', color: GJAT_VEILCHEN },
    { id: 'black', label: 'Schwarz', color: '#000000' },
  ],
  textPalette: [
    { id: 'waldgruen', label: 'Waldgrün', color: GJAT_WALDGRUEN },
    { id: 'creme', label: 'Creme', color: GJAT_CREME },
    { id: 'maigruen', label: 'Maigrün', color: GJAT_MAIGRUEN },
    { id: 'black', label: 'Schwarz', color: '#000000' },
  ],
  markers: {
    swatches: [
      { id: 'gelb', label: 'Gelb', color: GJAT_GELB },
      { id: 'maigruen', label: 'Maigrün', color: GJAT_MAIGRUEN },
    ],
    ink: GJAT_WALDGRUEN,
  },
  chart: [GJAT_WALDGRUEN, GJAT_MAIGRUEN, GJAT_GELB, GJAT_VEILCHEN, '#9C94D6'],
  effects: GRUENE_EFFECTS,
  fonts: {
    headline: 'Unbounded-Black',
    body: 'WixMadeforText',
    quoteShort: 'Unbounded-Black',
    quoteEmphasis: 'Unbounded-Black',
    boldFamilies: { WixMadeforText: 'WixMadeforText-Bold' },
  },
  fontFaces: [],
  lineHeightFactor: 1,
  logo: null,
  quoteMark: { src: GRUENE_SYSTEM_ASSETS.quoteWhite.src },
  composer: {
    lineHeight: { headline: 1.02, absatz: 1.3, aufruf: 1 },
    // The wide capitals face runs ~40 % wider than Gotham: smaller caps keep
    // a trait word whole (Unbounded, measured on the steckbrief render).
    fontSize: {
      weiter: 28,
      absatz: 44,
      steckbriefGruss: 30,
      steckbriefName: 120,
      steckbriefTrait: 32,
    },
    absatzGap: 0.7,
    // The capitals face also sets dates and infographic titles (DehRgj4jAe9).
    headlineFace: { absatz: false, infografikTitel: true, datum: true },
    features: {
      markerBox: false,
      zeilenboxen: false,
      kopfband: false,
      widowGuard: true,
      vergleichSpalten: false,
      hinweisPill: true,
    },
    darkText: GJAT_WALDGRUEN,
    // Yellow words on the dark grounds (DXybBB4DJgm/02), forest green on light.
    accent: { fill: { light: GJAT_WALDGRUEN, dark: GJAT_GELB }, emphasis: false },
    badge: {
      light: { fill: GJAT_WALDGRUEN, ink: GJAT_MAIGRUEN },
      dark: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
    },
    button: {
      light: { fill: GJAT_WALDGRUEN, ink: GJAT_CREME },
      dark: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
    },
    cardAccent: GJAT_WALDGRUEN,
    ghostNumeral: { fill: { light: GJAT_MAIGRUEN, dark: GJAT_MAIGRUEN }, opacity: 0.45 },
    countdownInk: { light: GJAT_CREME, dark: GJAT_WALDGRUEN },
    handMarks: { white: GJAT_GELB, green: GJAT_WALDGRUEN },
    quoteStyle: 'poster',
    // No logo file yet (`logoPlacement: 'none'`); the entry only fills the shape.
    logo: {
      asset: {
        light: { assetId: 'gj-logo-schwarz', opacity: 1 },
        dark: { assetId: 'gj-logo-weiss', opacity: 1 },
      },
      size: 220,
      height: (220 * 386) / 790,
      bottom: 64,
    },
    // The tilted yellow ellipse ("BOCK AUF FEMINISMUS?", DX6h17ujNpA/01).
    stoerer: {
      rotation: -10,
      colors: {
        light: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
        dark: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
      },
      size: { radius: 120, fontSize: 30 },
    },
    // Paragraphs on the dark grounds in light green (Db-_V4HCvrJ/01).
    absatzOnDark: GJAT_MAIGRUEN,
    headlineCase: 'versal',
    stoererShape: 'ellipse',
    cardStyle: 'brutal',
    // No line boxes in AT (`zeilenboxen` off); the accent line stands on a yellow label.
    lineBoxes: {
      first: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
      rest: { fill: GJAT_GELB, ink: GJAT_WALDGRUEN },
    },
    layout: {
      centredMargin: null,
      centreShortBlocks: false,
      listCard: 'always',
      tintPhotoStrip: false,
      logoPlacement: 'none',
      swipeArrow: 'drawn',
      datumCircle: 'etikett',
      contrastPanel: 'solid',
      sunflower: false,
      frageAccent: 'accent',
      termine: 'etikett',
      raster: true,
    },
  },
};

/** The BrandTheme a pack stands for — the shape getBrandTheme() has always returned. */
export function themeOf(locale: BrandLocale, pack: GruenePack): BrandTheme {
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
    fonts: {
      headline: pack.fonts.headline,
      body: pack.fonts.body,
      quoteShort: pack.fonts.quoteShort,
      quoteEmphasis: pack.fonts.quoteEmphasis,
    },
    lineHeightFactor: pack.lineHeightFactor,
    logo: pack.logo,
    quoteMark: pack.quoteMark,
  };
}

export const BRAND_THEMES: Record<BrandLocale, BrandTheme> = {
  'de-DE': themeOf('de-DE', GRUENE_DE),
  'de-AT': themeOf('de-AT', GRUENE_AT),
};

/** Every pack by its design id. */
export const BRAND_PACKS: Record<GrueneBrandId, GruenePack> = {
  'gruene-de': GRUENE_DE,
  'gruene-at': GRUENE_AT,
  'gj-de': GJ_DE,
  'gj-at': GJ_AT,
};

const BRAND_THEMES_BY_ID: Record<GrueneBrandId, BrandTheme> = {
  'gruene-de': BRAND_THEMES['de-DE'],
  'gruene-at': BRAND_THEMES['de-AT'],
  'gj-de': themeOf('de-DE', GJ_DE),
  'gj-at': themeOf('de-AT', GJ_AT),
};

/**
 * Resolve a brand pack, falling back to de-DE for unknown/undefined locales.
 * The brand picks the organisation within the country; absent: the party.
 */
export function getBrandPack(
  locale?: BrandLocale | string | null,
  brand?: SharepicBrand | null
): GruenePack {
  return BRAND_PACKS[brandIdFor(locale, brand)];
}

/** Resolve a brand theme, falling back to de-DE for unknown/undefined locales. */
export function getBrandTheme(
  locale?: BrandLocale | string | null,
  brand?: SharepicBrand | null
): BrandTheme {
  return BRAND_THEMES_BY_ID[brandIdFor(locale, brand)];
}

export const SHAREPIC_COLOR_HEX: Record<SharepicColor, string> = {
  tanne: '#005538',
  dunkeltanne: '#00261A',
  grasgruen: '#00CC4F',
  mint: '#D5EEE6',
  hellgrau: '#F2F2F2',
  // Measured on the candidates' text slides (Banaszak, 10/2026).
  creme: '#F5F1E8',
  aubergine: '#46102C',
  dunkelgruen: GRUENE_AT.colors.primary,
  hellgruen: GRUENE_AT.colors.secondary,
  weiss: '#FFFFFF',
  // Themed grounds. Lila is the purple the federal party already sets
  // (die_gruenen, "Frauen im Bundestag", 10/2026).
  lila: '#744A9E',
  flieder: '#E4D7F2',
  violett: '#732982',
  // A gradient (`GRADIENTS` in composeSharepic); this is its flat middle.
  pride: '#8A1D86',
  // The EU flag's Reflex Blue (Commission Regulation 821/2014, annex II) and
  // a pale sky that carries it as ink.
  europablau: '#003399',
  himmelblau: '#DCE6F7',
  limette: GJ_HELLGRUEN,
  apricot: GJ_APRICOT,
  lavendel: GJ_LAVENDEL,
  pink: GJ_PINK,
  schwarz: GJ_SCHWARZ,
  wiese: GJ_DUNKELGRUEN,
  waldgruen: GJAT_WALDGRUEN,
  maigruen: GJAT_MAIGRUEN,
  gelb: GJAT_GELB,
  veilchen: GJAT_VEILCHEN,
};
