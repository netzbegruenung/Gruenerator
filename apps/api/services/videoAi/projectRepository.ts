/**
 * Rows of `video_ai_projects`: create, read as DTO, cancel, Papierkorb.
 * The worker has its own statements (videoAiWorker.ts).
 */
import {
  videoAiBriefSchema,
  videoAiStatusSchema,
  type VideoAiBrief,
  type VideoAiInputRole,
  type VideoAiProjectDto,
  type VideoAiProjectListItem,
} from '@gruenerator/contracts';
import { generateSlugSuffix } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getSharedMediaService } from '../sharedMediaService.js';
import {
  deleteTrashedRow,
  isRowId,
  trashOwnedRow,
  type OwnedTrashResult,
  type OwnedTrashTable,
} from '../trash/ownedRowTrash.js';

import {
  type StoredVideoAiAnalysis,
  type StoredVideoAiInput,
  type StoredVideoAiVersion,
} from './projectTypes.js';
import { buildTranscriptUnits } from './transcriptUnits.js';

/** Statuses the worker still has to move. */
export const ACTIVE_STATUSES = ['queued', 'analyzing', 'cutting', 'designing'] as const;

export interface MediaForInput {
  id: string;
  media_type: string;
  title: string | null;
  original_filename: string | null;
  duration: number | null;
  status: string | null;
  file_path: string | null;
}

/** The person's own live Mediathek rows among `ids`; missing ones are not returned. */
export async function loadOwnMedia(
  userId: string,
  ids: readonly string[]
): Promise<MediaForInput[]> {
  const valid = ids.filter(isRowId);
  if (valid.length === 0) return [];
  return getPostgresInstance().query<MediaForInput>(
    `SELECT id, media_type, title, original_filename, duration, status, file_path
       FROM shared_media
      WHERE id = ANY($1::uuid[]) AND user_id = $2 AND deleted_at IS NULL`,
    [valid, userId]
  );
}

const MEDIA_TYPE_FOR_ROLE: Record<VideoAiInputRole, string> = {
  footage: 'video',
  broll: 'video',
  image: 'image',
  logo: 'image',
  audio: 'audio',
};

export function mediaTypeFits(role: VideoAiInputRole, mediaType: string): boolean {
  return MEDIA_TYPE_FOR_ROLE[role] === mediaType;
}

export async function hasActiveProject(userId: string): Promise<boolean> {
  const rows = await getPostgresInstance().query<{ id: string }>(
    `SELECT id FROM video_ai_projects
      WHERE user_id = $1 AND status = ANY($2::text[]) AND deleted_at IS NULL
      LIMIT 1`,
    [userId, [...ACTIVE_STATUSES]]
  );
  return rows.length > 0;
}

interface InsertInput {
  userId: string;
  brief: VideoAiBrief;
  inputs: StoredVideoAiInput[];
  locale: 'de-DE' | 'de-AT';
  treeUnits: number;
  treeDay: string | null;
}

/** Inserts with a fresh slug suffix; a collision with a live row draws a new one. */
export async function insertVideoAiProject(
  input: InsertInput
): Promise<{ id: string; slugSuffix: string }> {
  for (let attempt = 1; ; attempt++) {
    const slugSuffix = generateSlugSuffix();
    try {
      const rows = await getPostgresInstance().query<{ id: string }>(
        `INSERT INTO video_ai_projects
           (user_id, slug_suffix, title, locale, brief, inputs, tree_units, tree_day)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id`,
        [
          input.userId,
          slugSuffix,
          input.brief.title,
          input.locale,
          JSON.stringify(input.brief),
          JSON.stringify(input.inputs),
          input.treeUnits,
          input.treeDay,
        ]
      );
      const id = rows[0]?.id;
      if (!id) throw new Error('KI-Schnitt row was not created');
      return { id, slugSuffix };
    } catch (error) {
      if (attempt >= 3 || !String((error as Error).message).includes('slug_suffix')) throw error;
    }
  }
}

interface ProjectDtoRow {
  id: string;
  slug_suffix: string;
  title: string;
  status: string;
  error: string | null;
  brief: unknown;
  inputs: StoredVideoAiInput[];
  warnings: string[];
  analysis: StoredVideoAiAnalysis | null;
  versions: StoredVideoAiVersion[];
  current_version: number | null;
  created_at: Date;
}

/** Owner-only read by slug suffix or raw uuid. */
export async function getOwnVideoAiProject(
  ref: string,
  userId: string
): Promise<VideoAiProjectDto | null> {
  const column = isRowId(ref) ? 'id' : 'slug_suffix';
  const rows = await getPostgresInstance().query<ProjectDtoRow>(
    `SELECT id, slug_suffix, title, status, error, brief, inputs, warnings, analysis,
            versions, current_version, created_at
       FROM video_ai_projects
      WHERE ${column} = $1 AND user_id = $2 AND deleted_at IS NULL`,
    [ref, userId]
  );
  const row = rows[0];
  return row ? toProjectDto(row) : null;
}

