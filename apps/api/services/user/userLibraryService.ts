/**
 * „Zu meinen Grüneratoren": die Agents und Rezepte, die eine Person aus der
 * Agentura auf ihre Übersicht geholt hat. Nur Verweise — ob ein Verweis noch
 * auf etwas Sichtbares zeigt, entscheidet der Client beim Auflösen gegen die
 * Pools, die er ohnehin lädt.
 */
import { USER_LIBRARY_MAX_ITEMS } from '@gruenerator/contracts';
import { and, asc, count, eq } from 'drizzle-orm';

import { userLibraryItems } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import type { UserLibraryItem, UserLibraryItemKind } from '@gruenerator/contracts';

export async function listUserLibrary(userId: string): Promise<UserLibraryItem[]> {
  const rows = await getDrizzleInstance()
    .select()
    .from(userLibraryItems)
    .where(eq(userLibraryItems.userId, userId))
    .orderBy(asc(userLibraryItems.createdAt));
  return rows.map((row) => ({
    kind: row.itemKind as UserLibraryItemKind,
    ref: row.itemRef,
    createdAt: row.createdAt.toISOString(),
  }));
}

/** `false` when the person already holds {@link USER_LIBRARY_MAX_ITEMS} items. */
export async function addToUserLibrary(
  userId: string,
  kind: UserLibraryItemKind,
  ref: string
): Promise<boolean> {
  const db = getDrizzleInstance();
  const [{ total }] = await db
    .select({ total: count() })
    .from(userLibraryItems)
    .where(eq(userLibraryItems.userId, userId));
  if (total >= USER_LIBRARY_MAX_ITEMS) return false;
  await db
    .insert(userLibraryItems)
    .values({ userId, itemKind: kind, itemRef: ref })
    .onConflictDoNothing({
      target: [userLibraryItems.userId, userLibraryItems.itemKind, userLibraryItems.itemRef],
    });
  return true;
}

export async function removeFromUserLibrary(
  userId: string,
  kind: UserLibraryItemKind,
  ref: string
): Promise<void> {
  await getDrizzleInstance()
    .delete(userLibraryItems)
    .where(
      and(
        eq(userLibraryItems.userId, userId),
        eq(userLibraryItems.itemKind, kind),
        eq(userLibraryItems.itemRef, ref)
      )
    );
}
