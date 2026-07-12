/**
 * Canvas documents repository.
 *
 * Canvas state reuses the `collaborative_documents` ACL/Yjs/sharing pipeline
 * (document_subtype='canvas'); canvas-specific columns live in the 1:1 sidecar
 * `canvas_documents`. The permission joins (jsonb `permissions ? userId`, the
 * group_content_shares subquery, `checkDocumentAccess`, the clone transaction)
 * are kept as raw SQL — porting them to the Drizzle query builder would be
 * high-risk for no type gain. The gain here is typing every result against the
 * Drizzle-inferred row types instead of the hand-written row interfaces the
 * legacy controllers carried.
 */

import { type CanvasDocument, type CanvasListItem } from '@gruenerator/contracts';
import { type InferSelectModel } from 'drizzle-orm';
import { type PoolClient } from 'pg';

import { type canvasDocuments } from '../../database/schema/canvas.js';
import { type collaborative_documents } from '../../database/schema/collaborative.js';
import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import {
  checkDocumentAccess,
  type DocumentAccessSubject,
} from '../../routes/docs/documentAccess.js';
import { type DocumentPermissions } from '../../routes/docs/types.js';

export const CANVAS_SUBTYPE = 'canvas';
const DEFAULT_CANVAS_FORMAT = 'post-portrait';

const db = getPostgresInstance();

type CollabRow = InferSelectModel<typeof collaborative_documents>;
type SidecarRow = InferSelectModel<typeof canvasDocuments>;

/**
 * The shape returned by the canvas list/get JOIN — composed from the inferred
 * row types of both tables plus the profiles join, so it follows the schemas
 * automatically. jsonb/timestamp columns come back parsed/`Date` from pg.
 */
type CanvasJoinedRow = Pick<
  CollabRow,
  | 'id'
  | 'title'
  | 'created_by'
  | 'created_at'
  | 'updated_at'
  | 'permissions'
  | 'is_public'
  | 'share_mode'
> &
  Pick<
    SidecarRow,
    | 'template_type'
    | 'base_template_id'
    | 'thumbnail_url'
    | 'page_count'
    | 'initial_state'
    | 'format'
  > & { creator_name: string | null };

/**
 * List projection: everything except `initial_state` — the full canvas JSONB
 * would make the list response scale with total canvas count for metadata-only
 * consumers.
 */
const CANVAS_LIST_SELECT_COLUMNS = `
  cd.id, cd.title, cd.created_by, cd.created_at, cd.updated_at,
  cd.permissions, cd.is_public, cd.share_mode,
  cdoc.template_type, cdoc.base_template_id, cdoc.thumbnail_url,
  cdoc.page_count, cdoc.format,
  p.display_name AS creator_name
`;

/** Full column list for single-document reads (get/create/clone). */
const CANVAS_SELECT_COLUMNS = `${CANVAS_LIST_SELECT_COLUMNS}, cdoc.initial_state`;

/**
 * Canonical ACL predicate for canvas documents: owned, directly shared, or
 * group-shared. Parameter slots: $1 = document_subtype, $2/$3 = userId.
 * Shared with the workplace recent-activity feed so the two surfaces can't
 * drift on who sees which canvases.
 */
export const CANVAS_ACCESS_WHERE = `
  cd.document_subtype = $1
  AND cd.is_deleted = false
  AND (
    cd.created_by = $2
    OR cd.permissions ? $3::text
    OR cd.id IN (
      SELECT gcs.content_id::uuid
      FROM group_content_shares gcs
      INNER JOIN group_memberships gm
        ON gm.group_id = gcs.group_id AND gm.user_id = $2 AND gm.is_active = TRUE
      WHERE gcs.content_type = 'collaborative_documents'
    )
  )
`;

