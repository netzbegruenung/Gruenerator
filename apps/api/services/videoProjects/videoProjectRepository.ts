/**
 * Video editor projects repository.
 *
 * Projects reuse the `collaborative_documents` ACL/Yjs/sharing pipeline
 * (document_subtype='video'); video-specific columns live in the 1:1 sidecar
 * `video_projects`. Permission joins stay raw SQL, like `canvasRepository`.
 */

import { type VideoAspectRatio, type VideoProject } from '@gruenerator/contracts';
import {
  buildVideoProjectSlug,
  extractSlugSuffix,
  generateSlugSuffix,
} from '@gruenerator/shared/utils';
import { type InferSelectModel } from 'drizzle-orm';

import { type collaborative_documents } from '../../database/schema/collaborative.js';
import { type VideoProjectSidecarRow } from '../../database/schema/videoProjects.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  canWriteDocument,
  type DocumentWriteSubject,
  checkDocumentAccess,
  type DocumentAccessSubject,
} from '../../routes/docs/documentAccess.js';
import { type DocumentPermissions } from '../../routes/docs/types.js';
import {
  trashCollaborativeDocument,
  updateCollaborativeDocument,
  type QueryRunner,
} from '../docs/CollaborativeDocumentService.js';

export const VIDEO_SUBTYPE = 'video';

const DEFAULT_TITLE = 'Neues Video';
const DEFAULT_ASPECT_RATIO: VideoAspectRatio = '9:16';

const db = getPostgresInstance();
const runQuery: QueryRunner = <T>(sql: string, params?: unknown[]) =>
  db.query(sql, params) as Promise<T[]>;

type CollabRow = InferSelectModel<typeof collaborative_documents>;

type JoinedRow = Pick<
  CollabRow,
  | 'id'
  | 'title'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'permissions'
  | 'is_public'
  | 'share_mode'
  | 'share_permission'
> &
  Pick<VideoProjectSidecarRow, 'slug_suffix' | 'aspect_ratio'>;

const SELECT_COLUMNS = `
  cd.id, cd.title, cd.created_by, cd.created_at, cd.updated_at,
  cd.permissions, cd.is_public, cd.share_mode, cd.share_permission,
  vp.slug_suffix, vp.aspect_ratio
`;

/**
 * ACL predicate: owned, directly shared, or group-shared (same rule as
 * `CANVAS_ACCESS_WHERE`, minus the Vorlage tail). Slots: $1 = subtype, $2/$3 = userId.
 */
const VIDEO_ACCESS_WHERE = `
  cd.document_subtype = $1
  AND cd.is_deleted = false
  AND cd.deleted_at IS NULL
  AND (
    cd.created_by = $2
    OR cd.permissions ? $3::text
    OR cd.id IN (
      SELECT gcs.content_id::uuid
      FROM group_content_shares gcs
      INNER JOIN group_memberships gm
        ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
      INNER JOIN groups lg ON lg.id = gm.group_id AND lg.deleted_at IS NULL
      WHERE gcs.content_type = 'collaborative_documents'
    )
  )
`;

