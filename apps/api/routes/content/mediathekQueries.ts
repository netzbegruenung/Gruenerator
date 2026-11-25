import {
  mediathekMediaItemSchema,
  type MediathekFilter,
  type MediathekItem,
  type MediathekMediaItem,
  type MediathekResponse,
  type MediathekVideoProjectItem,
} from '@gruenerator/contracts';
import { buildVideoProjectSlug } from '@gruenerator/shared/utils';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { CANVAS_SUBTYPE } from '../../services/canvas/canvasRepository.js';
import { LIBRARY_ITEM_CLAUSE } from '../../services/sharedMediaFilters.js';
import { VIDEO_SUBTYPE } from '../../services/videoProjects/videoProjectRepository.js';
import { createLogger } from '../../utils/logger.js';
import { likeContainsPattern } from '../../utils/sqlLike.js';
import { transformMediaItem } from '../media/mediaItemTransform.js';

import { fetchCanvasesByIds, fetchVideosByIds } from './contentQueries.js';

import type { SharedMediaRow } from '../../types/media.js';

const db = getPostgresInstance();
const log = createLogger('mediathek');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

/**
 * Which entries a filter keeps, over the columns of the union below. Canvas
 * Sharepics count as images and Sharepics, Reels and Video-Editor projects as
 * videos.
 */
const FILTER_WHERE: Record<MediathekFilter, string> = {
  all: 'TRUE',
  sharepic: `(kind = 'canvas' OR (kind = 'media' AND media_type = 'image' AND origin IN ('sharepic', 'unknown')))`,
  ki: `(kind = 'media' AND origin = 'ki')`,
  reel: `kind = 'video'`,
  upload: `(kind = 'media' AND origin = 'upload')`,
  image: `media_type = 'image'`,
  video: `media_type = 'video'`,
  audio: `media_type = 'audio'`,
};

export interface MediathekQuery {
  typ?: MediathekFilter | undefined;
  search?: string | undefined;
  sort?: 'newest' | 'oldest' | undefined;
  limit?: string | undefined;
  offset?: string | undefined;
}

/**
 * The Mediathek: the user's media files, Reels, Video-Editor projects and
 * canvas Sharepics as one list.
 *
 * Uploaded videos stay out: they are the raw clips of a Video-Editor project,
 * and the project is the tile that stands for them. The editor's own Uploads
 * panel still lists them (`/api/media`).
 *
 * Unlike the asset pool behind `/api/media`, drafts are in: canvas autosave
 * writes `'draft'`, and a ready-only list hid every autosaved Sharepic. The
 * union only carries the sort key; each page is then read per kind with the
 * mappers its own feed uses, so a Reel looks the same here and on /studio.
 */
export async function listMediathek(
  userId: string,
  query: MediathekQuery
): Promise<MediathekResponse> {
  const filter = query.typ ?? 'all';
  const limit = Math.min(Math.max(1, Number(query.limit) || DEFAULT_LIMIT), MAX_LIMIT);
  const offset = Math.max(0, Number(query.offset) || 0);
  const direction = query.sort === 'oldest' ? 'ASC' : 'DESC';

  const params: unknown[] = [userId, CANVAS_SUBTYPE, VIDEO_SUBTYPE];
  let searchWhere = 'TRUE';
  const search = query.search?.trim();
  if (search) {
    params.push(likeContainsPattern(search));
    searchWhere = `(title ILIKE $${params.length} OR alt_text ILIKE $${params.length})`;
  }
  params.push(limit, offset);

  const rows = (await db.query(
    `WITH entries AS (
       SELECT 'media' AS kind, id::text AS id, created_at AS date, title, alt_text,
              media_type, COALESCE(content_origin, 'unknown') AS origin
       FROM shared_media
       WHERE user_id = $1
         AND deleted_at IS NULL
         AND status IN ('ready', 'draft')
         AND media_type IN ('image', 'video', 'audio')
         AND NOT (media_type = 'video' AND (content_origin = 'upload' OR upload_source = 'upload'))
         AND ${LIBRARY_ITEM_CLAUSE}
       UNION ALL
       SELECT 'video', id::text, COALESCE(last_edited_at, updated_at, created_at), title, NULL,
              'video', NULL
       FROM subtitler_projects
       WHERE user_id = $1 AND deleted_at IS NULL AND subtitled_video_path IS NOT NULL
       UNION ALL
       SELECT 'canvas', cd.id::text, cd.updated_at, cd.title, NULL, 'image', 'sharepic'
       FROM collaborative_documents cd
       INNER JOIN canvas_documents cdoc ON cdoc.document_id = cd.id
       WHERE cd.created_by = $1 AND cd.document_subtype = $2 AND cd.is_deleted = false
       UNION ALL
       -- Every editor visit creates a project; only edited ones (with Yjs state) count.
       SELECT 'videoProject', cd.id::text, cd.updated_at, cd.title, NULL, 'video', NULL
       FROM collaborative_documents cd
       WHERE cd.created_by = $1 AND cd.document_subtype = $3
         AND cd.is_deleted = false AND cd.deleted_at IS NULL
         AND (
           EXISTS (SELECT 1 FROM yjs_document_updates u WHERE u.document_id = cd.id)
           OR EXISTS (SELECT 1 FROM yjs_document_snapshots s WHERE s.document_id = cd.id)
         )
     ),
     filtered AS (
       SELECT kind, id, date FROM entries WHERE ${FILTER_WHERE[filter]} AND ${searchWhere}
     )
     -- One row even for an empty page, so the count survives an offset past the end.
     SELECT (SELECT COUNT(*) FROM filtered) AS total, page.kind, page.id
     FROM (SELECT 1) AS one
     LEFT JOIN LATERAL (
       SELECT kind, id FROM filtered
       ORDER BY date ${direction}, id ${direction}
       LIMIT $${params.length - 1} OFFSET $${params.length}
     ) AS page ON TRUE`,
    params
  )) as Array<{ kind: MediathekItem['kind'] | null; id: string | null; total: string }>;

  const total = Number(rows[0]?.total ?? 0);
  const page = rows.flatMap((row) => (row.kind && row.id ? [{ kind: row.kind, id: row.id }] : []));
  const idsOf = (kind: MediathekItem['kind']) =>
    page.filter((row) => row.kind === kind).map((row) => row.id);
  const [media, videos, canvases, videoProjects] = await Promise.all([
    fetchMediaByIds(userId, idsOf('media')),
    fetchVideosByIds(userId, idsOf('video')),
    fetchCanvasesByIds(userId, idsOf('canvas')),
    fetchVideoProjectsByIds(userId, idsOf('videoProject')),
  ]);
  const byKey = new Map<string, MediathekItem>(
    [...media, ...videos, ...canvases, ...videoProjects].map((item) => [
      `${item.kind}:${item.id}`,
      item,
    ])
  );

  // A row trashed between the two reads drops out instead of failing the page.
  const items = page.flatMap((row) => byKey.get(`${row.kind}:${row.id}`) ?? []);
  return { items, total, limit, offset, hasMore: offset + page.length < total };
}

