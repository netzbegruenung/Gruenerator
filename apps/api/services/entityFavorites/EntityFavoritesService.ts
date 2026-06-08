import { and, eq } from 'drizzle-orm';

import { entityFavorites, type EntityFavoriteType } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
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

export { log as entityFavoritesLog };
