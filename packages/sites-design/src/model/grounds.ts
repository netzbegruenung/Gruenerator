import {
  type SiteBlock,
  type SiteBlockType,
  type SiteVariant,
  type SupportedLocale,
} from '@gruenerator/contracts';

export type SiteGround = 'paper' | 'surface' | 'tint' | 'deep' | 'deeper' | 'vivid' | 'photo';
export type SitePart = 'header' | SiteBlockType | 'footer';

const GROUNDS: Record<SitePart, Record<SiteVariant, SiteGround>> = {
  header: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
  hero: { dunkel: 'surface', hell: 'surface', leuchtend: 'surface' },
  about: { dunkel: 'paper', hell: 'paper', leuchtend: 'paper' },
  heroImage: { dunkel: 'photo', hell: 'photo', leuchtend: 'photo' },
  themes: { dunkel: 'surface', hell: 'paper', leuchtend: 'deep' },
  actions: { dunkel: 'paper', hell: 'surface', leuchtend: 'paper' },
  socialFeed: { dunkel: 'surface', hell: 'paper', leuchtend: 'surface' },
  contact: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
  footer: { dunkel: 'deeper', hell: 'deep', leuchtend: 'deeper' },
};

export function sectionGround(
  variant: SiteVariant,
  part: SitePart,
  locale: SupportedLocale
): SiteGround {
  // Austrian light variant: the about section sits on a Hellgrün tint instead of plain white.
  if (locale === 'de-AT' && variant === 'hell' && part === 'about') return 'tint';
  return GROUNDS[part][variant];
}

/**
 * The ground a block takes when its neighbour above already has the same one, so two blocks
 * never melt into one band. Every ground here carries its own ink and accent tokens, so text
 * contrast stays what each ground already guarantees; the pairs differ visibly from each other
 * (cream/white in Germany; white/Hellgrün tint in Austria, where surface is white too). Photos
 * differ by their image and are left alone.
 */
const ALTERNATE: Record<SupportedLocale, Record<SiteGround, SiteGround>> = {
  'de-DE': {
    paper: 'surface',
    surface: 'paper',
    tint: 'surface',
    deep: 'deeper',
    deeper: 'deep',
    vivid: 'deep',
    photo: 'photo',
  },
  'de-AT': {
    paper: 'tint',
    surface: 'tint',
    tint: 'paper',
    deep: 'deeper',
    deeper: 'deep',
    vivid: 'deep',
    photo: 'photo',
  },
};

/** The ground a block paints on its own: a banner or contact with a photo sits on the photo. */
function ownGround(block: SiteBlock, variant: SiteVariant, locale: SupportedLocale): SiteGround {
  if (block.type === 'contact' && block.backgroundImageUrl !== '') return 'photo';
  if (block.type === 'heroImage') return block.imageUrl !== '' ? 'photo' : 'deep';
  return sectionGround(variant, block.type, locale);
}

/**
 * Ground per block id over the blocks the page shows. Hidden blocks (only on the editor canvas)
 * take their own ground and are skipped as neighbours, so the editor paints the others exactly
 * as the published page does.
 */
export function blockGrounds(
  blocks: readonly SiteBlock[],
  variant: SiteVariant,
  locale: SupportedLocale
): Map<string, SiteGround> {
  const grounds = new Map<string, SiteGround>();
  let above: SiteGround | null = null;
  for (const block of blocks) {
    const own = ownGround(block, variant, locale);
    if (block.hidden) {
      grounds.set(block.id, own);
      continue;
    }
    const ground: SiteGround = own === above ? ALTERNATE[locale][own] : own;
    grounds.set(block.id, ground);
    above = ground;
  }
  return grounds;
}
