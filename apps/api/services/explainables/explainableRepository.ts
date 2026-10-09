/**
 * Persistence for explainables. Every reader hides trashed rows; the owner
 * reads are scoped by `user_id`, so a stranger's id or slug answers exactly
 * like a missing one.
 */
import path from 'node:path';

import {
  type ExplainableContent,
  type ExplainableDto,
  type ExplainableShareMode,
  type ExplainableStatus,
} from '@gruenerator/contracts';
import { extractSlugSuffix } from '@gruenerator/shared/utils';

import { type ExplainableRow } from '../../database/schema/explainables.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { deleteTrashedRow, isRowId, type OwnedTrashTable } from '../trash/ownedRowTrash.js';

/** `reserved_day` comes back as text: a pg DATE would be parsed in local time. */
export type ExplainableRecord = Omit<ExplainableRow, 'reserved_day'> & {
  reserved_day: string | null;
};

const COLUMNS = `id, user_id, thread_id, source_message_id, slug_suffix, title, content, status,
  share_mode, share_token, reserved_units, reserved_day::text AS reserved_day, claim_at,
  attempts, created_at, updated_at, deleted_at`;

/**
 * Sets every still-pending image of `content` to failed — for rows whose
 * images will never be generated (trashed, or out of worker attempts).
 */
export const FAIL_PENDING_IMAGES_SQL = `jsonb_set(content, '{sections}', COALESCE((
    SELECT jsonb_agg(
             CASE WHEN s->'image'->>'status' = 'pending'
                  THEN jsonb_set(s, '{image,status}', '"failed"')
                  ELSE s END
             ORDER BY ord)
      FROM jsonb_array_elements(content->'sections') WITH ORDINALITY AS x(s, ord)
  ), '[]'::jsonb))`;

export function explainableImageDir(id: string): string {
  return path.join(process.cwd(), 'uploads', 'explainables', id);
}

export function explainableImagePath(id: string, sectionIndex: number): string {
  return path.join(explainableImageDir(id), `${sectionIndex}.png`);
}

export function toExplainableDto(row: ExplainableRecord, isOwner: boolean): ExplainableDto {
  return {
    id: row.id,
    slugSuffix: row.slug_suffix,
    title: row.title,
    status: row.status as ExplainableStatus,
    content: row.content,
    shareMode: row.share_mode as ExplainableShareMode,
    shareToken: isOwner ? row.share_token : null,
    isOwner,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

export interface InsertExplainable {
  userId: string;
  threadId: string | null;
  sourceMessageId: string | null;
  slugSuffix: string;
  title: string;
  content: ExplainableContent;
  status: ExplainableStatus;
  reservedUnits: number;
  reservedDay: string | null;
}

export async function insertExplainable(input: InsertExplainable): Promise<{ id: string }> {
  const rows = await getPostgresInstance().query<{ id: string }>(
    `INSERT INTO explainables
       (user_id, thread_id, source_message_id, slug_suffix, title, content, status,
        reserved_units, reserved_day)
     VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9::date)
     RETURNING id`,
    [
      input.userId,
      input.threadId,
      input.sourceMessageId,
      input.slugSuffix,
      input.title,
      JSON.stringify(input.content),
      input.status,
      input.reservedUnits,
      input.reservedDay,
    ]
  );
  return rows[0]!;
}

/** Own live explainable by slug, bare suffix or uuid. */
export async function getOwnExplainable(
  userId: string,
  ref: string
): Promise<ExplainableRecord | null> {
  const db = getPostgresInstance();
  if (isRowId(ref)) {
    return db.queryOne<ExplainableRecord>(
      `SELECT ${COLUMNS} FROM explainables
       WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL`,
      [ref, userId]
    );
  }
  const suffix = extractSlugSuffix(ref) ?? (/^[A-Za-z0-9]{6}$/.test(ref) ? ref : null);
  if (!suffix) return null;
  return db.queryOne<ExplainableRecord>(
    `SELECT ${COLUMNS} FROM explainables
     WHERE slug_suffix = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [suffix, userId]
  );
}

/** Live explainable by id regardless of owner — access is decided by `canRead`. */
export async function getExplainableById(id: string): Promise<ExplainableRecord | null> {
  if (!isRowId(id)) return null;
  return getPostgresInstance().queryOne<ExplainableRecord>(
    `SELECT ${COLUMNS} FROM explainables WHERE id = $1 AND deleted_at IS NULL`,
    [id]
  );
}

export async function getExplainableByShareToken(token: string): Promise<ExplainableRecord | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;
  return getPostgresInstance().queryOne<ExplainableRecord>(
    `SELECT ${COLUMNS} FROM explainables WHERE share_token = $1 AND deleted_at IS NULL`,
    [token]
  );
}

/**
 * Changes the share mode. The token is minted on the first move away from
 * private and kept when going back, so a re-shared link stays the same.
 */
export async function updateExplainableShare(
  userId: string,
  id: string,
  shareMode: ExplainableShareMode,
  newToken: string
): Promise<{ shareMode: ExplainableShareMode; shareToken: string | null } | null> {
  if (!isRowId(id)) return null;
  const rows = await getPostgresInstance().query<{
    share_mode: string;
    share_token: string | null;
  }>(
    `UPDATE explainables
        SET share_mode = $3,
            share_token = CASE WHEN $3 <> 'private' AND share_token IS NULL THEN $4
                               ELSE share_token END,
            updated_at = now()
      WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
      RETURNING share_mode, share_token`,
    [id, userId, shareMode, newToken]
  );
  const row = rows[0];
  if (!row) return null;
  return { shareMode: row.share_mode as ExplainableShareMode, shareToken: row.share_token };
}

/**
 * Moves a live explainable to the Papierkorb. Images still pending will never
 * be drawn, so they become failed and the row ready; the units still reserved
 * for them are returned for the caller to release.
 */
export async function trashExplainableRow(
  userId: string,
  id: string
): Promise<{ reservedUnits: number; reservedDay: string | null } | null> {
  if (!isRowId(id)) return null;
  const rows = await getPostgresInstance().query<{
    reserved_units: number;
    reserved_day: string | null;
  }>(
    `WITH old AS (
       SELECT id, reserved_units, reserved_day FROM explainables
        WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
        FOR UPDATE
     )
     UPDATE explainables e
        SET deleted_at = now(),
            updated_at = now(),
            reserved_units = 0,
            status = CASE WHEN e.status = 'images_pending' THEN 'ready' ELSE e.status END,
            content = ${FAIL_PENDING_IMAGES_SQL}
       FROM old
      WHERE e.id = old.id
      RETURNING old.reserved_units, old.reserved_day::text AS reserved_day`,
    [id, userId]
  );
  const row = rows[0];
  return row ? { reservedUnits: row.reserved_units, reservedDay: row.reserved_day } : null;
}

export const EXPLAINABLE_TRASH: OwnedTrashTable = {
  table: 'explainables',
  columns: 'id, title',
};

/** Hard-delete a trashed explainable; its images go along with the row. */
export async function deleteTrashedExplainable(id: string, cutoff: Date | null): Promise<boolean> {
  return (await deleteTrashedRow(EXPLAINABLE_TRASH, id, cutoff)) !== null;
}
