/**
 * Filter, enrich, sort and page for the sources whose candidates fit in memory
 * (Agents, Rezepte: the shipped catalogue plus the public listings). Likes are
 * loaded for every candidate before sorting — `beliebt` and `empfohlen` rank
 * by them, so a page cut before enrichment would be the wrong page.
 */
import {
  type MarketplaceItemOf,
  type MarketplaceKind,
  type MarketplaceOrigin,
} from '@gruenerator/contracts';

import { isForAudience, type MarketplaceContext } from '../context.js';
import { enrichItems } from '../enrich.js';

import { type MarketplaceSource, type SourcePage, type SourceQuery } from './types.js';

export interface Candidate<K extends MarketplaceKind> {
  item: MarketplaceItemOf<K>;
  /** Registry position for official items; `null` for user content. */
  rank: number | null;
  /** Extra text the search looks at beyond title, description and author. */
  searchText: string[];
}

const ORIGIN_ORDER: Record<MarketplaceOrigin, number> = {
  offiziell: 0,
  landesverband: 1,
  oeffentlich: 2,
};

const byRank = (a: number | null, b: number | null) =>
  (a ?? Number.MAX_SAFE_INTEGER) - (b ?? Number.MAX_SAFE_INTEGER);
const byCreatedDesc = (a: string | null, b: string | null) => (b ?? '').localeCompare(a ?? '');

/**
 * `empfohlen`: Herkunft (offiziell → Landesverband → öffentlich), darin die
 * Registry-Reihenfolge, dann Likes, dann neueste. `neu`: neueste zuerst.
 * `beliebt`: Likes, dann wie `empfohlen`.
 */
export function compareCandidates<K extends MarketplaceKind>(
  sort: SourceQuery['sort'],
  a: Candidate<K>,
  b: Candidate<K>
): number {
  const recommended =
    ORIGIN_ORDER[a.item.origin] - ORIGIN_ORDER[b.item.origin] ||
    byRank(a.rank, b.rank) ||
    b.item.likesCount - a.item.likesCount ||
    byCreatedDesc(a.item.createdAt, b.item.createdAt);
  if (sort === 'neu') return byCreatedDesc(a.item.createdAt, b.item.createdAt) || recommended;
  if (sort === 'beliebt') return b.item.likesCount - a.item.likesCount || recommended;
  return recommended;
}

export async function pageCandidates<K extends MarketplaceKind>(
  ctx: MarketplaceContext,
  source: MarketplaceSource<K>,
  query: SourceQuery,
  candidates: Candidate<K>[]
): Promise<SourcePage<K>> {
  const q = query.q?.toLowerCase() ?? null;
  const filtered = candidates.filter(
    (c) =>
      isForAudience(ctx, c.item.audience) &&
      (query.origin === null || c.item.origin === query.origin) &&
      (q === null ||
        [c.item.title, c.item.description ?? '', c.item.authorName ?? '', ...c.searchText].some(
          (text) => text.toLowerCase().includes(q)
        ))
  );

  await enrichItems(
    ctx,
    source,
    filtered.map((c) => c.item)
  );

  const scoped = query.scope === 'saved' ? filtered.filter((c) => c.item.saved) : filtered;
  const sorted = [...scoped].sort((a, b) => compareCandidates(query.sort, a, b));
  return {
    items: sorted.slice(query.offset, query.offset + query.limit).map((c) => c.item),
    hasMore: sorted.length > query.offset + query.limit,
  };
}
