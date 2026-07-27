import {
  type BoardContent,
  type BoardPreview,
  type ContentItem,
  type ContentKind,
} from '@gruenerator/contracts';
import { NON_LIBRARY_UPLOAD_SOURCES } from '@gruenerator/shared/media-library/constants';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { CANVAS_SUBTYPE } from '../../services/canvas/canvasRepository.js';
import { USER_VISIBLE_SHARE_STATUSES } from '../../services/sharedMediaService.js';

import { type ContentCursor, keysetWhere } from './contentCursor.js';

const db = getPostgresInstance();

/**
 * One query per kind, each returning `ContentItem`s already in the union shape.
 *
 * The filter runs here, in SQL, before the limit — that is the whole reason this
 * endpoint exists. `aggregateRecentActivity` fetches `limit` rows of *every*
 * kind, merges them and cuts the merged list back to `limit`, so an account with
 * a busy Office starves its Studio strips no matter what the caller asks for.
 */

const DOCS_SUBTYPES = [
  'blank',
  'antrag',
  'pressemitteilung',
  'protokoll',
  'notizen',
  'redaktionsplan',
  'checkliste',
  'einladung',
  'tabelle',
  'sheets',
  'presentations',
];

const SUBTYPE_EMOJI: Record<string, string> = {
  blank: '📄',
  antrag: '📋',
  pressemitteilung: '📰',
  protokoll: '📝',
  notizen: '💡',
  redaktionsplan: '📅',
  checkliste: '☑️',
  einladung: '✉️',
  tabelle: '📊',
  sheets: '📊',
  presentations: '🎬',
};

/**
 * Read access to a row in `collaborative_documents`: owner, explicitly shared,
 * or shared with a group the user is an active member of. `$${user}` appears
 * three times, so the caller passes the user id once and it is reused.
 */
function collabAccessWhere(user: number): string {
  return `(
    cd.created_by = $${user}
    OR cd.permissions ? $${user}::text
    OR cd.id IN (
      SELECT gcs.content_id::uuid
      FROM group_content_shares gcs
      INNER JOIN group_memberships gm
        ON gm.group_id = gcs.group_id AND gm.user_id = $${user} AND gm.is_active = TRUE
      WHERE gcs.content_type = 'collaborative_documents'
    )
  )`;
}

function collabAccessType(user: number): string {
  return `CASE
    WHEN cd.created_by = $${user} THEN 'owner'
    WHEN cd.permissions ? $${user}::text THEN 'direct'
    ELSE 'group'
  END`;
}

/** node-postgres returns `Date` for timestamptz; the contract carries ISO strings. */
function toIso(value: Date | string | null): string {
  if (value instanceof Date) return value.toISOString();
  return value ?? '';
}

type AccessType = 'owner' | 'direct' | 'group';

function toAccessType(value: string | null): AccessType | null {
  return value === 'owner' || value === 'direct' || value === 'group' ? value : null;
}

/** Appends the cursor predicate when there is one. */
function withCursor(
  where: string,
  dateExpr: string,
  idExpr: string,
  kind: ContentKind,
  cursor: ContentCursor | null,
  params: unknown[]
): string {
  if (!cursor) return where;
  return `${where} AND ${keysetWhere(dateExpr, idExpr, kind, cursor, params)}`;
}

export async function fetchDocs(
  userId: string,
  limit: number,
  cursor: ContentCursor | null
): Promise<ContentItem[]> {
  const params: unknown[] = [userId, DOCS_SUBTYPES];
  const where = withCursor(
    `cd.is_deleted = false
     AND cd.document_subtype = ANY($2::text[])
     AND ${collabAccessWhere(1)}`,
    'cd.updated_at',
    'cd.id',
    'doc',
    cursor,
    params
  );
  params.push(limit);

  const rows = (await db.query(
    `SELECT cd.id, cd.title, cd.updated_at, cd.document_subtype,
            p.display_name AS creator_name,
            ${collabAccessType(1)} AS access_type
     FROM collaborative_documents cd
     LEFT JOIN profiles p ON cd.created_by = p.id
     WHERE ${where}
     ORDER BY cd.updated_at DESC, cd.id DESC
     LIMIT $${params.length}`,
    params
  )) as Array<{
    id: string;
    title: string | null;
    updated_at: Date | string;
    document_subtype: string | null;
    creator_name: string | null;
    access_type: string | null;
  }>;

  return rows.map((row) => ({
    kind: 'doc' as const,
    id: row.id,
    title: row.title || 'Unbenanntes Dokument',
    date: toIso(row.updated_at),
    href: `/office/${row.id}`,
    deleteEndpoint: `/api/docs/${row.id}`,
    creatorName: row.creator_name,
    accessType: toAccessType(row.access_type),
    documentType: row.document_subtype ?? 'blank',
    emoji: SUBTYPE_EMOJI[row.document_subtype ?? 'blank'] ?? '📄',
    // The prose excerpt is what made the Arbeiten list a megabyte-sized
    // response; a list endpoint has no business shipping document bodies.
    content: null,
  }));
}

