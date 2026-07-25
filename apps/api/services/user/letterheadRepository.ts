/**
 * CRUD for a user's letterheads.
 *
 * Every query is scoped by `user_id` — a letterhead is printed onto Grünen
 * corporate-identity paper, so reading or writing someone else's must be
 * impossible even with a guessed id.
 */

import { and, asc, eq, ne } from 'drizzle-orm';

import { userLetterheads, type UserLetterheadRow } from '../../database/schema/userLetterheads.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

export interface LetterheadInput {
  label: string;
  organization?: string | null | undefined;
  address?: string | null | undefined;
  is_default?: boolean | undefined;
}

export async function listLetterheads(userId: string): Promise<UserLetterheadRow[]> {
  const db = getDrizzleInstance();
  return db
    .select()
    .from(userLetterheads)
    .where(eq(userLetterheads.user_id, userId))
    .orderBy(asc(userLetterheads.label));
}

export async function getLetterhead(userId: string, id: string): Promise<UserLetterheadRow | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userLetterheads)
    .where(and(eq(userLetterheads.id, id), eq(userLetterheads.user_id, userId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getDefaultLetterhead(userId: string): Promise<UserLetterheadRow | null> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(userLetterheads)
    .where(and(eq(userLetterheads.user_id, userId), eq(userLetterheads.is_default, true)))
    .limit(1);
  return rows[0] ?? null;
}

/** Clear the other defaults — a partial unique index enforces this in the DB too. */
async function unsetOtherDefaults(userId: string, keepId?: string): Promise<void> {
  const db = getDrizzleInstance();
  await db
    .update(userLetterheads)
    .set({ is_default: false, updated_at: new Date() })
    .where(
      keepId
        ? and(
            eq(userLetterheads.user_id, userId),
            eq(userLetterheads.is_default, true),
            ne(userLetterheads.id, keepId)
          )
        : and(eq(userLetterheads.user_id, userId), eq(userLetterheads.is_default, true))
    );
}

export async function createLetterhead(
  userId: string,
  input: LetterheadInput
): Promise<UserLetterheadRow> {
  const db = getDrizzleInstance();
  // The first one a user creates becomes the default, so the export has
  // something preselected without them having to think about it.
  const existing = await listLetterheads(userId);
  const shouldDefault = input.is_default === true || existing.length === 0;
  if (shouldDefault) await unsetOtherDefaults(userId);

  const rows = await db
    .insert(userLetterheads)
    .values({
      user_id: userId,
      label: input.label,
      organization: input.organization ?? null,
      address: input.address ?? null,
      is_default: shouldDefault,
    })
    .returning();
  return rows[0]!;
}

export async function updateLetterhead(
  userId: string,
  id: string,
  input: { [K in keyof LetterheadInput]?: LetterheadInput[K] | undefined }
): Promise<UserLetterheadRow | null> {
  const db = getDrizzleInstance();
  if (input.is_default === true) await unsetOtherDefaults(userId, id);

  const rows = await db
    .update(userLetterheads)
    .set({
      ...(input.label !== undefined && { label: input.label }),
      ...(input.organization !== undefined && { organization: input.organization ?? null }),
      ...(input.address !== undefined && { address: input.address ?? null }),
      ...(input.is_default !== undefined && { is_default: input.is_default }),
      updated_at: new Date(),
    })
    .where(and(eq(userLetterheads.id, id), eq(userLetterheads.user_id, userId)))
    .returning();
  return rows[0] ?? null;
}

export async function deleteLetterhead(userId: string, id: string): Promise<boolean> {
  const db = getDrizzleInstance();
  const rows = await db
    .delete(userLetterheads)
    .where(and(eq(userLetterheads.id, id), eq(userLetterheads.user_id, userId)))
    .returning();
  if (!rows.length) return false;

  // Deleting the default would leave the export with no preselection — promote
  // the next one instead of silently having none.
  if (rows[0]?.is_default) {
    const remaining = await listLetterheads(userId);
    const next = remaining[0];
    if (next) {
      await db
        .update(userLetterheads)
        .set({ is_default: true, updated_at: new Date() })
        .where(eq(userLetterheads.id, next.id));
    }
  }
  return true;
}
