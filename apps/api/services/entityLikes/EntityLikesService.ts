import { and, eq, inArray, sql } from 'drizzle-orm';

import { entityLikes, type EntityLikeType } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('EntityLikesService');

export interface LikeParams {
  userId: string;
  entityType: EntityLikeType;
  entityId: string;
}

export async function likeEntity(
  params: LikeParams
): Promise<{ liked: true; count: number; createdNew: boolean }> {
  const db = getDrizzleInstance();
  const inserted = await db
    .insert(entityLikes)
    .values({
      user_id: params.userId,
      entity_type: params.entityType,
      entity_id: params.entityId,
    })
    .onConflictDoNothing({
      target: [entityLikes.user_id, entityLikes.entity_type, entityLikes.entity_id],
    })
    .returning({ id: entityLikes.id });

  const count = await getLikeCount(params.entityType, params.entityId);
  return { liked: true, count, createdNew: inserted.length > 0 };
}

export async function unlikeEntity(params: LikeParams): Promise<{ liked: false; count: number }> {
  const db = getDrizzleInstance();
  await db
    .delete(entityLikes)
    .where(
      and(
        eq(entityLikes.user_id, params.userId),
        eq(entityLikes.entity_type, params.entityType),
        eq(entityLikes.entity_id, params.entityId)
      )
    );

  const count = await getLikeCount(params.entityType, params.entityId);
  return { liked: false, count };
}

export async function getLikeCount(entityType: EntityLikeType, entityId: string): Promise<number> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(entityLikes)
    .where(and(eq(entityLikes.entity_type, entityType), eq(entityLikes.entity_id, entityId)));
  return rows[0]?.count ?? 0;
}

export async function getLikeCountsForEntities(
  entityType: EntityLikeType,
  entityIds: string[]
): Promise<Map<string, number>> {
  const result = new Map<string, number>();
  if (entityIds.length === 0) return result;

  const db = getDrizzleInstance();
  const rows = await db
    .select({
      entity_id: entityLikes.entity_id,
      count: sql<number>`count(*)::int`,
    })
    .from(entityLikes)
    .where(and(eq(entityLikes.entity_type, entityType), inArray(entityLikes.entity_id, entityIds)))
    .groupBy(entityLikes.entity_id);

  for (const row of rows) {
    result.set(row.entity_id, row.count);
  }
  return result;
}

export async function getLikedEntityIdsForUser(params: {
  userId: string;
  entityType: EntityLikeType;
}): Promise<string[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ entity_id: entityLikes.entity_id })
    .from(entityLikes)
    .where(
      and(eq(entityLikes.user_id, params.userId), eq(entityLikes.entity_type, params.entityType))
    );
  return rows.map((r) => r.entity_id);
}

export async function isLikedByUser(params: LikeParams): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .select({ id: entityLikes.id })
    .from(entityLikes)
    .where(
      and(
        eq(entityLikes.user_id, params.userId),
        eq(entityLikes.entity_type, params.entityType),
        eq(entityLikes.entity_id, params.entityId)
      )
    )
    .limit(1);
  return rows.length > 0;
}

export { log as entityLikesLog };