export async function fetchBoards(
  userId: string,
  limit: number,
  cursor: ContentCursor | null
): Promise<ContentItem[]> {
  const params: unknown[] = [userId];
  const where = withCursor(
    `cd.document_subtype = 'boards'
     AND cd.is_deleted = false
     AND ${collabAccessWhere(1)}`,
    'cd.updated_at',
    'cd.id',
    'board',
    cursor,
    params
  );
  params.push(limit);

  const rows = (await db.query(
    `SELECT cd.id, cd.title, cd.updated_at, cd.content,
            p.display_name AS creator_name,
            ${collabAccessType(1)} AS access_type
     FROM collaborative_documents cd
     LEFT JOIN profiles p ON cd.created_by = p.id
     WHERE ${where}
     ORDER BY cd.updated_at DESC, cd.id DESC
     LIMIT $${params.length}`,
    params
  )) as Array<{
    id: string;
    title: string | null;
    updated_at: Date | string;
    content: string | BoardContent | null;
    creator_name: string | null;
    access_type: string | null;
  }>;

  return rows.map((row) => {
    let boardType: 'kanban' | 'whiteboard' = 'kanban';
    let preview: BoardPreview | null = null;
    try {
      const content: BoardContent | null =
        typeof row.content === 'string' ? (JSON.parse(row.content) as BoardContent) : row.content;
      if (content && typeof content !== 'string') {
        if (content.board_type === 'whiteboard') boardType = 'whiteboard';
        preview = content.preview ?? null;
      }
    } catch {
      // Unparseable metadata means a kanban board without a preview, not a 500.
    }
    return {
      kind: 'board' as const,
      id: row.id,
      title: row.title || 'Unbenanntes Board',
      date: toIso(row.updated_at),
      href: `/boards/${row.id}`,
      deleteEndpoint: `/api/boards/${row.id}`,
      creatorName: row.creator_name,
      accessType: toAccessType(row.access_type),
      boardType,
      preview,
    };
  });
}

export async function fetchImages(
  userId: string,
  limit: number,
  cursor: ContentCursor | null
): Promise<ContentItem[]> {
  const params: unknown[] = [
    userId,
    [...NON_LIBRARY_UPLOAD_SOURCES],
    [...USER_VISIBLE_SHARE_STATUSES],
  ];
  const where = withCursor(
    `user_id = $1
     AND media_type = 'image'
     AND (upload_source IS NULL OR upload_source != ALL($2))
     AND status = ANY($3)`,
    'created_at',
    'id',
    'image',
    cursor,
    params
  );
  params.push(limit);

  const rows = (await db.query(
    `SELECT id, share_token, title, thumbnail_path, image_metadata, content_origin, created_at
     FROM shared_media
     WHERE ${where}
     ORDER BY created_at DESC, id DESC
     LIMIT $${params.length}`,
    params
  )) as Array<{
    id: string;
    share_token: string;
    title: string | null;
    thumbnail_path: string | null;
    image_metadata: { blurhash?: string } | null;
    content_origin: string;
    created_at: Date | string;
  }>;

  return rows.map((row) => ({
    kind: 'image' as const,
    // The row id, not the share token — `/recent-activity` puts the token here
    // and that is why an id from that feed 404s against the media endpoints.
    id: row.id,
    shareToken: row.share_token,
    title: row.title || 'Ohne Titel',
    date: toIso(row.created_at),
    href: `/share/${row.share_token}`,
    deleteEndpoint: `/api/share/${row.share_token}`,
    // Shares carry no collaborators; the fields exist so every card can read
    // the same shape without a per-kind branch.
    creatorName: null,
    accessType: 'owner' as const,
    // Built once, here. A share created seconds ago has no thumbnail_path until
    // the variants pass finishes, so it falls back to the on-demand preview —
    // without that the freshest image is the one that renders blank.
    thumbnailUrl: row.thumbnail_path
      ? `/api/share/${row.share_token}/thumbnail`
      : `/api/share/${row.share_token}/preview?w=400&fmt=webp`,
    blurhash: row.image_metadata?.blurhash ?? null,
    contentOrigin: (row.content_origin ?? 'unknown') as 'ki' | 'sharepic' | 'upload' | 'unknown',
  }));
}

