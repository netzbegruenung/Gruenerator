import {
  type SiteBlock,
  type SiteBlockBackground,
  type SiteBlockType,
  type SiteVariant,
  type SupportedLocale,
} from '@gruenerator/contracts';

export type SiteGround = 'paper' | 'surface' | 'tint' | 'deep' | 'deeper' | 'vivid' | 'photo';
export type SitePart = SiteBlockType | 'footer';

/**
 * The header is white in every variant, as on gruene.de, so the hero is the part that shows the
 * variant right at the top of the page.
 */
export const HEADER_GROUND: SiteGround = 'paper';

const GROUNDS: Record<SitePart, Record<SiteVariant, SiteGround>> = {
  hero: { dunkel: 'deep', hell: 'surface', leuchtend: 'vivid' },
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

/** A block's own background on each country's palette; Austria has no cream, so "hell" is the tint. */
const BACKGROUND_GROUNDS: Record<
  SupportedLocale,
  Record<SiteBlockBackground, Exclude<SiteGround, 'photo'>>
> = {
  'de-DE': { weiss: 'paper', hell: 'surface', dunkel: 'deep', leuchtend: 'vivid' },
  'de-AT': { weiss: 'paper', hell: 'tint', dunkel: 'deep', leuchtend: 'vivid' },
};

export function backgroundGround(
  background: SiteBlockBackground,
  locale: SupportedLocale
): Exclude<SiteGround, 'photo'> {
  return BACKGROUND_GROUNDS[locale][background];
}

/**
 * Whether a photo is the block's background: a banner or contact with a photo, or the full-bleed
 * hero with a portrait. A chosen background has no effect then, so the editor leaves it out.
 */
export function blockOnPhoto(block: SiteBlock, hasPortrait: boolean): boolean {
  if (block.type === 'hero') return block.layout === 'vollbild' && hasPortrait;
  if (block.type === 'contact') return block.backgroundImageUrl !== '';
  if (block.type === 'heroImage') return block.imageUrl !== '';
  return false;
}

/**
 * The ground a block paints on its own: a photo first, then the background chosen for the block,
 * then the variant. A banner without its image and the full-bleed hero without a portrait fall
 * back to the deep green.
 */
function ownGround(
  block: SiteBlock,
  variant: SiteVariant,
  locale: SupportedLocale,
  hasPortrait: boolean
): SiteGround {
  if (blockOnPhoto(block, hasPortrait)) return 'photo';
  if (block.background) return backgroundGround(block.background, locale);
  if (block.type === 'hero' && block.layout === 'vollbild') return 'deep';
  if (block.type === 'heroImage') return 'deep';
  return sectionGround(variant, block.type, locale);
}

/**
 * An automatic block's ground: its own, or the next one in the `ALTERNATE` chain, the first that
 * differs from the block above and from a chosen background below. Both sides cannot always be
 * kept apart (Germany has two light grounds); then the block above wins, as it always has.
 */
function autoGround(
  own: SiteGround,
  above: SiteGround | null,
  below: SiteGround | null,
  locale: SupportedLocale
): SiteGround {
  const second = ALTERNATE[locale][own];
  const candidates = [own, second, ALTERNATE[locale][second]];
  return (
    candidates.find((ground) => ground !== above && ground !== below) ??
    candidates.find((ground) => ground !== above) ??
    own
  );
}

/**
 * Ground per block id over the blocks the page shows. A chosen background is kept as chosen;
 * automatic blocks step aside from their neighbours so two blocks never melt into one band
 * unless the person chose so. Hidden blocks (only on the editor canvas) take their own ground and
 * are skipped as neighbours, so the editor paints the others exactly as the published page does.
 */
export function blockGrounds(
  blocks: readonly SiteBlock[],
  variant: SiteVariant,
  locale: SupportedLocale,
  hasPortrait: boolean
): Map<string, SiteGround> {
  const grounds = new Map<string, SiteGround>();
  const shown = blocks.filter((block) => !block.hidden);
  const chosen = (block: SiteBlock | undefined) =>
    block?.background && !blockOnPhoto(block, hasPortrait)
      ? backgroundGround(block.background, locale)
      : null;
  let above: SiteGround | null = null;
  let shownIndex = 0;
  for (const block of blocks) {
    const own = ownGround(block, variant, locale, hasPortrait);
    if (block.hidden) {
      grounds.set(block.id, own);
      continue;
    }
    shownIndex += 1;
    const ground: SiteGround =
      own === 'photo' || chosen(block)
        ? own
        : autoGround(own, above, chosen(shown[shownIndex]), locale);
    grounds.set(block.id, ground);
    above = ground;
  }
  return grounds;
}
