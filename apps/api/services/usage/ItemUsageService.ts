/**
 * Item usage tracking for automatic "favourites first" ordering.
 *
 * Records when a user uses a notebook or agent and exposes the aggregate so
 * list endpoints can sort most-recently/most-used first. Mirrors the
 * `user_recent_values` upsert-on-use pattern (RecentValuesService).
 *
 * Writes are fire-and-forget: call `recordItemUsageSafe` from request paths so
 * a tracking failure can never break a chat stream or QA response.
 */

import { and, eq, sql } from 'drizzle-orm';

import { userItemUsage } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('itemUsage');

export type ItemUsageType = 'notebook' | 'agent';

export interface ItemUsageStat {
  useCount: number;
  lastUsedAt: Date;
}

/** Upsert a usage event, incrementing the count and refreshing the timestamp. */
export async function recordItemUsage(
  userId: string,
  itemType: ItemUsageType,
  itemId: string
): Promise<void> {
  if (!userId || !itemId) return;
  const db = getDrizzleInstance();
  const now = new Date();
  await db
    .insert(userItemUsage)
    .values({ userId, itemType, itemId, useCount: 1, lastUsedAt: now })
    .onConflictDoUpdate({
      target: [userItemUsage.userId, userItemUsage.itemType, userItemUsage.itemId],
      set: {
        useCount: sql`${userItemUsage.useCount} + 1`,
        lastUsedAt: now,
      },
    });
}

/** Fire-and-forget wrapper for request paths — never throws, never blocks. */
export function recordItemUsageSafe(
  userId: string,
  itemType: ItemUsageType,
  itemId: string
): void {
  void recordItemUsage(userId, itemType, itemId).catch((err) => {
    log.warn(`[ItemUsage] Failed to record ${itemType} usage for ${itemId}:`, err);
  });
}

/** Map of itemId → usage stat for one user + type, for sorting list endpoints. */
export async function getUsageMap(
  userId: string,
  itemType: ItemUsageType
): Promise<Map<string, ItemUsageStat>> {
  if (!userId) return new Map();
  const db = getDrizzleInstance();
  const rows = await db
    .select({
      itemId: userItemUsage.itemId,
      useCount: userItemUsage.useCount,
      lastUsedAt: userItemUsage.lastUsedAt,
    })
    .from(userItemUsage)
    .where(and(eq(userItemUsage.userId, userId), eq(userItemUsage.itemType, itemType)));

  const map = new Map<string, ItemUsageStat>();
  for (const row of rows) {
    map.set(row.itemId, { useCount: row.useCount, lastUsedAt: row.lastUsedAt });
  }
  return map;
}