export async function fetchVideos(
  userId: string,
  limit: number,
  cursor: ContentCursor | null
): Promise<ContentItem[]> {
  const sortExpr = 'COALESCE(last_edited_at, updated_at, created_at)';
  const params: unknown[] = [userId];
  const where = withCursor(
    `user_id = $1 AND subtitled_video_path IS NOT NULL`,
    sortExpr,
    'id',
    'video',
    cursor,
    params
  );
  params.push(limit);

  const rows = (await db.query(
    `SELECT id, title, thumbnail_path, video_metadata,
            ${sortExpr} AS sort_date
     FROM subtitler_projects
     WHERE ${where}
     ORDER BY ${sortExpr} DESC, id DESC
     LIMIT $${params.length}`,
    params
  )) as Array<{
    id: string;
    title: string | null;
    thumbnail_path: string | null;
    video_metadata: string | { duration?: number | string } | null;
    sort_date: Date | string;
  }>;

  return rows.map((row) => {
    let duration: number | null = null;
    try {
      const metadata = (
        typeof row.video_metadata === 'string' ? JSON.parse(row.video_metadata) : row.video_metadata
      ) as { duration?: number | string } | null;
      if (metadata?.duration != null) {
        const seconds = Math.round(Number(metadata.duration));
        duration = Number.isFinite(seconds) ? seconds : null;
      }
    } catch {
      // Metadata that will not parse costs the badge, not the tile.
    }

    return {
      kind: 'video' as const,
      id: row.id,
      title: row.title || 'Ohne Titel',
      date: toIso(row.sort_date),
      href: `/studio/video?project=${row.id}`,
      deleteEndpoint: `/api/subtitler/projects/${row.id}`,
      creatorName: null,
      accessType: 'owner' as const,
      thumbnailUrl: row.thumbnail_path ? `/api/subtitler/projects/${row.id}/thumbnail` : null,
      duration,
    };
  });
}

export async function fetchCanvases(
  userId: string,
  limit: number,
  cursor: ContentCursor | null
): Promise<ContentItem[]> {
  const params: unknown[] = [userId, CANVAS_SUBTYPE];
  const where = withCursor(
    `cd.document_subtype = $2
     AND cd.is_deleted = false
     AND ${collabAccessWhere(1)}`,
    'cd.updated_at',
    'cd.id',
    'canvas',
    cursor,
    params
  );
  params.push(limit);

  const rows = (await db.query(
    `SELECT cd.id, cd.title, cd.updated_at, cdoc.thumbnail_url,
            p.display_name AS creator_name,
            ${collabAccessType(1)} AS access_type
     FROM collaborative_documents cd
     INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
     LEFT JOIN profiles p ON cd.created_by = p.id
     WHERE ${where}
     ORDER BY cd.updated_at DESC, cd.id DESC
     LIMIT $${params.length}`,
    params
  )) as Array<{
    id: string;
    title: string | null;
    updated_at: Date | string;
    thumbnail_url: string | null;
    creator_name: string | null;
    access_type: string | null;
  }>;

  return rows.map((row) => ({
    kind: 'canvas' as const,
    id: row.id,
    title: row.title || 'Neuer Canvas',
    date: toIso(row.updated_at),
    href: `/studio/canvas/${row.id}`,
    deleteEndpoint: `/api/canvas/${row.id}`,
    creatorName: row.creator_name,
    accessType: toAccessType(row.access_type),
    thumbnailUrl: row.thumbnail_url,
  }));
}

export const FETCHERS: Record<
  ContentKind,
  (userId: string, limit: number, cursor: ContentCursor | null) => Promise<ContentItem[]>
> = {
  doc: fetchDocs,
  board: fetchBoards,
  image: fetchImages,
  video: fetchVideos,
  canvas: fetchCanvases,
};
