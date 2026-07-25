/**
 * CRUD for a user's letterheads.
 *
 * Every query is scoped by `user_id` — a letterhead is printed onto Grünen
 * corporate-identity paper, so reading or writing someone else's must be
 * impossible even with a guessed id.
 */

import { and, asc, eq, ne } from 'drizzle-orm';

import { userLetterheads, type UserLetterheadRow } from '../../database/schema/userLetterheads.js';
import { getDrizzleInstance, type DrizzleDB } from '../../database/services/DrizzleService.js';

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

/**
 * Clear the other defaults. Runs inside the caller's transaction: a partial
 * unique index enforces one default per user, so doing this in a separate
 * statement from the insert/update lets two concurrent requests collide and
 * fail with a 500 instead of the 409 the constraint is meant to express.
 */
async function unsetOtherDefaults(
  tx: Pick<DrizzleDB, 'update'>,
  userId: string,
  keepId?: string
): Promise<void> {
  await tx
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
  return db.transaction(async (tx) => {
    // The first one a user creates becomes the default, so the export has
    // something preselected without them having to think about it. Counting
    // and inserting must be one unit, or two parallel "first" letterheads both
    // decide they are the default.
    const existing = await tx
      .select({ id: userLetterheads.id })
      .from(userLetterheads)
      .where(eq(userLetterheads.user_id, userId))
      .limit(1);
    const shouldDefault = input.is_default === true || existing.length === 0;
    // Nothing to clear when this is the user's first — skip the no-op UPDATE.
    if (shouldDefault && existing.length > 0) await unsetOtherDefaults(tx, userId);

    const rows = await tx
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
  });
}

export async function updateLetterhead(
  userId: string,
  id: string,
  input: { [K in keyof LetterheadInput]?: LetterheadInput[K] | undefined }
): Promise<UserLetterheadRow | null> {
  const db = getDrizzleInstance();
  return db.transaction(async (tx) => {
    if (input.is_default === true) await unsetOtherDefaults(tx, userId, id);

    const rows = await tx
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
  });
}

export async function deleteLetterhead(userId: string, id: string): Promise<boolean> {
  const db = getDrizzleInstance();
  return db.transaction(async (tx) => {
    const rows = await tx
      .delete(userLetterheads)
      .where(and(eq(userLetterheads.id, id), eq(userLetterheads.user_id, userId)))
      .returning();
    if (!rows.length) return false;

    // Deleting the default would leave the export with no preselection —
    // promote the next one. Same transaction as the delete, so a crash in
    // between cannot leave the user without any default at all.
    if (rows[0]?.is_default) {
      const remaining = await tx
        .select({ id: userLetterheads.id })
        .from(userLetterheads)
        .where(eq(userLetterheads.user_id, userId))
        .orderBy(asc(userLetterheads.label))
        .limit(1);
      const next = remaining[0];
      if (next) {
        await tx
          .update(userLetterheads)
          .set({ is_default: true, updated_at: new Date() })
          .where(eq(userLetterheads.id, next.id));
      }
    }
    return true;
  });
}
