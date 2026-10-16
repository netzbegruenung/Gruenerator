import {
  mediathekMediaItemSchema,
  type MediathekFilter,
  type MediathekItem,
  type MediathekMediaItem,
  type MediathekResponse,
} from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { CANVAS_SUBTYPE } from '../../services/canvas/canvasRepository.js';
import { LIBRARY_ITEM_CLAUSE } from '../../services/sharedMediaFilters.js';
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
 * Sharepics count as images and Sharepics, Reels as videos.
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
 * The Mediathek: the user's media files, Reels and canvas Sharepics as one list.
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

  const params: unknown[] = [userId, CANVAS_SUBTYPE];
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
     )
     SELECT kind, id, COUNT(*) OVER () AS total
     FROM entries
     WHERE ${FILTER_WHERE[filter]} AND ${searchWhere}
     ORDER BY date ${direction}, id ${direction}
     LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params
  )) as Array<{ kind: MediathekItem['kind']; id: string; total: string }>;

  const idsOf = (kind: MediathekItem['kind']) =>
    rows.filter((row) => row.kind === kind).map((row) => row.id);
  const [media, videos, canvases] = await Promise.all([
    fetchMediaByIds(userId, idsOf('media')),
    fetchVideosByIds(userId, idsOf('video')),
    fetchCanvasesByIds(userId, idsOf('canvas')),
  ]);
  const byKey = new Map<string, MediathekItem>(
    [...media, ...videos, ...canvases].map((item) => [`${item.kind}:${item.id}`, item])
  );

  // A row trashed between the two reads drops out instead of failing the page.
  const items = rows.flatMap((row) => byKey.get(`${row.kind}:${row.id}`) ?? []);
  const total = rows[0] ? Number(rows[0].total) : 0;
  return { items, total, limit, offset, hasMore: offset + rows.length < total };
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
      fileSize: row.file_size ?? 0,
      createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : row.created_at,
    });
    if (parsed.success) return [parsed.data];
    log.warn(`Skipping media ${row.id}: ${parsed.error.message}`);
    return [];
  });
}
