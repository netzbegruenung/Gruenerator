/**
 * Turning a signed `(kind, id)` into a source image on disk.
 *
 * Deliberately unaware of who is asking: the signature already attests that
 * whoever minted the URL had passed the ACL check for that row (see
 * thumbnailSignature.ts). Re-checking ownership here would need a session the
 * request does not have.
 *
 * The version segment is NOT consulted. It exists to change the URL — and with
 * it the cache key — when the content changes. Resolving through it would make
 * it a second identifier with its own validation burden and its own IDOR
 * surface, for no gain.
 */

import path from 'path';

import { getPostgresInstance } from '../../database/services/PostgresService/PostgresService.js';
import { getSharedMediaService } from '../../routes/share/shareServices.js';
import { getSubtitlerProjectService } from '../subtitler/index.js';

import { type ThumbnailKind } from './thumbnailSignature.js';
import { shareTokenFromDownloadUrl } from './thumbnailUrl.js';

const db = getPostgresInstance();

/**
 * Ids are domain ids — 32-hex share tokens and UUIDs. Anything outside this
 * alphabet is rejected before a resolver runs, so no user-supplied string ever
 * reaches a `path.join`. (The individual services guard against traversal too;
 * this is the outer fence, not the only one.)
 */
const SAFE_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

/**
 * Reels and canvases key on `uuid` columns. Postgres raises `invalid input
 * syntax for type uuid` on anything else, which would surface as a 500 for what
 * is really a malformed request — so the shape is checked before the query.
 */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isSafeThumbnailId(id: string): boolean {
  return SAFE_ID_RE.test(id);
}

export type ResolvedThumbnail =
  | {
      ok: true;
      /** Absolute path of the image to resize. */
      sourcePath: string;
      /**
       * Where variants were already generated at upload time, if any. Hitting
       * one of these means the request costs a `stat` and a stream instead of a
       * sharp render.
       */
      pregenerated?: { dir: string; base: string };
      /** Mime type of `sourcePath`, for requests that want the original bytes. */
      contentType: string;
    }
  | { ok: false; reason: 'not_found' | 'processing' };

async function resolveMedia(shareToken: string): Promise<ResolvedThumbnail> {
  const service = await getSharedMediaService();
  const share = await service.getShareByToken(shareToken);
  if (!share) return { ok: false, reason: 'not_found' };
  if (share.status === 'processing') return { ok: false, reason: 'processing' };
  if (share.status === 'failed') return { ok: false, reason: 'not_found' };

  // A video share's `file_path` is the mp4. This endpoint only ever produces
  // still images, so it uses the poster frame generated at upload — resizing an
  // mp4 with sharp would throw, and streaming it would turn an <img> into a
  // silent multi-megabyte download.
  if (share.media_type === 'video') {
    const posterPath = service.getThumbnailFilePath(share.thumbnail_path ?? null);
    if (!posterPath) return { ok: false, reason: 'not_found' };
    return { ok: true, sourcePath: posterPath, contentType: 'image/jpeg' };
  }

  const mediaPath = service.getMediaFilePath(share.file_path ?? null);
  if (!mediaPath) return { ok: false, reason: 'not_found' };

  return {
    ok: true,
    sourcePath: mediaPath,
    contentType: share.mime_type || 'image/png',
    pregenerated: {
      dir: path.join(path.dirname(mediaPath), 'thumbs'),
      base: path.basename(mediaPath, path.extname(mediaPath)),
    },
  };
}

async function resolveReel(projectId: string): Promise<ResolvedThumbnail> {
  if (!UUID_RE.test(projectId)) return { ok: false, reason: 'not_found' };
  const rows = (await db.query(`SELECT thumbnail_path FROM subtitler_projects WHERE id = $1`, [
    projectId,
  ])) as Array<{ thumbnail_path: string | null }>;
  const relative = rows[0]?.thumbnail_path;
  if (!relative) return { ok: false, reason: 'not_found' };

  // ffmpeg writes the poster as JPEG (ProjectService.generateThumbnail).
  return {
    ok: true,
    sourcePath: getSubtitlerProjectService().getThumbnailPath(relative),
    contentType: 'image/jpeg',
  };
}

async function resolveCanvas(canvasId: string): Promise<ResolvedThumbnail> {
  if (!UUID_RE.test(canvasId)) return { ok: false, reason: 'not_found' };
  const rows = (await db.query(
    `SELECT thumbnail_url FROM canvas_documents WHERE document_id = $1`,
    [canvasId]
  )) as Array<{ thumbnail_url: string | null }>;
  const url = rows[0]?.thumbnail_url;
  if (!url) return { ok: false, reason: 'not_found' };

  // Canvas thumbnails are stored as media-library uploads, so a canvas resolves
  // by delegating to its media row. Storing the id instead of parsing this URL
  // is the follow-up; parsing keeps this change server-only.
  const token = shareTokenFromDownloadUrl(url);
  if (!token || !isSafeThumbnailId(token)) return { ok: false, reason: 'not_found' };
  return resolveMedia(token);
}

export async function resolveThumbnailSource(
  kind: ThumbnailKind,
  id: string
): Promise<ResolvedThumbnail> {
  if (!isSafeThumbnailId(id)) return { ok: false, reason: 'not_found' };
  switch (kind) {
    case 'media':
      return resolveMedia(id);
    case 'reel':
      return resolveReel(id);
    case 'canvas':
      return resolveCanvas(id);
  }
}
