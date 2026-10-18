/**
 * Der Marktplatz: eine Liste über alle Arten, ein Like- und ein Speichern-
 * Modell. Jede Art hat ihren Adapter in `sources/`; hier wird nur verteilt.
 */
import {
  marketplaceListQuerySchema,
  type MarketplaceFrontpageResponse,
  type MarketplaceFrontpageShelfId,
  type MarketplaceItem,
  type MarketplaceKind,
  type MarketplaceLikeResponse,
  type MarketplaceListQuery,
  type MarketplaceListResponse,
  type MarketplaceSaveResponse,
  type MarketplaceSection,
} from '@gruenerator/contracts';
import { showsSystemRecipes } from '@gruenerator/shared/agents';
import {
  FRONTPAGE_SHELF_QUERIES,
  FRONTPAGE_SHELVES,
  composeFrontpage,
  featureFor,
} from '@gruenerator/shared/marketplace/frontpage';

import { likeEntity, unlikeEntity } from '../entityLikes/EntityLikesService.js';

import { type MarketplaceContext } from './context.js';
import { sourceOf } from './registry.js';

import type { SourceQuery } from './sources/types.js';

/**
 * Mehrere Arten → je Art die erste Seite (`sectionLimit`); genau eine Art →
 * `offset`/`limit`. Katalog-Rezepte gelten wie in der Agentura nur, wenn nach
 * Rezepten allein gefragt oder gesucht wird — und für „gespeichert" immer.
 */
export function toSourceQuery(query: MarketplaceListQuery): SourceQuery {
  const single = query.kinds.length === 1;
  const onlyRecipes = single && query.kinds[0] === 'recipe';
  return {
    origin: query.origin,
    q: query.q,
    sort: query.sort,
    scope: query.scope,
    offset: single ? query.offset : 0,
    limit: single ? query.limit : query.sectionLimit,
    systemRecipes:
      query.scope === 'saved' ||
      showsSystemRecipes(onlyRecipes ? 'recipe' : 'all', query.q !== null),
  };
}

export async function listMarketplace(
  ctx: MarketplaceContext,
  query: MarketplaceListQuery
): Promise<MarketplaceListResponse> {
  const sourceQuery = toSourceQuery(query);
  const sections = await Promise.all(
    query.kinds.map(async (kind) => {
      const page = await sourceOf(kind).list(ctx, sourceQuery);
      return { kind, items: page.items, hasMore: page.hasMore };
    })
  );
  return { sections };
}

/**
 * The front page („Start") in one answer: one list per shelf and the „Im
 * Fokus" item, side by side, then `composeFrontpage` — the shelf rules live
 * there, not here. Without a Landesverband the shelf is not even listed.
 */
export async function getMarketplaceFrontpage(
  ctx: MarketplaceContext
): Promise<MarketplaceFrontpageResponse> {
  const catalog = await ctx.officialCatalog();
  const hasLv = catalog.lvAgents.length > 0 || catalog.lvSkills.length > 0;

  const shelf = async (id: MarketplaceFrontpageShelfId): Promise<MarketplaceSection[]> => {
    if (id === 'landesverband' && !hasLv) return [];
    const spec = FRONTPAGE_SHELF_QUERIES[id];
    const query = marketplaceListQuerySchema.parse({
      kinds: spec.kinds.join(','),
      sort: spec.sort,
      origin: spec.origin,
      platform: ctx.platform,
      sectionLimit: FRONTPAGE_SHELVES[id].show,
    });
    return (await listMarketplace(ctx, query)).sections;
  };

  const feature = featureFor(ctx.audience);
  const [landesverband, neu, beliebt, gestalten, item] = await Promise.all([
    shelf('landesverband'),
    shelf('neu'),
    shelf('beliebt'),
    shelf('gestalten'),
    feature ? getMarketplaceItem(ctx, feature.kind, feature.ref) : null,
  ]);
  return composeFrontpage({
    sections: { landesverband, neu, beliebt, gestalten },
    curated: feature && item ? { feature, item } : null,
  });
}

/** One item for a shared link; `null` when it does not exist or the viewer may not see it. */
export async function getMarketplaceItem(
  ctx: MarketplaceContext,
  kind: MarketplaceKind,
  ref: string
): Promise<MarketplaceItem | null> {
  return sourceOf(kind).get(ctx, ref);
}

export type Outcome<T> = { ok: true; value: T } | { ok: false; status: 404 | 409 };

export async function setLike(
  ctx: MarketplaceContext,
  kind: MarketplaceKind,
  ref: string,
  liked: boolean
): Promise<Outcome<MarketplaceLikeResponse>> {
  const source = sourceOf(kind);
  const params = { userId: ctx.userId, entityType: source.likeType, entityId: ref };
  if (liked) {
    if (!(await source.isVisible(ctx, ref))) return { ok: false, status: 404 };
    const result = await likeEntity(params);
    return { ok: true, value: { liked: true, likesCount: result.count } };
  }
  // Removing stays possible for something the viewer can no longer see; the
  // count of an invisible item is not theirs to read.
  const result = await unlikeEntity(params);
  const likesCount = (await source.isVisible(ctx, ref)) ? result.count : 0;
  return { ok: true, value: { liked: false, likesCount } };
}

export async function setSaved(
  ctx: MarketplaceContext,
  kind: MarketplaceKind,
  ref: string,
  saved: boolean
): Promise<Outcome<MarketplaceSaveResponse>> {
  const source = sourceOf(kind);
  if (!saved) {
    await source.save.remove(ctx, ref);
    return { ok: true, value: { saved: false } };
  }
  if (!(await source.isVisible(ctx, ref))) return { ok: false, status: 404 };
  if ((await source.save.add(ctx, ref)) === 'full') return { ok: false, status: 409 };
  return { ok: true, value: { saved: true } };
}
