/**
 * Likes und „gespeichert" für eine Liste von Einträgen gebündelt nachladen:
 * je Art höchstens drei Abfragen, egal wie lang die Liste ist.
 */
import { type MarketplaceItemOf, type MarketplaceKind } from '@gruenerator/contracts';
import { and, eq, inArray } from 'drizzle-orm';

import {
  entityFavorites,
  entityLikes,
  type EntityFavoriteType,
  type EntityLikeType,
} from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getLikeCountsForEntities } from '../entityLikes/EntityLikesService.js';

import { type MarketplaceContext } from './context.js';
import { type MarketplaceSource } from './sources/types.js';

export async function likedAmong(
  userId: string,
  entityType: EntityLikeType,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await getDrizzleInstance()
    .select({ id: entityLikes.entity_id })
    .from(entityLikes)
    .where(
      and(
        eq(entityLikes.user_id, userId),
        eq(entityLikes.entity_type, entityType),
        inArray(entityLikes.entity_id, ids)
      )
    );
  return new Set(rows.map((r) => r.id));
}

export async function favoritedAmong(
  userId: string,
  entityType: EntityFavoriteType,
  ids: string[]
): Promise<Set<string>> {
  if (ids.length === 0) return new Set();
  const rows = await getDrizzleInstance()
    .select({ id: entityFavorites.entity_id })
    .from(entityFavorites)
    .where(
      and(
        eq(entityFavorites.user_id, userId),
        eq(entityFavorites.entity_type, entityType),
        inArray(entityFavorites.entity_id, ids)
      )
    );
  return new Set(rows.map((r) => r.id));
}

/**
 * Fills `likesCount`, `liked` and `saved` in place. `counts: false` keeps a
 * `likesCount` the source already read in its own query.
 */
export async function enrichItems<K extends MarketplaceKind>(
  ctx: MarketplaceContext,
  source: MarketplaceSource<K>,
  items: MarketplaceItemOf<K>[],
  opts: { counts: boolean } = { counts: true }
): Promise<MarketplaceItemOf<K>[]> {
  const refs = items.map((i) => i.ref);
  const [counts, liked, saved] = await Promise.all([
    opts.counts ? getLikeCountsForEntities(source.likeType, refs) : null,
    likedAmong(ctx.userId, source.likeType, refs),
    source.save.has(ctx, refs),
  ]);
  for (const item of items) {
    if (counts) item.likesCount = counts.get(item.ref) ?? 0;
    item.liked = liked.has(item.ref);
    item.saved = saved.has(item.ref);
  }
  return items;
}
