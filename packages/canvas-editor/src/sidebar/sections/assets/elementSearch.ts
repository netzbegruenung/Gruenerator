import { rankByQuery } from '../../../utils/filterUtils';

import type { ElementItem } from './elementTypes';
import type { CatalogCategory, CategoryId } from './useElementCatalog';

/** Caps per kind in the search across all categories; a category's own search pages instead. */
const GLOBAL_CAP: Partial<Record<CategoryId, number>> = {
  illustrationen: 30,
  icons: 20,
  emoji: 30,
};

type SearchableCategory = Pick<CatalogCategory, 'id' | 'searchable' | 'items'>;

const rank = (items: readonly ElementItem[], query: string) =>
  rankByQuery(items, query, (item) => [item.label, item.keywords]);

/**
 * Search one category, or all searchable ones in catalogue order. Each group is
 * ranked BEFORE it is capped — otherwise the first matches in catalogue order
 * fill the cap and the best match never shows.
 */
export function searchElements(
  catalog: readonly SearchableCategory[],
  query: string,
  category: SearchableCategory | null
): ElementItem[] {
  if (category) return rank(category.items, query);
  const seen = new Set<string>();
  const out: ElementItem[] = [];
  for (const c of catalog) {
    if (!c.searchable) continue;
    let n = 0;
    const cap = GLOBAL_CAP[c.id] ?? Infinity;
    for (const item of rank(c.items, query)) {
      if (n >= cap) break;
      // A sticker can share its file with a brand graphic; show it once.
      const dedupe = item.thumb.t === 'img' ? item.thumb.src : item.key;
      if (seen.has(dedupe)) continue;
      seen.add(dedupe);
      out.push(item);
      n++;
    }
  }
  return out;
}
