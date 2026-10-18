/**
 * Der Marktplatz: eine Liste über alle Arten, ein Like- und ein Speichern-
 * Modell. Jede Art hat ihren Adapter in `sources/`; hier wird nur verteilt.
 */
import {
  type MarketplaceKind,
  type MarketplaceLikeResponse,
  type MarketplaceListQuery,
  type MarketplaceListResponse,
  type MarketplaceSaveResponse,
} from '@gruenerator/contracts';
import { showsSystemRecipes } from '@gruenerator/shared/agents';

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
