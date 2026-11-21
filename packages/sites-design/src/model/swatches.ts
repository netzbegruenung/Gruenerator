import { type SiteVariant, type SupportedLocale } from '@gruenerator/contracts';

import { sectionGround, type SiteGround } from './grounds.js';

export interface SiteSwatch {
  ground: string;
  accent: string;
}

interface Palette {
  paper: string;
  surface: string;
  deep: string;
  deeper: string;
  vivid: string;
  highlight: string;
  accentLight: string;
  vividAccent: string;
  scrim: string;
}

// Mirrors the --site-palette-* values in styles/tokens.css; swatches.vitest.ts reads the CSS and
// fails when the two drift apart.
const PALETTES: Record<SupportedLocale, Palette> = {
  'de-DE': {
    paper: '#ffffff',
    surface: '#f5f1e9',
    deep: '#005538',
    deeper: '#00261a',
    vivid: '#00cc4f',
    highlight: '#beff60',
    accentLight: '#008939',
    vividAccent: '#005538',
    scrim: '#00261a',
  },
  'de-AT': {
    paper: '#ffffff',
    surface: '#ffffff',
    deep: '#257639',
    deeper: '#1b6630',
    vivid: '#56af31',
    highlight: '#fcec00',
    accentLight: '#e4007c',
    vividAccent: '#000000',
    scrim: '#1b6630',
  },
};

export const SWATCH_PALETTES = PALETTES;

function swatch(palette: Palette, ground: SiteGround): SiteSwatch {
  switch (ground) {
    case 'paper':
    case 'surface':
      return { ground: palette[ground], accent: palette.accentLight };
    case 'tint':
      // Only the about section uses the tint; hero and band never do, so no palette entry is mirrored.
      return { ground: palette.paper, accent: palette.accentLight };
    case 'deep':
    case 'deeper':
      return { ground: palette[ground], accent: palette.highlight };
    case 'vivid':
      return { ground: palette.vivid, accent: palette.vividAccent };
    case 'photo':
      return { ground: palette.scrim, accent: palette.highlight };
  }
}

/**
 * Leading ground and accent of the page top (the header: the hero is neutral in every variant),
 * and the same for the themes band, as the page paints them.
 */
export function variantSwatches(
  variant: SiteVariant,
  locale: SupportedLocale
): { hero: SiteSwatch; band: SiteSwatch } {
  const palette = PALETTES[locale];
  return {
    hero: swatch(palette, sectionGround(variant, 'header', locale)),
    band: swatch(palette, sectionGround(variant, 'themes', locale)),
  };
}