/** node-postgres returns `Date` for timestamptz; the contract serializes ISO strings. */
function toIso(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

/**
 * Map a Drizzle-inferred row to the `DocumentAccessSubject` shape
 * `checkDocumentAccess` expects. jsonb→typed and text→enum are boundary casts;
 * the columns carry these shapes by construction.
 */
function toAccessSubject(row: {
  id: string;
  created_by: string | null;
  permissions: Record<string, unknown> | null;
  is_public: boolean | null;
  share_mode: string | null;
}): DocumentAccessSubject {
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

/** Map a joined list row (no initial_state) to the API contract type. */
function rowToCanvasListItem(row: Omit<CanvasJoinedRow, 'initial_state'>): CanvasListItem {
  return {
    id: row.id,
    title: row.title,
    // created_by is nominally nullable in the schema but always set for canvas rows.
    created_by: row.created_by ?? '',
    created_at: toIso(row.created_at),
    updated_at: toIso(row.updated_at),
    // jsonb is structurally unknown at the DB boundary; the column carries the
    // DocumentPermissions shape by construction.
    permissions: (row.permissions as DocumentPermissions | null) ?? null,
    is_public: row.is_public ?? false,
    template_type: row.template_type,
    base_template_id: row.base_template_id,
    thumbnail_url: row.thumbnail_url,
    page_count: row.page_count,
    format: row.format,
    ...(row.share_mode ? { share_mode: row.share_mode as CanvasDocument['share_mode'] } : {}),
    ...(row.creator_name != null ? { creator_name: row.creator_name } : {}),
  };
}

/** Map a fully joined row to the API contract type. */
function rowToCanvasDocument(row: CanvasJoinedRow): CanvasDocument {
  return { ...rowToCanvasListItem(row), initial_state: row.initial_state };
}

// ── Reads ──────────────────────────────────────────────────────────────────

export async function listCanvases(userId: string): Promise<CanvasListItem[]> {
  const rows = (await db.query(
    `SELECT ${CANVAS_LIST_SELECT_COLUMNS}
     FROM collaborative_documents cd
     INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
     LEFT JOIN profiles p ON cd.created_by = p.id
     WHERE ${CANVAS_ACCESS_WHERE}
     ORDER BY cd.updated_at DESC`,
    [CANVAS_SUBTYPE, userId, userId]
  )) as Omit<CanvasJoinedRow, 'initial_state'>[];

  return rows.map(rowToCanvasListItem);
}

type GetResult =
  | { kind: 'ok'; canvas: CanvasDocument }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

export async function getCanvas(id: string, userId: string): Promise<GetResult> {
  const rows = (await db.query(
    `SELECT ${CANVAS_SELECT_COLUMNS}
     FROM collaborative_documents cd
     INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
     LEFT JOIN profiles p ON cd.created_by = p.id
     WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
    [id, CANVAS_SUBTYPE]
  )) as CanvasJoinedRow[];

  const row = rows[0];
  if (!row) return { kind: 'not_found' };

  const access = await checkDocumentAccess(toAccessSubject(row), userId);
  if (!access.hasAccess) return { kind: 'forbidden' };

  return { kind: 'ok', canvas: rowToCanvasDocument(row) };
}

// ── Create ───────────────────────────────────────────────────────────────────

export interface CreateCanvasInput {
  title?: string;
  template_type: string;
  base_template_id?: string;
  initial_state?: Record<string, unknown>;
  page_count?: number;
  format?: string;
}

export async function createCanvas(
  userId: string,
  input: CreateCanvasInput
): Promise<CanvasDocument> {
  const {
    title = 'Neuer Canvas',
    template_type,
    base_template_id,
    initial_state = {},
    page_count = 1,
    format = DEFAULT_CANVAS_FORMAT,
  } = input;

  const docRows = (await db.query(
    `INSERT INTO collaborative_documents
       (title, content, created_by, last_edited_by, document_subtype, is_public)
     VALUES ($1, $2, $3, $3, $4, false)
     RETURNING id, title, created_by, created_at, updated_at, permissions, is_public, share_mode`,
    [title, '', userId, CANVAS_SUBTYPE]
  )) as Array<
    Pick<
      CollabRow,
      | 'id'
      | 'title'
      | 'created_by'
      | 'created_at'
      | 'updated_at'
      | 'permissions'
      | 'is_public'
      | 'share_mode'
    >
  >;
  const doc = docRows[0];

  const sidecarRows = (await db.query(
    `INSERT INTO canvas_documents
       (document_id, template_type, base_template_id, page_count, initial_state, format)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING template_type, base_template_id, thumbnail_url, page_count, initial_state, format`,
    [
      doc.id,
      template_type,
      base_template_id ?? null,
      page_count,
      JSON.stringify(initial_state),
      format,
    ]
  )) as Array<
    Pick<
      SidecarRow,
      | 'template_type'
      | 'base_template_id'
      | 'thumbnail_url'
      | 'page_count'
      | 'initial_state'
      | 'format'
    >
  >;

  return rowToCanvasDocument({ ...doc, ...sidecarRows[0], creator_name: null });
}

// ── Update / delete (permission-gated) ───────────────────────────────────────

type MutationResult = { kind: 'ok' } | { kind: 'not_found' } | { kind: 'forbidden' };

type CanvasOwnerRow = Pick<CollabRow, 'created_by' | 'permissions'>;

async function loadOwnerRow(id: string): Promise<CanvasOwnerRow | null> {
  const rows = (await db.query(
    `SELECT created_by, permissions FROM collaborative_documents
     WHERE id = $1 AND document_subtype = $2 AND is_deleted = false`,
    [id, CANVAS_SUBTYPE]
  )) as CanvasOwnerRow[];
  return rows[0] ?? null;
}

export interface UpdateCanvasInput {
  title?: string;
  thumbnail_url?: string;
  page_count?: number;
  format?: string;
}

export async function updateCanvas(
  id: string,
  userId: string,
  patch: UpdateCanvasInput
): Promise<MutationResult> {
  const row = await loadOwnerRow(id);
  if (!row) return { kind: 'not_found' };

  const permissions = row.permissions as DocumentPermissions | null;
  const userPermission = permissions?.[userId];
  const canEdit =
    row.created_by === userId ||
    (userPermission != null && ['owner', 'editor'].includes(userPermission.level));
  if (!canEdit) return { kind: 'forbidden' };

  const { title, thumbnail_url, page_count, format } = patch;

  let replacedThumbnailUrl: string | null = null;
  if (thumbnail_url !== undefined) {
    const prev = (await db.query(
      'SELECT thumbnail_url FROM canvas_documents WHERE document_id = $1',
      [id]
    )) as Array<{ thumbnail_url: string | null }>;
    const prevUrl = prev[0]?.thumbnail_url ?? null;
    if (prevUrl && prevUrl !== thumbnail_url) replacedThumbnailUrl = prevUrl;
  }

  if (title !== undefined) {
    await db.query(
      `UPDATE collaborative_documents
       SET title = $1, updated_at = CURRENT_TIMESTAMP
       WHERE id = $2`,
      [title, id]
    );
  }

  if (thumbnail_url !== undefined || page_count !== undefined || format !== undefined) {
    const sidecarUpdates: string[] = ['updated_at = CURRENT_TIMESTAMP'];
    const sidecarValues: unknown[] = [];
    let idx = 1;
    if (thumbnail_url !== undefined) {
      sidecarUpdates.push(`thumbnail_url = $${idx++}`);
      sidecarValues.push(thumbnail_url);
    }
    if (page_count !== undefined) {
      sidecarUpdates.push(`page_count = $${idx++}`);
      sidecarValues.push(page_count);
    }
    if (format !== undefined) {
      sidecarUpdates.push(`format = $${idx++}`);
      sidecarValues.push(format);
    }
    sidecarValues.push(id);
    await db.query(
      `UPDATE canvas_documents SET ${sidecarUpdates.join(', ')} WHERE document_id = $${idx}`,
      sidecarValues
    );
  }

  if (replacedThumbnailUrl) {
    void deleteReplacedThumbnailShare(replacedThumbnailUrl).catch((err) => {
      console.warn('[canvasRepository] Failed to delete replaced thumbnail share:', err);
    });
  }

  return { kind: 'ok' };
}

const SHARE_DOWNLOAD_URL_RE = /^\/api\/share\/([^/?#]+)\/download$/;

/**
 * Thumbnail refreshes mint a new share per render (immutable-cache URLs), so
 * the superseded one must go or internal rows accumulate unbounded — they are
 * exempt from enforceUserLimit. Only internal artifacts (is_library_item =
 * FALSE) are ever deleted; a library image someone set as thumbnail survives.
 * Deletion runs as the share's own uploader — in collab docs the replacer may
 * be a different editor.
 */
async function deleteReplacedThumbnailShare(url: string): Promise<void> {
  const match = SHARE_DOWNLOAD_URL_RE.exec(url);
  if (!match) return;
  const token = match[1];

  const rows = (await db.query(
    `SELECT user_id FROM shared_media
     WHERE share_token = $1 AND COALESCE(is_library_item, TRUE) = FALSE`,
    [token]
  )) as Array<{ user_id: string }>;
  if (!rows[0]) return;

  const { getSharedMediaService } = await import('../../routes/share/shareServices.js');
  const service = await getSharedMediaService();
  await service.deleteShare(rows[0].user_id, token);
}

export async function deleteCanvas(id: string, userId: string): Promise<MutationResult> {
  const row = await loadOwnerRow(id);
  if (!row) return { kind: 'not_found' };

  const permissions = row.permissions as DocumentPermissions | null;
  const userPermission = permissions?.[userId];
  const isOwner = row.created_by === userId || userPermission?.level === 'owner';
  if (!isOwner) return { kind: 'forbidden' };

  await db.query(
    'UPDATE collaborative_documents SET is_deleted = true, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [id]
  );

  return { kind: 'ok' };
}

// ── Resize (duplicate-with-format) ───────────────────────────────────────────

type ResizeResult =
  | { kind: 'ok'; newCanvasId: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

type CanvasResizeSourceRow = Pick<CollabRow, 'id' | 'title' | 'created_by'> &
  Pick<SidecarRow, 'template_type' | 'base_template_id' | 'page_count' | 'initial_state'>;

/** Caller must validate `formatId` (e.g. `getServerFormat`) before calling. */
export async function resizeCanvas(
  id: string,
  userId: string,
  formatId: string,
  titleOverride?: string
): Promise<ResizeResult> {
  const sourceRows = (await db.query(
    `SELECT cd.id, cd.title, cd.created_by,
            cdoc.template_type, cdoc.base_template_id, cdoc.page_count, cdoc.initial_state
     FROM collaborative_documents cd
     INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
     WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
    [id, CANVAS_SUBTYPE]
  )) as CanvasResizeSourceRow[];

  const source = sourceRows[0];
  if (!source) return { kind: 'not_found' };

  // Read access (owner OR explicit permission entry) is sufficient to duplicate.
  const accessRows = (await db.query(
    `SELECT 1 FROM collaborative_documents
     WHERE id = $1 AND document_subtype = $2 AND is_deleted = false
       AND (created_by = $3 OR permissions ? $3::text)
     LIMIT 1`,
    [id, CANVAS_SUBTYPE, userId]
  )) as Array<unknown>;
  if (accessRows.length === 0) return { kind: 'forbidden' };

  const newTitle = titleOverride ?? `${source.title} (${formatId})`;

  const docRows = (await db.query(
    `INSERT INTO collaborative_documents
       (title, content, created_by, last_edited_by, document_subtype, is_public)
     VALUES ($1, $2, $3, $3, $4, false)
     RETURNING id`,
    [newTitle, '', userId, CANVAS_SUBTYPE]
  )) as Array<{ id: string }>;
  const newDocumentId = docRows[0].id;

  await db.query(
    `INSERT INTO canvas_documents
       (document_id, template_type, base_template_id, page_count, initial_state, format)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      newDocumentId,
      source.template_type,
      source.base_template_id,
      source.page_count,
      JSON.stringify(source.initial_state ?? {}),
      formatId,
    ]
  );

  return { kind: 'ok', newCanvasId: newDocumentId };
}

/**
 * Mark a canvas as a public, read-only gallery template: any authenticated user
 * may read it (so `cloneCanvas` succeeds for the gallery "use" action), but
 * `share_permission='viewer'` denies write access — the frozen snapshot can be
 * cloned but never edited by others (see `checkDocumentWriteAccess`).
 */
export async function markCanvasAsGalleryTemplate(id: string): Promise<void> {
  await db.query(
    `UPDATE collaborative_documents
     SET share_mode = 'authenticated', share_permission = 'viewer',
         updated_at = CURRENT_TIMESTAMP
     WHERE id = $1 AND document_subtype = $2`,
    [id, CANVAS_SUBTYPE]
  );
}

// ── Clone ─────────────────────────────────────────────────────────────────────

type CloneResult =
  | { kind: 'ok'; newCanvasId: string; accessMethod?: string }
  | { kind: 'not_found' }
  | { kind: 'forbidden' };

type CanvasCloneSourceRow = Pick<
  CollabRow,
  'id' | 'title' | 'created_by' | 'permissions' | 'is_public' | 'share_mode'
> &
  Pick<
    SidecarRow,
    'template_type' | 'base_template_id' | 'page_count' | 'initial_state' | 'format'
  >;

export async function cloneCanvas(id: string, userId: string): Promise<CloneResult> {
  const sourceRows = (await db.query(
    `SELECT cd.id, cd.title, cd.created_by, cd.permissions, cd.is_public, cd.share_mode,
            cdoc.template_type, cdoc.base_template_id, cdoc.page_count,
            cdoc.initial_state, cdoc.format
     FROM collaborative_documents cd
     INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
     WHERE cd.id = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false`,
    [id, CANVAS_SUBTYPE]
  )) as CanvasCloneSourceRow[];

  const source = sourceRows[0];
  if (!source) return { kind: 'not_found' };

  const access = await checkDocumentAccess(toAccessSubject(source), userId);
  if (!access.hasAccess) return { kind: 'forbidden' };

  const sourceInitialState = source.initial_state ?? {};
  const seededState: Record<string, unknown> = {
    ...sourceInitialState,
    metadata: {
      ...((sourceInitialState.metadata as Record<string, unknown>) ?? {}),
      cloned_from_template_id: source.id,
      cloned_at: new Date().toISOString(),
    },
  };

  const newCanvasId = await db.transaction(async (client: PoolClient) => {
    const docResult = await client.query<{ id: string }>(
      `INSERT INTO collaborative_documents
         (title, content, created_by, last_edited_by, document_subtype, is_public)
       VALUES ($1, $2, $3, $3, $4, false)
       RETURNING id`,
      [`Kopie: ${source.title}`, '', userId, CANVAS_SUBTYPE]
    );
    const newDocumentId = docResult.rows[0].id;

    await client.query(
      `INSERT INTO canvas_documents
         (document_id, template_type, base_template_id, page_count, initial_state, format)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        newDocumentId,
        source.template_type,
        source.base_template_id,
        source.page_count,
        JSON.stringify(seededState),
        source.format,
      ]
    );

    return newDocumentId;
  });

  return { kind: 'ok', newCanvasId, accessMethod: access.accessMethod };
}