async function fetchMediaByIds(userId: string, ids: string[]): Promise<MediathekMediaItem[]> {
  if (ids.length === 0) return [];
  const rows = (await db.query(
    `SELECT id, share_token, media_type, title, thumbnail_path, file_size,
            mime_type, duration, image_type, image_metadata, status,
            download_count, view_count, created_at, alt_text, upload_source,
            original_filename, content_origin
     FROM shared_media
     WHERE user_id = $1 AND deleted_at IS NULL AND id::text = ANY($2::text[])`,
    [userId, ids]
  )) as SharedMediaRow[];
  // The row type is wider than the wire (`transfer`, `processing`, a Date); the
  // query rules those out, and the parse is where that is checked, not assumed.
  return rows.flatMap((row) => {
    const parsed = mediathekMediaItemSchema.safeParse({
      ...transformMediaItem(row),
      kind: 'media',
      // BIGINT: node-postgres returns it as a string, the wire wants a number.
      fileSize: Number(row.file_size ?? 0),
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    });
    if (parsed.success) return [parsed.data];
    log.warn(`Skipping media ${row.id}: ${parsed.error.message}`);
    return [];
  });
}

interface VideoProjectRow {
  id: string;
  title: string | null;
  updated_at: Date | string;
  slug_suffix: string;
  poster_token: string | null;
  poster_media_type: string | null;
  poster_has_thumbnail: boolean | null;
}

/**
 * The tile shows the clip the project opens on: Hocuspocus keeps its share
 * token as `{ posterShareToken }` in `content` (`storeVideoPreview`). A video
 * needs its poster frame, an image is its own preview; a trashed or foreign
 * file gives no tile picture rather than a broken one.
 */
async function fetchVideoProjectsByIds(
  userId: string,
  ids: string[]
): Promise<MediathekVideoProjectItem[]> {
  if (ids.length === 0) return [];
  const rows = (await db.query(
    `SELECT cd.id, cd.title, cd.updated_at, vp.slug_suffix,
            sm.share_token AS poster_token, sm.media_type AS poster_media_type,
            (sm.thumbnail_path IS NOT NULL) AS poster_has_thumbnail
     FROM collaborative_documents cd
     INNER JOIN video_projects vp ON vp.document_id = cd.id
     LEFT JOIN shared_media sm
       ON sm.share_token = CASE WHEN cd.content LIKE '{%' THEN cd.content::jsonb->>'posterShareToken' END
      AND sm.user_id = $1
      AND sm.deleted_at IS NULL
     WHERE cd.created_by = $1 AND cd.document_subtype = $3
       AND cd.is_deleted = false AND cd.deleted_at IS NULL
       AND cd.id::text = ANY($2::text[])`,
    [userId, ids, VIDEO_SUBTYPE]
  )) as VideoProjectRow[];

  return rows.map((row) => {
    const slug = buildVideoProjectSlug(row.title ?? '', row.slug_suffix);
    return {
      kind: 'videoProject' as const,
      id: row.id,
      title: row.title || 'Videoprojekt',
      date: row.updated_at instanceof Date ? row.updated_at.toISOString() : row.updated_at,
      href: `/studio/videoeditor/${slug}`,
      deleteEndpoint: `/api/video-projects/${row.id}`,
      creatorName: null,
      accessType: 'owner' as const,
      thumbnailUrl: posterUrl(row),
    };
  });
}

function posterUrl(row: VideoProjectRow): string | null {
  if (!row.poster_token) return null;
  if (row.poster_media_type === 'image') return `/api/share/${row.poster_token}/preview?w=400`;
  return row.poster_has_thumbnail ? `/api/share/${row.poster_token}/thumbnail` : null;
}
