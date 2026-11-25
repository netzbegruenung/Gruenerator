import { type SiteBlock, type SiteVariant, type SupportedLocale } from '@gruenerator/contracts';

import { blockGrounds, HEADER_GROUND, sectionGround, type SiteGround } from './grounds.js';

interface Palette {
  paper: string;
  surface: string;
  tint: string;
  deep: string;
  deeper: string;
  vivid: string;
  scrim: string;
}

// Mirrors the --site-palette-* values in styles/tokens.css; swatches.vitest.ts reads the CSS and
// fails when the two drift apart.
const PALETTES: Record<SupportedLocale, Palette> = {
  'de-DE': {
    paper: '#ffffff',
    surface: '#f5f1e9',
    tint: '#ffffff',
    deep: '#005538',
    deeper: '#00261a',
    vivid: '#00cc4f',
    scrim: '#00261a',
  },
  'de-AT': {
    paper: '#ffffff',
    surface: '#ffffff',
    // tokens.css mixes it: color-mix(in srgb, #56af31 15%, #ffffff).
    tint: '#e6f3e0',
    deep: '#257639',
    deeper: '#1b6630',
    vivid: '#56af31',
    scrim: '#1b6630',
  },
};

export const SWATCH_PALETTES = PALETTES;

/** A photo ground shows the image under its scrim; the swatch takes the scrim colour. */
function groundColour(palette: Palette, ground: SiteGround): string {
  return ground === 'photo' ? palette.scrim : palette[ground];
}

/**
 * The page in miniature: one band per part from top to bottom (header, each shown block, footer),
 * painted as the page paints them in this variant. Keyed by block id, so a list keeps its rows.
 */
export function variantPreview(
  blocks: readonly SiteBlock[],
  hasPortrait: boolean,
  variant: SiteVariant,
  locale: SupportedLocale
): { key: string; colour: string }[] {
  const palette = PALETTES[locale];
  const grounds = blockGrounds(blocks, variant, locale, hasPortrait);
  const band = (key: string, ground: SiteGround) => ({
    key,
    colour: groundColour(palette, ground),
  });
  return [
    band('header', HEADER_GROUND),
    ...blocks
      .filter((block) => !block.hidden)
      .map((block) => band(block.id, grounds.get(block.id) ?? 'paper')),
    band('footer', sectionGround(variant, 'footer', locale)),
  ];
}
