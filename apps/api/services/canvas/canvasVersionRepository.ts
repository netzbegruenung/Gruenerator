/**
 * Chat-edit version history for canvas documents (`canvas_state_versions`).
 * Each row carries the FULL flat config-prop state, so any version renders
 * directly in the chat card without replaying patches. Newest RETAIN_COUNT
 * versions are kept per canvas.
 */
import { type InferSelectModel } from 'drizzle-orm';

import { type canvasStateVersions } from '../../database/schema/canvas.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';

const db = getPostgresInstance();

const RETAIN_COUNT = 20;

type VersionRow = InferSelectModel<typeof canvasStateVersions>;

export type VersionOrigin = 'mint' | 'chat-edit' | 'restore';

export interface CanvasVersionSummary {
  version: number;
  summary: string | null;
  origin: VersionOrigin;
  created_at: string;
}

const toIso = (v: Date | string | null): string =>
  v instanceof Date ? v.toISOString() : (v ?? '');

export async function insertCanvasVersion(args: {
  canvasId: string;
  state: Record<string, unknown>;
  summary: string | null;
  origin: VersionOrigin;
  userId: string | null;
}): Promise<number> {
  const rows = (await db.query(
    `INSERT INTO canvas_state_versions (canvas_id, version, state, summary, origin, created_by)
     SELECT $1,
            COALESCE(MAX(version), 0) + 1,
            $2::jsonb, $3, $4, $5
     FROM canvas_state_versions WHERE canvas_id = $1
     RETURNING version`,
    [args.canvasId, JSON.stringify(args.state), args.summary, args.origin, args.userId]
  )) as Array<{ version: number }>;
  const version = rows[0].version;

  // Both params MUST be cast: `$2 - $3` with two untyped parameters makes
  // Postgres fail with "operator is not unique: unknown - unknown".
  await db.query(
    `DELETE FROM canvas_state_versions
     WHERE canvas_id = $1 AND version <= $2::int - $3::int`,
    [args.canvasId, version, RETAIN_COUNT]
  );

  return version;
}

export async function listCanvasVersions(canvasId: string): Promise<CanvasVersionSummary[]> {
  const rows = (await db.query(
    `SELECT version, summary, origin, created_at
     FROM canvas_state_versions
     WHERE canvas_id = $1
     ORDER BY version DESC`,
    [canvasId]
  )) as Array<Pick<VersionRow, 'version' | 'summary' | 'origin' | 'created_at'>>;
  return rows.map((r) => ({
    version: r.version,
    summary: r.summary,
    origin: r.origin as VersionOrigin,
    created_at: toIso(r.created_at),
  }));
}

export async function getCanvasVersion(
  canvasId: string,
  version: number
): Promise<{ version: number; state: Record<string, unknown>; summary: string | null } | null> {
  const rows = (await db.query(
    `SELECT version, state, summary FROM canvas_state_versions
     WHERE canvas_id = $1 AND version = $2`,
    [canvasId, version]
  )) as Array<Pick<VersionRow, 'version' | 'state' | 'summary'>>;
  const row = rows[0];
  if (!row) return null;
  return { version: row.version, state: row.state, summary: row.summary };
}

export async function getLatestCanvasVersionNumber(canvasId: string): Promise<number | null> {
  const rows = (await db.query(
    `SELECT MAX(version) AS version FROM canvas_state_versions WHERE canvas_id = $1`,
    [canvasId]
  )) as Array<{ version: number | null }>;
  return rows[0]?.version ?? null;
}
