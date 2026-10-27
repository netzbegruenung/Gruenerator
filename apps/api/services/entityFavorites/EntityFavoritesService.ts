import { and, eq } from 'drizzle-orm';

import { entityFavorites, type EntityFavoriteType } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('EntityFavoritesService');

export interface FavoriteParams {
  userId: string;
  entityType: EntityFavoriteType;
  entityId: string;
}

export async function favoriteEntity(params: FavoriteParams): Promise<{ favorited: true }> {
  const db = getDrizzleInstance();
  await db
    .insert(entityFavorites)
    .values({
      user_id: params.userId,
      entity_type: params.entityType,
      entity_id: params.entityId,
    })
    .onConflictDoNothing({
      target: [entityFavorites.user_id, entityFavorites.entity_type, entityFavorites.entity_id],
    });
  return { favorited: true };
}

export async function unfavoriteEntity(params: FavoriteParams): Promise<{ favorited: false }> {
  const db = getDrizzleInstance();
  await db
    .delete(entityFavorites)
    .where(
      and(
        eq(entityFavorites.user_id, params.userId),
        eq(entityFavorites.entity_type, params.entityType),
        eq(entityFavorites.entity_id, params.entityId)
      )
    );
  return { favorited: false };
}

export async function getFavoritedEntityIdsForUser(params: {
  userId: string;
  entityType: EntityFavoriteType;
}): Promise<string[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ entity_id: entityFavorites.entity_id })
    .from(entityFavorites)
    .where(
      and(
        eq(entityFavorites.user_id, params.userId),
        eq(entityFavorites.entity_type, params.entityType)
      )
    );
  return rows.map((r) => r.entity_id);
}

export async function isFavoritedByUser(params: FavoriteParams): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: entityFavorites.id })
    .from(entityFavorites)
    .where(
      and(
        eq(entityFavorites.user_id, params.userId),
        eq(entityFavorites.entity_type, params.entityType),
        eq(entityFavorites.entity_id, params.entityId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

/** Purge of the entity itself: every user's favorite of it (`entity_id` has no FK). */
export async function deleteFavoritesForEntity(
  entityType: EntityFavoriteType,
  entityId: string
): Promise<void> {
  await getDrizzleInstance()
    .delete(entityFavorites)
    .where(
      and(eq(entityFavorites.entity_type, entityType), eq(entityFavorites.entity_id, entityId))
    );
}

/**
 * Account deletion: the user's own favorites (`user_id` has no FK) and every
 * favorite of their Sticker/Hintergründe, whose rows cascade with the profile.
 */
export async function deleteFavoritesOfDeletedUser(userId: string): Promise<void> {
  await getDrizzleInstance().delete(entityFavorites).where(eq(entityFavorites.user_id, userId));
  await getPostgresInstance().query(
    `DELETE FROM entity_favorites WHERE entity_type = 'studio_asset'
     AND entity_id IN (SELECT id::text FROM studio_assets WHERE user_id = $1)`,
    [userId]
  );
}

export { log as entityFavoritesLog };
