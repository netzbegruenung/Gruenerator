/**
 * Abonnierte Kollektionen: welche Kollektionen des Marktplatzes eine Person zu
 * sich geholt hat. Nur Ids — was in einer Kollektion steckt, löst der Client
 * aus seinem Register auf.
 */
import {
  marketplaceCollectionIdSchema,
  type MarketplaceCollectionId,
} from '@gruenerator/contracts';
import { and, asc, eq } from 'drizzle-orm';

import { collectionSubscriptions } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

/** Oldest first; ids the enum no longer knows are dropped. */
export async function listSubscribedCollectionIds(
  userId: string
): Promise<MarketplaceCollectionId[]> {
  const rows = await getDrizzleInstance()
    .select({ collectionId: collectionSubscriptions.collectionId })
    .from(collectionSubscriptions)
    .where(eq(collectionSubscriptions.userId, userId))
    .orderBy(asc(collectionSubscriptions.createdAt));
  const ids: MarketplaceCollectionId[] = [];
  for (const row of rows) {
    const parsed = marketplaceCollectionIdSchema.safeParse(row.collectionId);
    if (parsed.success) ids.push(parsed.data);
  }
  return ids;
}

export async function subscribeCollection(
  userId: string,
  id: MarketplaceCollectionId
): Promise<void> {
  await getDrizzleInstance()
    .insert(collectionSubscriptions)
    .values({ userId, collectionId: id })
    .onConflictDoNothing();
}

export async function unsubscribeCollection(
  userId: string,
  id: MarketplaceCollectionId
): Promise<void> {
  await getDrizzleInstance()
    .delete(collectionSubscriptions)
    .where(
      and(eq(collectionSubscriptions.userId, userId), eq(collectionSubscriptions.collectionId, id))
    );
}
