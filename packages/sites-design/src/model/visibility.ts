import {
  isRichTextDocEmpty,
  type PublishedSiteSnapshot,
  type SiteBlock,
  type SiteBlockType,
} from '@gruenerator/contracts';

import { safeHref, telHref } from './links.js';

export type SiteRenderMode = 'public' | 'preview';

/** The anchor of the first block of a type; later ones get `-2`, `-3`. */
export const SECTION_ANCHORS: Record<SiteBlockType, string> = {
  hero: 'start',
  about: 'ueber-mich',
  heroImage: 'botschaft',
  themes: 'themen',
  actions: 'mitmachen',
  socialFeed: 'instagram',
  contact: 'kontakt',
};

export function isBlockEmpty(block: SiteBlock, snapshot: PublishedSiteSnapshot): boolean {
  switch (block.type) {
    case 'hero':
      return false;
    case 'about':
      return block.title.trim() === '' && isRichTextDocEmpty(block.content);
    case 'heroImage':
      return block.imageUrl === '' && block.title.trim() === '';
    case 'themes':
    case 'actions':
      return block.items.length === 0;
    case 'socialFeed':
      return !block.instagramUsername;
    case 'contact':
      return (
        safeHref(`mailto:${snapshot.contact_email.trim()}`) === null &&
        telHref(snapshot.contact_phone) === null &&
        !Object.values(snapshot.social_links).some((link) => safeHref(link) !== null)
      );
  }
}

/**
 * The blocks the page shows, in list order. The public page skips empty ones; the preview keeps
 * them as placeholders. A hidden block only reaches the snapshot for the editor canvas, which
 * keeps it (marked) so it can be selected and shown again.
 */
export function visibleBlocks(
  snapshot: PublishedSiteSnapshot,
  mode: SiteRenderMode,
  editing = false
): SiteBlock[] {
  return snapshot.sections.blocks.filter((block) => {
    if (block.type === 'hero') return true;
    if (block.hidden) return editing;
    return mode === 'preview' || !isBlockEmpty(block, snapshot);
  });
}

/** Anchor per block id: the type's anchor for its first block, numbered for the next ones. */
export function blockAnchors(blocks: readonly SiteBlock[]): Map<string, string> {
  const seen = new Map<SiteBlockType, number>();
  const anchors = new Map<string, string>();
  for (const block of blocks) {
    const n = (seen.get(block.type) ?? 0) + 1;
    seen.set(block.type, n);
    const base = SECTION_ANCHORS[block.type];
    anchors.set(block.id, n === 1 ? base : `${base}-${n}`);
  }
  return anchors;
}