/** node-postgres returns `Date` for timestamptz; the contract serializes ISO strings. */
function toIso(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

/** jsonb→typed and text→enum are boundary casts; the columns carry these shapes by construction. */
function toAccessSubject(row: JoinedRow): DocumentAccessSubject {
  return {
    id: row.id,
    created_by: row.created_by ?? '',
    permissions: row.permissions as DocumentPermissions | null,
    is_public: row.is_public ?? false,
    ...(row.share_mode
      ? { share_mode: row.share_mode as DocumentAccessSubject['share_mode'] }
      : {}),
  };
}

/** jsonb permissions are typed by construction (see `toAccessSubject`). */
function toWriteSubject(row: JoinedRow): DocumentWriteSubject {
  return { ...row, permissions: row.permissions as DocumentWriteSubject['permissions'] };
}

function toVideoProject(row: JoinedRow, canEdit: boolean): VideoProject {
  return {
    id: row.id,
    slug: buildVideoProjectSlug(row.title, row.slug_suffix),
    title: row.title,
    aspect_ratio: row.aspect_ratio as VideoAspectRatio,
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    can_edit: canEdit,
  };
}

// ── Reads ──────────────────────────────────────────────────────────────────

/** Only projects with stored Yjs state: every editor visit creates a project, unedited ones stay out of the Studio. */
export async function listVideoProjects(userId: string): Promise<VideoProject[]> {
  const rows = (await db.query(
    `SELECT ${SELECT_COLUMNS}
     FROM collaborative_documents cd
     INNER JOIN video_projects vp ON vp.document_id = cd.id
     WHERE ${VIDEO_ACCESS_WHERE}
       AND (
         EXISTS (SELECT 1 FROM yjs_document_updates u WHERE u.document_id = cd.id)
         OR EXISTS (SELECT 1 FROM yjs_document_snapshots s WHERE s.document_id = cd.id)
       )
     ORDER BY cd.updated_at DESC`,
    [VIDEO_SUBTYPE, userId, userId]
  )) as JoinedRow[];

  // Direct write rights are decided per row (`canWriteDocument` also looks at group shares).
  return Promise.all(
    rows.map(async (row) =>
      toVideoProject(row, await canWriteDocument(toWriteSubject(row), userId))
    )
  );
}

/**
 * Resolve a slug (`<name>-<suffix>`) or a UUID to a project the user may read.
 * Unknown suffix, wrong subtype, trashed, or no access all return null.
 */
export async function resolveVideoProject(
  ref: string,
  userId: string
): Promise<VideoProject | null> {
  const suffix = extractSlugSuffix(ref);
  const rows = (await db.query(
    `SELECT ${SELECT_COLUMNS}
     FROM collaborative_documents cd
     INNER JOIN video_projects vp ON vp.document_id = cd.id
     WHERE cd.document_subtype = $1
       AND cd.is_deleted = false
       AND cd.deleted_at IS NULL
       AND ${suffix ? 'vp.slug_suffix = $2' : 'cd.id::text = $2'}`,
    [VIDEO_SUBTYPE, suffix ?? ref]
  )) as JoinedRow[];

  const row = rows[0];
  if (!row) return null;

  const access = await checkDocumentAccess(toAccessSubject(row), userId);
  if (!access.hasAccess) return null;

  return toVideoProject(row, await canWriteDocument(toWriteSubject(row), userId));
}

// ── Create ─────────────────────────────────────────────────────────────────

export interface CreateVideoProjectInput {
  title?: string | null | undefined;
  aspect_ratio?: VideoAspectRatio | null | undefined;
  source_ref?: string | null | undefined;
}

export async function createVideoProject(
  userId: string,
  input: CreateVideoProjectInput
): Promise<{ project: VideoProject; created: boolean }> {
  const sourceRef = input.source_ref ?? null;

  if (sourceRef) {
    const existing = (await db.query(
      `SELECT ${SELECT_COLUMNS}
       FROM collaborative_documents cd
       INNER JOIN video_projects vp ON vp.document_id = cd.id
       WHERE cd.document_subtype = $1
         AND cd.is_deleted = false
         AND cd.deleted_at IS NULL
         AND cd.created_by = $2
         AND vp.source_ref = $3
       ORDER BY cd.created_at ASC
       LIMIT 1`,
      [VIDEO_SUBTYPE, userId, sourceRef]
    )) as JoinedRow[];
    if (existing[0]) return { project: toVideoProject(existing[0], true), created: false };
  }

  const title = input.title?.trim() || DEFAULT_TITLE;
  const aspectRatio = input.aspect_ratio ?? DEFAULT_ASPECT_RATIO;

  const suffix = generateSlugSuffix();
  // One statement: a failing sidecar insert rolls back the document row too.
  const docRows = (await db.query(
    `WITH doc AS (
       INSERT INTO collaborative_documents
         (title, content, created_by, last_edited_by, document_subtype, is_public)
       VALUES ($1, '', $2, $2, $3, false)
       RETURNING id, title, created_by, created_at, updated_at, permissions, is_public, share_mode,
                 share_permission
     ), sidecar AS (
       INSERT INTO video_projects (document_id, slug_suffix, aspect_ratio, source_ref)
       SELECT id, $4, $5, $6 FROM doc
     )
     SELECT * FROM doc`,
    [title, userId, VIDEO_SUBTYPE, suffix, aspectRatio, sourceRef]
  )) as Array<Omit<JoinedRow, 'slug_suffix' | 'aspect_ratio'>>;
  const doc = docRows[0];

  return {
    project: toVideoProject({ ...doc, slug_suffix: suffix, aspect_ratio: aspectRatio }, true),
    created: true,
  };
}

// ── Update / delete ────────────────────────────────────────────────────────

export type MutationResult = { kind: 'ok' } | { kind: 'not_found' } | { kind: 'forbidden' };

export interface UpdateVideoProjectInput {
  title?: string | null | undefined;
  aspect_ratio?: VideoAspectRatio | null | undefined;
}

export async function updateVideoProject(
  id: string,
  userId: string,
  input: UpdateVideoProjectInput
): Promise<MutationResult> {
  const result = await updateCollaborativeDocument(runQuery, id, userId, [VIDEO_SUBTYPE], {
    title: input.title,
  });
  if (result.status !== 'ok') return { kind: result.status };

  if (input.aspect_ratio != null) {
    await db.query(
      `UPDATE video_projects SET aspect_ratio = $1, updated_at = CURRENT_TIMESTAMP
       WHERE document_id = $2`,
      [input.aspect_ratio, id]
    );
  }
  await db.query(
    `UPDATE collaborative_documents SET updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND is_deleted = false AND deleted_at IS NULL`,
    [id]
  );
  return { kind: 'ok' };
}

/** Moves the project to the Papierkorb; the purge removes it for good. */
export async function deleteVideoProject(id: string, userId: string): Promise<MutationResult> {
  const result = await trashCollaborativeDocument(runQuery, id, userId, [VIDEO_SUBTYPE]);
  return { kind: result.status };
}
