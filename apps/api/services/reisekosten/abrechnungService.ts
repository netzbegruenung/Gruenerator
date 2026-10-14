/**
 * Saved Reisekostenabrechnungen.
 *
 * Every query is scoped by `user_id`: a stranger's id or slug answers exactly
 * like a missing one. `state` is parsed through `reisekostenServerStateSchema`
 * here once more, not only at the HTTP edge — address, phone and bank details
 * must never reach this table, whoever calls the service.
 *
 * URLs use the Notion-style slug (`<titel>-<suffix>`); the suffix is the lookup
 * key, a raw uuid still resolves.
 */
import {
  reisekostenServerStateSchema,
  type Abrechnung,
  type AbrechnungUpdateBody,
  type ReisekostenServerState,
} from '@gruenerator/contracts';
import { extractSlugSuffix, generateSlugSuffix, slugifyName } from '@gruenerator/shared/utils';
import { and, desc, eq, type SQL } from 'drizzle-orm';

import {
  reisekostenAbrechnungen,
  type ReisekostenAbrechnungRow,
} from '../../database/schema/reisekosten.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { notTrashed } from '../../database/trash.js';
import { deleteTrashedRow, isRowId, type OwnedTrashTable } from '../trash/ownedRowTrash.js';

const t = reisekostenAbrechnungen;

export function buildAbrechnungSlug(titel: string, suffix: string): string {
  return `${slugifyName(titel, 'reisekosten')}-${suffix}`;
}

export function toAbrechnung(row: ReisekostenAbrechnungRow): Abrechnung {
  return {
    id: row.id,
    slug: buildAbrechnungSlug(row.titel, row.slug_suffix),
    titel: row.titel,
    status: row.status === 'eingereicht' ? 'eingereicht' : 'entwurf',
    state: row.state,
    belege: row.belege,
    createdAt: row.created_at.toISOString(),
    updatedAt: row.updated_at.toISOString(),
  };
}

/** The row an id or slug names, or null when it names none. */
function byIdOrSlug(idOrSlug: string): SQL | null {
  if (isRowId(idOrSlug)) return eq(t.id, idOrSlug);
  const suffix = extractSlugSuffix(idOrSlug);
  return suffix ? eq(t.slug_suffix, suffix) : null;
}

function ownLive(userId: string, match: SQL): SQL | undefined {
  return and(match, eq(t.user_id, userId), notTrashed(t));
}

/** Drops whatever the server must not hold, even if a caller passed it. */
function serverState(state: ReisekostenServerState): ReisekostenServerState {
  return reisekostenServerStateSchema.parse(state);
}

const titelOf = (state: ReisekostenServerState): string => state.reise.anlass.trim();

export async function listAbrechnungen(userId: string): Promise<ReisekostenAbrechnungRow[]> {
  return getDrizzleInstance()
    .select()
    .from(t)
    .where(and(eq(t.user_id, userId), notTrashed(t)))
    .orderBy(desc(t.updated_at));
}

export async function getAbrechnung(
  userId: string,
  idOrSlug: string
): Promise<ReisekostenAbrechnungRow | null> {
  const match = byIdOrSlug(idOrSlug);
  if (!match) return null;
  const rows = await getDrizzleInstance()
    .select()
    .from(t)
    .where(and(match, eq(t.user_id, userId), notTrashed(t)))
    .limit(1);
  return rows[0] ?? null;
}

export async function createAbrechnung(
  userId: string,
  state: ReisekostenServerState
): Promise<ReisekostenAbrechnungRow> {
  const clean = serverState(state);
  const rows = await getDrizzleInstance()
    .insert(t)
    .values({
      user_id: userId,
      slug_suffix: generateSlugSuffix(),
      titel: titelOf(clean),
      state: clean,
    })
    .returning();
  return rows[0]!;
}

export async function updateAbrechnung(
  userId: string,
  idOrSlug: string,
  patch: AbrechnungUpdateBody
): Promise<ReisekostenAbrechnungRow | null> {
  const match = byIdOrSlug(idOrSlug);
  if (!match) return null;
  const clean = patch.state ? serverState(patch.state) : null;
  const rows = await getDrizzleInstance()
    .update(t)
    .set({
      ...(clean && { state: clean, titel: titelOf(clean) }),
      ...(patch.belege && { belege: patch.belege }),
      ...(patch.status && { status: patch.status }),
      updated_at: new Date(),
    })
    .where(ownLive(userId, match))
    .returning();
  return rows[0] ?? null;
}

/** Move to the Papierkorb. False when the user has no such live row. */
export async function trashAbrechnung(userId: string, idOrSlug: string): Promise<boolean> {
  const match = byIdOrSlug(idOrSlug);
  if (!match) return false;
  const rows = await getDrizzleInstance()
    .update(t)
    .set({ deleted_at: new Date() })
    .where(ownLive(userId, match))
    .returning({ id: t.id });
  return rows.length > 0;
}

export const REISEKOSTEN_ABRECHNUNG_TRASH: OwnedTrashTable = {
  table: 'reisekosten_abrechnungen',
  columns: 'id, titel AS title',
};

/** Hard-delete a trashed Abrechnung. No side store: the belege files never left the browser. */
export async function purgeAbrechnung(id: string, cutoff: Date | null): Promise<boolean> {
  return (await deleteTrashedRow(REISEKOSTEN_ABRECHNUNG_TRASH, id, cutoff)) !== null;
}