function unitTexts(analysis: StoredVideoAiAnalysis | null): Map<string, string> {
  const texts = new Map<string, string>();
  for (const clip of analysis?.clips ?? []) {
    if (clip.role !== 'footage') continue;
    for (const unit of buildTranscriptUnits(clip.clipId, clip.words)) texts.set(unit.id, unit.text);
  }
  return texts;
}

export function toProjectDto(row: ProjectDtoRow): VideoAiProjectDto {
  const status = videoAiStatusSchema.safeParse(row.status);
  const version = row.versions.find((v) => v.version === row.current_version) ?? null;
  const texts = unitTexts(row.analysis);
  return {
    id: row.id,
    slugSuffix: row.slug_suffix,
    title: row.title,
    status: status.success ? status.data : 'failed',
    error: row.error,
    // Written through the same schema on create; a row that no longer parses
    // is a bug worth a loud 500, not a silently emptied brief.
    brief: videoAiBriefSchema.parse(row.brief),
    inputs: row.inputs.map(({ id, mediaId, role, title }) => ({ id, mediaId, role, title })),
    warnings: row.warnings,
    version: version?.version ?? null,
    edl: version?.edl ?? null,
    versions: row.versions.map((v) => ({
      version: v.version,
      summary: v.summary,
      createdAt: v.createdAt,
    })),
    omitted: Object.entries(version?.omitted ?? {}).map(([unitId, reason]) => ({
      unitId,
      text: texts.get(unitId) ?? '',
      reason,
    })),
    rationale: version?.rationale ?? null,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

export async function listOwnVideoAiProjects(userId: string): Promise<VideoAiProjectListItem[]> {
  const rows = await getPostgresInstance().query<{
    id: string;
    slug_suffix: string;
    title: string;
    status: string;
    created_at: Date;
  }>(
    `SELECT id, slug_suffix, title, status, created_at
       FROM video_ai_projects
      WHERE user_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
      LIMIT 100`,
    [userId]
  );
  return rows.map((row) => {
    const status = videoAiStatusSchema.safeParse(row.status);
    return {
      id: row.id,
      slugSuffix: row.slug_suffix,
      title: row.title,
      status: status.success ? status.data : 'failed',
      createdAt: new Date(row.created_at).toISOString(),
    };
  });
}

/**
 * Marks a queued or running job as cancelled. The worker notices between
 * steps; a step already running finishes, nothing after it. Returns the trees
 * to give back: all of them while the job had not started, none once it had.
 */
export async function cancelVideoAiProject(
  id: string,
  userId: string
): Promise<{ refundUnits: number; treeDay: string | null } | null> {
  if (!isRowId(id)) return null;
  const rows = await getPostgresInstance().query<{ refund_units: number; tree_day: string | null }>(
    `WITH before AS (
       SELECT id, status, tree_units FROM video_ai_projects
        WHERE id = $1 AND user_id = $2 AND status = ANY($3::text[]) AND deleted_at IS NULL
        FOR UPDATE
     )
     UPDATE video_ai_projects p
        SET status = 'cancelled', claim_at = NULL, updated_at = now(),
            tree_units = CASE WHEN before.status = 'queued' THEN 0 ELSE p.tree_units END
       FROM before
      WHERE p.id = before.id
      RETURNING CASE WHEN before.status = 'queued' THEN before.tree_units ELSE 0 END AS refund_units,
                p.tree_day`,
    [id, userId, [...ACTIVE_STATUSES]]
  );
  const row = rows[0];
  return row ? { refundUnits: row.refund_units, treeDay: row.tree_day } : null;
}

/**
 * Papierkorb. The working copies are Mediathek videos of their own (the
 * editor's autosave may point at them) and stay where they are.
 */
export const VIDEO_AI_PROJECT_TRASH: OwnedTrashTable = {
  table: 'video_ai_projects',
  columns: 'id, title',
};

export function trashVideoAiProject(userId: string, id: string): Promise<OwnedTrashResult> {
  return trashOwnedRow(VIDEO_AI_PROJECT_TRASH, userId, id);
}

export async function purgeVideoAiProject(id: string, cutoff: Date | null): Promise<boolean> {
  const row = await deleteTrashedRow<{
    id: string;
    user_id: string;
    analysis: StoredVideoAiAnalysis | null;
  }>(VIDEO_AI_PROJECT_TRASH, id, cutoff, 'id, user_id, analysis');
  if (row === null) return false;
  // Best-effort, like every purge's files: a proxy left behind is disk, not data.
  for (const clip of row.analysis?.clips ?? []) {
    await getSharedMediaService()
      .purgeInternalShare(clip.proxyShareToken, row.user_id, ['video-ai-proxy'])
      .catch(() => false);
  }
  return true;
}
