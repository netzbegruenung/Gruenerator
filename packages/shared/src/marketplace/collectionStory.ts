import { type MarketplaceItem, type SharepicThema } from '@gruenerator/contracts';

import { type MarketplaceTarget } from './cache.js';

/**
 * The story of a collection: what its page tells between the cover and the
 * entries — why the collection exists, a number, a voice, the entries where
 * the text speaks of them. How to write and design one: docs/CLAUDE-collections.md.
 *
 * Blocks carry no look of their own (no colour, size or background): the
 * renderer decides, so every collection reads as one page.
 */
export type CollectionStoryBlock = {
  /** Leave out for both countries; a number or a law is one country's. */
  audience?: 'de-DE' | 'de-AT';
} & (
  | { type: 'text'; paragraphs: readonly string[] }
  /** One sentence or one number, set as large as the title. A number needs a `source`. */
  | {
      type: 'claim';
      text: string;
      note: string;
      source: { label: string; url: string } | null;
    }
  | { type: 'quote'; text: string; by: string }
  /** `rows` for Agents and Rezepte, `gallery` for everything with a picture. */
  | {
      type: 'items';
      display: 'rows' | 'gallery';
      heading?: string;
      items: readonly MarketplaceTarget[];
    }
  /** One entry with a short exchange that shows what it does; the answer stays under 200 characters. */
  | { type: 'example'; item: MarketplaceTarget; prompt: string; answer: string }
  /**
   * The Grünerator-Vorlagen of one theme from the private catalogue
   * (`/api/sharepic-vorlagen`), in the viewer's country. The page asks the
   * catalogue itself: the Vorlagen are party content and never in this repo.
   */
  | { type: 'vorlagen'; thema: SharepicThema; heading?: string }
);

/** A block as the page draws it: entries resolved to what this viewer may see. */
export type ResolvedStoryBlock =
  | Extract<CollectionStoryBlock, { type: 'text' | 'claim' | 'quote' | 'vorlagen' }>
  | {
      type: 'items';
      display: 'rows' | 'gallery';
      heading?: string;
      items: readonly MarketplaceItem[];
    }
  | { type: 'example'; item: MarketplaceItem; prompt: string; answer: string };

const keyOf = (t: MarketplaceTarget) => `${t.kind}:${t.ref}`;

/**
 * The blocks for one viewer: the other country's blocks leave, entries the
 * viewer may not see leave their block, a block left without entries leaves
 * too — and so does a text right before it, which would explain nothing.
 * Texts that end up next to each other become one.
 * `rest` is every entry no block shows, for the end of the page.
 */
export function resolveStory(
  story: readonly CollectionStoryBlock[],
  items: readonly MarketplaceItem[],
  locale: string | null
): { blocks: ResolvedStoryBlock[]; rest: MarketplaceItem[] } {
  const audience = locale === 'de-AT' ? 'de-AT' : 'de-DE';
  const byKey = new Map(items.map((i) => [keyOf(i), i]));
  const shown = new Set<string>();
  const blocks: ResolvedStoryBlock[] = [];

  for (const block of story) {
    if (block.audience && block.audience !== audience) continue;
    const prev = blocks.at(-1);
    if (block.type === 'items') {
      const found = block.items.flatMap((t) => byKey.get(keyOf(t)) ?? []);
      if (found.length === 0) {
        if (blocks.at(-1)?.type === 'text') blocks.pop();
        continue;
      }
      found.forEach((i) => shown.add(keyOf(i)));
      blocks.push({ ...block, items: found });
    } else if (block.type === 'example') {
      const item = byKey.get(keyOf(block.item));
      if (!item) {
        if (blocks.at(-1)?.type === 'text') blocks.pop();
        continue;
      }
      shown.add(keyOf(item));
      blocks.push({ ...block, item });
    } else if (block.type === 'text' && prev?.type === 'text') {
      // Two texts in a row (one per country, say) read as one: no block gap between them.
      blocks[blocks.length - 1] = {
        type: 'text',
        paragraphs: [...prev.paragraphs, ...block.paragraphs],
      };
    } else {
      blocks.push(block);
    }
  }
  return { blocks, rest: items.filter((i) => !shown.has(keyOf(i))) };
}
