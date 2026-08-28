import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { type ShareMediaType, type ShareStatus } from '@gruenerator/contracts';
import {
  MEDIA_LIBRARY_ITEM_LIMIT,
  MEDIA_LIBRARY_WARN_RATIO,
  NON_LIBRARY_UPLOAD_SOURCES,
  QUOTA_GATED_UPLOAD_SOURCES,
} from '@gruenerator/shared/media-library/constants';
import { stripDataUrlPrefix } from '@gruenerator/shared/utils';
import { encode as encodeBlurhash } from 'blurhash';
import sharp from 'sharp';

import { type PostgresService, getPostgresInstance } from '../database/services/PostgresService.js';
import { likeContainsPattern } from '../utils/sqlLike.js';

import {
  LIBRARY_ITEM_CLAUSE,
  ORPHANED_SHARE_STATUSES,
  USER_SHARES_MAX_LIMIT,
  USER_VISIBLE_SHARE_STATUSES,
  assetPoolWhere,
  creationFeedWhere,
} from './sharedMediaFilters.js';
import { deriveContentOrigin } from './sharedMediaOrigin.js';

import type {
  SharedMediaRow,
  CreateVideoShareParams,
  CreatePendingVideoShareParams,
  CreateImageShareParams,
  UpdateImageShareParams,
  UploadMediaFileParams,
  UpdateMediaMetadataParams,
  MediaLibraryFiltersInternal,
  ShareResult,
  MediaLibraryResult,
  MetadataUpdateResult,
  ImageInfo,
  EnrichedImageMetadata,
  MimeToExtensionMap,
} from '../types/media.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SHARED_MEDIA_PATH = path.join(__dirname, '../uploads/shared-media');
const SHARED_MEDIA_PATH_RESOLVED = path.resolve(SHARED_MEDIA_PATH);
const THUMBNAIL_SIZE = 400;

/** One row removed by {@link SharedMediaService.reapOrphanedShares}. */
export interface ReapedShare {
  shareToken: string;
  status: string;
  /** `file_size` at deletion time, `0` when the row never got one (a render that
   * never produced a file). Only an estimate of the bytes freed — variants and
   * thumbnails in the same directory are not counted in that column. */
  fileSize: number;
}

/** Snapshot of how full one account's Mediathek is. */
export interface MediaLibraryUsage {
  count: number;
  limit: number;
  isFull: boolean;
  isNearlyFull: boolean;
}

/**
 * Thrown by `uploadMediaFile` when the account is at
 * `MEDIA_LIBRARY_ITEM_LIMIT`. Nothing has been written when this surfaces —
 * neither a row nor a file. Callers turn it into an HTTP 409 so the user is
 * told to free space instead of silently losing their oldest media.
 */
export class MediaQuotaExceededError extends Error {
  readonly code = 'media_quota_exceeded' as const;

  /**
   * The sentence the user reads. Authored here rather than taken from
   * `.message` at the route, so it is visibly not the raw text of some thrown
   * tooling error (which must never reach a response body).
   */
  readonly userMessage: string;

  constructor(readonly usage: MediaLibraryUsage) {
    const userMessage =
      `Deine Mediathek ist voll (${usage.count} von ${usage.limit} Medien). ` +
      'Lösche nicht mehr benötigte Medien, um wieder hochladen zu können.';
    super(userMessage);
    this.name = 'MediaQuotaExceededError';
    this.userMessage = userMessage;
  }
}

// Responsive grid-thumbnail widths pre-generated at upload. Must stay in sync
// with the widths the frontend requests (`buildSharedMediaSrcSet`) and the
// on-demand fallback in shareFileRouter's `/preview` handler.
const VARIANT_WIDTHS = [200, 400, 800] as const;

/**
 * Result of pre-generating responsive thumbnails + a BlurHash for an image.
 */
export interface MediaVariantResult {
  thumbnailPath: string | null; // relative `${shareToken}/thumbnail.jpg`
  blurhash: string | null;
  width: number;
  height: number;
  variants: number[]; // widths actually generated (<= source width)
}

function getSafeShareDir(shareToken: string): string {
  const safeToken = path.basename(shareToken);
  const shareDir = path.join(SHARED_MEDIA_PATH, safeToken);
  const resolvedDir = path.resolve(shareDir);
  if (!resolvedDir.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
    throw new Error('Invalid share token: path traversal detected');
  }
  return shareDir;
}

/**
 * Generate everything the responsive image standard needs from a source image,
 * in one pass with sharp:
 *  - WebP + AVIF variants at {@link VARIANT_WIDTHS} into `<shareDir>/thumbs/`,
 *    named `<base>_w<width>.<fmt>` to match shareFileRouter's `/preview` reader.
 *  - A 400px `thumbnail.jpg` (legacy thumbnail endpoint + poster fallback).
 *  - A compact BlurHash string for an instant placeholder.
 *  - Intrinsic width/height.
 *
 * Only downscales — widths larger than the source are skipped (never upscale).
 * Throws if the source can't be decoded; callers mark the row `failed`.
 */
async function generateMediaVariants(
  shareToken: string,
  sourcePath: string
): Promise<MediaVariantResult> {
  const shareDir = getSafeShareDir(shareToken);
  const thumbsDir = path.join(shareDir, 'thumbs');
  const base = path.basename(sourcePath, path.extname(sourcePath)); // e.g. "media"

  // `failOn: 'none'` keeps slightly-truncated uploads decodable instead of throwing.
  const pipeline = sharp(sourcePath, { failOn: 'none' });
  const meta = await pipeline.metadata();
  const srcWidth = meta.width ?? 0;
  const srcHeight = meta.height ?? 0;
  if (!srcWidth || !srcHeight) {
    throw new Error('generateMediaVariants: could not read image dimensions');
  }

  await fs.mkdir(thumbsDir, { recursive: true });

  // Responsive WebP + AVIF variants (downscale only).
  const widths: number[] = VARIANT_WIDTHS.filter((w) => w <= srcWidth);
  if (widths.length === 0) widths.push(srcWidth); // tiny source: emit one at native width
  const generated: number[] = [];
  for (const width of widths) {
    const resized = sharp(sourcePath, { failOn: 'none' }).resize({
      width,
      withoutEnlargement: true,
    });
    await Promise.all([
      resized
        .clone()
        .webp({ quality: 78 })
        .toFile(path.join(thumbsDir, `${base}_w${width}.webp`)),
      resized
        .clone()
        .avif({ quality: 60 })
        .toFile(path.join(thumbsDir, `${base}_w${width}.avif`)),
    ]);
    generated.push(width);
  }

  // Legacy 400px JPEG thumbnail (kept for `/thumbnail` + video-poster fallbacks).
  let thumbnailPath: string | null = null;
  try {
    await sharp(sourcePath, { failOn: 'none' })
      .resize({
        width: THUMBNAIL_SIZE,
        height: THUMBNAIL_SIZE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .jpeg({ quality: 80 })
      .toFile(path.join(shareDir, 'thumbnail.jpg'));
    thumbnailPath = `${shareToken}/thumbnail.jpg`;
  } catch (err) {
    console.warn('[SharedMediaService] thumbnail.jpg generation failed:', err);
  }

  // BlurHash from a tiny raw-RGBA downscale.
  let blurhash: string | null = null;
  try {
    const { data, info } = await sharp(sourcePath, { failOn: 'none' })
      .raw()
      .ensureAlpha()
      .resize(32, 32, { fit: 'inside' })
      .toBuffer({ resolveWithObject: true });
    blurhash = encodeBlurhash(new Uint8ClampedArray(data), info.width, info.height, 4, 3);
  } catch (err) {
    console.warn('[SharedMediaService] BlurHash encode failed:', err);
  }

  return { thumbnailPath, blurhash, width: srcWidth, height: srcHeight, variants: generated };
}

class SharedMediaService {
  private postgres: PostgresService | null = null;
  private initPromise: Promise<void> | null = null;

  async init(): Promise<void> {
    if (this.initPromise === null) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();
      await fs.mkdir(SHARED_MEDIA_PATH, { recursive: true });
      this.postgres = postgres; // Only set AFTER successful init
      console.log('[SharedMediaService] Initialized successfully');
    } catch (error) {
      console.error('[SharedMediaService] Initialization failed:', error);
      this.initPromise = null; // Reset so subsequent calls can retry
      throw error;
    }
  }

  async ensureInitialized(): Promise<void> {
    if (!this.postgres) {
      await this.init();
    }
  }

  generateShareToken(): string {
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Background worker: pre-generate responsive variants + BlurHash for an image
   * and merge the results into its row. Fire-and-forget from the create/upload
   * paths (the row is already usable as `ready`; the `/preview` on-demand
   * fallback covers the brief window before this finishes). Never throws.
   */
  private async processMediaVariants(shareToken: string, sourcePath: string): Promise<void> {
    try {
      const result = await generateMediaVariants(shareToken, sourcePath);
      await this.ensureInitialized();
      await this.postgres!.query(
        `UPDATE shared_media
           SET thumbnail_path = COALESCE($2, thumbnail_path),
               image_metadata = COALESCE(image_metadata, '{}'::jsonb) || $3::jsonb
         WHERE share_token = $1`,
        [
          shareToken,
          result.thumbnailPath,
          JSON.stringify({
            blurhash: result.blurhash,
            width: result.width,
            height: result.height,
            variants: result.variants,
          }),
        ]
      );
    } catch (err) {
      console.error(`[SharedMediaService] Variant generation failed for ${shareToken}:`, err);
    }
  }

  /**
   * Public entry point for the backfill script: (re)generate variants + BlurHash
   * for an existing image share. Resolves the source from the stored file_path.
   * Awaits completion (unlike the fire-and-forget upload path) so backfill can
   * report progress. Returns false when the source file is missing/unreadable.
   */
  async regenerateMediaVariants(shareToken: string, relativeFilePath: string): Promise<boolean> {
    const sourcePath = this.getMediaFilePath(relativeFilePath);
    if (!sourcePath) return false;
    try {
      await fs.access(sourcePath);
    } catch {
      return false;
    }
    await this.processMediaVariants(shareToken, sourcePath);
    return true;
  }

  /**
   * How full the user's Mediathek is. Read-only — nothing is ever deleted here.
   *
   * Counts only what the user can actually see and delete, on two axes:
   *
   * - Internal artifacts (canvas/chat thumbnails, template previews —
   *   is_library_item = FALSE) are excluded: they are referenced by
   *   canvas_documents.thumbnail_url and have their own delete-on-replace
   *   lifecycle in updateCanvas.
   * - So are rows outside USER_VISIBLE_SHARE_STATUSES. A video share that
   *   failed to render, or one stuck in 'processing', appears in no listing
   *   (getMediaLibrary is ready-only, the share galleries are ready/draft) and
   *   no UI can remove it. Charging quota for those would be a trap with no way
   *   out: the LRU eviction this replaces was the only thing that ever cleaned
   *   them up, so counting them would let a few failed renders lock an account
   *   out of uploading for good.
   */
  async getLibraryUsage(userId: string): Promise<MediaLibraryUsage> {
    await this.ensureInitialized();

    const countQuery = `SELECT COUNT(*) as count FROM shared_media
                        WHERE user_id = $1
                          AND ${LIBRARY_ITEM_CLAUSE}
                          AND status = ANY($2::text[])`;
    const countResult = await this.postgres!.queryOne<{ count: string }>(countQuery, [
      userId,
      [...USER_VISIBLE_SHARE_STATUSES],
    ]);
    const count = parseInt(countResult?.count ?? '0', 10);

    return {
      count,
      limit: MEDIA_LIBRARY_ITEM_LIMIT,
      isFull: count >= MEDIA_LIBRARY_ITEM_LIMIT,
      isNearlyFull: count >= Math.floor(MEDIA_LIBRARY_ITEM_LIMIT * MEDIA_LIBRARY_WARN_RATIO),
    };
  }

  /**
   * Refuse a new **upload** once the library is full.
   *
   * Only uploads are gated. Creations (sharepics, canvas drafts, template
   * clones) are let through deliberately: canvas autosave writes continuously
   * and a hard failure there would lose the user's work mid-edit. Until this
   * was fixed (#2980), the cap was instead enforced by deleting the oldest
   * rows *and their files* on every write path — so uploading a source image
   * could destroy a sharepic made months earlier, with no warning and nothing
   * to recover from.
   */
  async assertLibraryCapacity(userId: string): Promise<void> {
    const usage = await this.getLibraryUsage(userId);
    if (usage.isFull) {
      throw new MediaQuotaExceededError(usage);
    }
  }

  async cleanupShareFiles(shareToken: string): Promise<void> {
    try {
      const shareDir = getSafeShareDir(shareToken);
      await fs.rm(shareDir, { recursive: true, force: true });
    } catch (error) {
      console.warn(
        '[SharedMediaService] Could not cleanup files for %s:',
        shareToken,
        (error as Error).message
      );
    }
  }

  /**
   * Delete `shared_media` rows stuck in {@link ORPHANED_SHARE_STATUSES} past
   * `olderThanHours`, together with their files on disk.
   *
   * **`file_path IS NULL` is a safety interlock, not an optimisation.** A row in
   * one of these statuses is not supposed to have a file: `finalizeVideoShare`
   * sets `file_path` and `status = 'ready'` in one UPDATE, so a render that got
   * as far as producing bytes is never left `processing`. But `cloneTemplate`
   * also inserts `'processing'`, on a path with no render at all, and
   * `updateImageShare` — which the canvas editor's autosave calls on that very
   * token — writes `file_path` and never touches `status`. A cloned template
   * that someone edited and saved without explicitly publishing therefore sits
   * at `'processing'` holding a finished sharepic. Without this clause the
   * reaper would delete it, files and all, a day after the clone. A file-bearing
   * row in a dead status is a contradiction, and the safe reading of a
   * contradiction is to leave it alone; `countFileBearingOrphans` reports how
   * many were skipped so the situation stays visible.
   *
   * These rows are unreachable from every user-facing surface: `getMediaLibrary`
   * is ready-only, the galleries are `USER_VISIBLE_SHARE_STATUSES`, and the
   * public share page can only report "failed" to whoever already holds the
   * link. Nothing offered a delete button, and since #2980 removed the LRU
   * eviction that used to sweep them along with everything else, nothing removed
   * them at all — the row and its directory under `uploads/shared-media/<token>/`
   * stayed forever (#2989).
   *
   * The DELETE is the easy half; the bytes are the point. Files go through
   * {@link cleanupShareFiles} per token, after the row is gone rather than
   * before: if the process dies in between, the directory is left with no row
   * behind it and `cleanOrphanedSharedMedia` in the uploads cleaner — which
   * deletes exactly that — picks it up on the next cycle. The other order would
   * strand a row pointing at files that are no longer there.
   *
   * Returns what it removed so the caller can log it; an empty array means
   * there was nothing to do.
   */
  async reapOrphanedShares(olderThanHours: number): Promise<ReapedShare[]> {
    await this.ensureInitialized();

    // `make_interval` rather than string concatenation: the age is a number, and
    // `$2 || ' hours'` would need a cast on every call site to typecheck in PG.
    const rows = await this.postgres!.query<{
      share_token: string;
      status: string;
      file_size: string | number | null;
    }>(
      `DELETE FROM shared_media
        WHERE status = ANY($1::text[])
          AND file_path IS NULL
          AND created_at < NOW() - make_interval(hours => $2::int)
        RETURNING share_token, status, file_size`,
      [[...ORPHANED_SHARE_STATUSES], Math.max(0, Math.trunc(olderThanHours))]
    );

    const reaped: ReapedShare[] = [];
    for (const row of rows) {
      await this.cleanupShareFiles(row.share_token);
      reaped.push({
        shareToken: row.share_token,
        status: row.status,
        fileSize: Number(row.file_size ?? 0),
      });
    }

    if (reaped.length > 0) {
      console.log(
        `[SharedMediaService] Reaped ${reaped.length} orphaned share(s) older than ${olderThanHours}h`
      );
    }

    return reaped;
  }

  /**
   * How many rows the `file_path IS NULL` interlock in {@link reapOrphanedShares}
   * is holding back — rows in a dead status that nonetheless carry a file.
   *
   * Read-only. Every one of these is a real sharepic wearing the wrong status
   * (see the interlock's rationale), so the number is a bug counter, not a
   * cleanup backlog: it should be reported, and it must never be reaped.
   */
  async countFileBearingOrphans(): Promise<number> {
    await this.ensureInitialized();

    const result = await this.postgres!.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM shared_media
        WHERE status = ANY($1::text[])
          AND file_path IS NOT NULL`,
      [[...ORPHANED_SHARE_STATUSES]]
    );
    return parseInt(result?.count ?? '0', 10);
  }

  async createVideoShare(userId: string, params: CreateVideoShareParams): Promise<ShareResult> {
    await this.ensureInitialized();

    const { videoPath, title, thumbnailPath, duration, projectId } = params;
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

    try {
      await fs.mkdir(shareDir, { recursive: true });

      const targetVideoPath = path.join(shareDir, 'media.mp4');
      await fs.copyFile(videoPath, targetVideoPath);

      const stats = await fs.stat(targetVideoPath);
      const videoFilename = path.basename(videoPath);
      const relativeVideoPath = `${shareToken}/media.mp4`;

      let relativeThumbnailPath: string | null = null;
      if (thumbnailPath) {
        try {
          await fs.access(thumbnailPath);
          const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
          await fs.copyFile(thumbnailPath, targetThumbnailPath);
          relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
        } catch {
          console.log('[SharedMediaService] No thumbnail to copy');
        }
      }

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, duration, project_id, status)
                VALUES ($1, $2, 'video', $3, $4, $5, $6, $7, 'video/mp4', $8, $9, 'ready')
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Video',
        relativeVideoPath,
        videoFilename,
        relativeThumbnailPath,
        stats.size,
        duration || null,
        projectId || null,
      ]);

      console.log(`[SharedMediaService] Created video share ${shareToken} for user ${userId}`);

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'video',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create video share:', error);
      throw new Error(`Failed to create video share: ${(error as Error).message}`);
    }
  }

  async createImageShare(userId: string, params: CreateImageShareParams): Promise<ShareResult> {
    await this.ensureInitialized();

    const {
      imageBase64,
      title,
      imageType,
      contentOrigin,
      metadata = {},
      originalImage = null,
      status = 'ready',
    } = params;
    // Declared by callers that know their own flow; derived only for clients too
    // old to send it (mobile updates by OTA and can lag a deploy).
    const origin = contentOrigin ?? deriveContentOrigin(imageType, metadata);
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

    if (!/^data:image\/\w+;base64,/.test(imageBase64)) {
      throw new Error(
        `createImageShare: imageBase64 must be a "data:image/...;base64,..." string (got ${imageBase64.slice(0, 32)}...)`
      );
    }

    try {
      await fs.mkdir(shareDir, { recursive: true });

      const base64Data = stripDataUrlPrefix(imageBase64);
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const isPng =
        imageBuffer.length >= 8 &&
        imageBuffer[0] === 0x89 &&
        imageBuffer[1] === 0x50 &&
        imageBuffer[2] === 0x4e &&
        imageBuffer[3] === 0x47;
      const isJpeg =
        imageBuffer.length >= 3 &&
        imageBuffer[0] === 0xff &&
        imageBuffer[1] === 0xd8 &&
        imageBuffer[2] === 0xff;
      if (!isPng && !isJpeg) {
        throw new Error(
          `createImageShare: decoded payload is not a valid PNG or JPEG (decoded size: ${imageBuffer.length} bytes)`
        );
      }

      const mimeType = isJpeg ? 'image/jpeg' : 'image/png';
      const extension = isJpeg ? 'jpg' : 'png';

      const targetImagePath = path.join(shareDir, `media.${extension}`);
      await fs.writeFile(targetImagePath, imageBuffer);

      let originalImageFilename: string | null = null;
      if (originalImage) {
        const origBase64Data = stripDataUrlPrefix(originalImage);
        const origBuffer = Buffer.from(origBase64Data, 'base64');
        const origMimeType = originalImage.startsWith('data:image/jpeg')
          ? 'image/jpeg'
          : 'image/png';
        const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
        originalImageFilename = `original.${origExtension}`;
        const targetOriginalPath = path.join(shareDir, originalImageFilename);
        await fs.writeFile(targetOriginalPath, origBuffer);
      }

      // Intrinsic dimensions are cheap to read; the heavy thumbnail/variant +
      // BlurHash work runs in the background (see processMediaVariants) so the
      // share is created without blocking on AVIF encoding.
      let imageInfo: ImageInfo = { width: 0, height: 0 };
      try {
        const m = await sharp(targetImagePath, { failOn: 'none' }).metadata();
        imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
      } catch (metaError) {
        console.warn('[SharedMediaService] Could not read image dimensions:', metaError);
      }

      const relativeImagePath = `${shareToken}/media.${extension}`;

      const enrichedMetadata: EnrichedImageMetadata = {
        ...metadata,
        width: imageInfo.width,
        height: imageInfo.height,
        hasOriginalImage: !!originalImage,
        originalImageFilename: originalImageFilename,
        generatedAt: new Date().toISOString(),
      };

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, image_type, image_metadata, status, content_origin)
                VALUES ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Bild',
        relativeImagePath,
        `media.${extension}`,
        null, // thumbnail_path filled by processMediaVariants
        imageBuffer.length,
        mimeType,
        imageType || null,
        JSON.stringify(enrichedMetadata),
        status,
        origin,
      ]);

      // Fire-and-forget: responsive variants + BlurHash, then merge into the row.
      void this.processMediaVariants(shareToken, targetImagePath);

      console.log(
        `[SharedMediaService] Created image share ${shareToken} for user ${userId}${originalImage ? ' (with original)' : ''}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'image',
        hasOriginalImage: !!originalImage,
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create image share:', error);
      throw new Error(`Failed to create image share: ${(error as Error).message}`);
    }
  }

  async createPendingVideoShare(
    userId: string,
    params: CreatePendingVideoShareParams
  ): Promise<ShareResult> {
    await this.ensureInitialized();

    const { title, thumbnailPath, duration, projectId } = params;
    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

    try {
      await fs.mkdir(shareDir, { recursive: true });

      let relativeThumbnailPath: string | null = null;
      if (thumbnailPath) {
        try {
          await fs.access(thumbnailPath);
          const targetThumbnailPath = path.join(shareDir, 'thumbnail.jpg');
          await fs.copyFile(thumbnailPath, targetThumbnailPath);
          relativeThumbnailPath = `${shareToken}/thumbnail.jpg`;
        } catch {
          console.log('[SharedMediaService] No thumbnail to copy for pending share');
        }
      }

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 mime_type, duration, project_id, status)
                VALUES ($1, $2, 'video', $3, NULL, NULL, $4, 'video/mp4', $5, $6, 'processing')
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        title || 'Geteiltes Video',
        relativeThumbnailPath,
        duration || null,
        projectId || null,
      ]);

      console.log(
        `[SharedMediaService] Created pending video share ${shareToken} for user ${userId}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: 'video',
        status: 'processing',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to create pending video share:', error);
      throw new Error(`Failed to create pending video share: ${(error as Error).message}`);
    }
  }

  async finalizeVideoShare(shareToken: string, videoPath: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const shareDir = getSafeShareDir(shareToken);
      const targetVideoPath = path.join(shareDir, 'media.mp4');
      await fs.copyFile(videoPath, targetVideoPath);

      const stats = await fs.stat(targetVideoPath);

      const query = `
                UPDATE shared_media
                SET file_path = $1, file_name = 'media.mp4', file_size = $2, status = 'ready'
                WHERE share_token = $3
            `;
      await this.postgres!.query(query, [`${shareToken}/media.mp4`, stats.size, shareToken]);

      console.log(`[SharedMediaService] Finalized video share ${shareToken}`);
    } catch (error) {
      console.error('[SharedMediaService] Failed to finalize video share:', error);
      throw new Error(`Failed to finalize video share: ${(error as Error).message}`);
    }
  }

  async markShareFailed(shareToken: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const query = `UPDATE shared_media SET status = 'failed' WHERE share_token = $1`;
      await this.postgres!.query(query, [shareToken]);
      console.log(`[SharedMediaService] Marked share ${shareToken} as failed`);
    } catch (error) {
      console.error('[SharedMediaService] Failed to mark share as failed:', error);
    }
  }

  async getShareByToken(shareToken: string): Promise<SharedMediaRow | null> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT sm.id, sm.user_id, sm.share_token, sm.media_type, sm.title,
                       sm.file_path, sm.file_name, sm.thumbnail_path, sm.file_size, sm.mime_type,
                       sm.duration, sm.project_id, sm.image_type, sm.image_metadata,
                       sm.status, sm.download_count, sm.view_count, sm.created_at,
                       sm.wolke_share_link_id, sm.wolke_file_path,
                       sm.expires_at, sm.password_hash, sm.transfer_files, sm.transfer_message,
                       COALESCE(p.first_name, p.display_name, 'Jemand') as sharer_name
                FROM shared_media sm
                LEFT JOIN profiles p ON sm.user_id = p.id
                WHERE sm.share_token = $1
            `;

      const result = await this.postgres!.queryOne<SharedMediaRow>(query, [shareToken]);

      if (!result) {
        return null;
      }

      return result;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get share:', error);
      throw new Error(`Failed to get share: ${(error as Error).message}`);
    }
  }

  async getUserShares(
    userId: string,
    mediaType: ShareMediaType | null = null,
    status: ShareStatus | readonly ShareStatus[] | null = null,
    limit: number = USER_SHARES_MAX_LIMIT
  ): Promise<SharedMediaRow[]> {
    await this.ensureInitialized();

    try {
      // Every caller of this method is a creation feed — the workplace "Zuletzt"
      // strip, the Studio galleries, the share endpoints, the chat media list —
      // so both provenance filters come from `creationFeedWhere`, not from a
      // WHERE clause written out here. The Mediathek asks a different question
      // and goes through `getMediaLibrary`.
      const params: unknown[] = [userId];
      let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       duration, image_type, image_metadata, status, download_count, created_at,
                       content_origin
                FROM shared_media
                WHERE user_id = $1
                  AND ${creationFeedWhere(params, status)}
            `;

      if (mediaType) {
        params.push(mediaType);
        query += ` AND media_type = $${params.length}`;
      }

      params.push(Math.min(Math.max(1, Math.trunc(limit)), USER_SHARES_MAX_LIMIT));
      query += ` ORDER BY created_at DESC LIMIT $${params.length}`;

      const results = await this.postgres!.query<SharedMediaRow>(query, params);
      return results;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get user shares:', error);
      throw new Error(`Failed to get user shares: ${(error as Error).message}`);
    }
  }

  async recordDownload(
    shareToken: string,
    email: string | null,
    ipAddress: string,
    shareId?: string
  ): Promise<boolean> {
    await this.ensureInitialized();

    try {
      let id = shareId;
      if (!id) {
        const share = await this.getShareByToken(shareToken);
        if (!share) {
          throw new Error('Share not found');
        }
        id = share.id;
      }

      const insertQuery = `
                INSERT INTO shared_media_downloads (shared_media_id, downloader_email, ip_address)
                VALUES ($1, $2, $3)
            `;
      await this.postgres!.query(insertQuery, [id, email, ipAddress]);

      const updateQuery = `
                UPDATE shared_media
                SET download_count = download_count + 1
                WHERE id = $1
            `;
      await this.postgres!.query(updateQuery, [id]);

      console.log(`[SharedMediaService] Recorded download for ${shareToken} by ${email}`);

      return true;
    } catch (error) {
      console.error('[SharedMediaService] Failed to record download:', error);
      throw new Error(`Failed to record download: ${(error as Error).message}`);
    }
  }

  async recordView(shareToken: string): Promise<void> {
    await this.ensureInitialized();

    try {
      const query = `
                UPDATE shared_media
                SET view_count = view_count + 1
                WHERE share_token = $1
            `;
      await this.postgres!.query(query, [shareToken]);
    } catch (error) {
      console.warn('[SharedMediaService] Failed to record view:', (error as Error).message);
    }
  }

  async deleteShare(userId: string, shareToken: string): Promise<boolean> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, file_path, thumbnail_path
                FROM shared_media
                WHERE share_token = $1 AND user_id = $2
            `;
      const share = await this.postgres!.queryOne<{
        id: string;
        file_path: string;
        thumbnail_path: string;
      }>(query, [shareToken, userId]);

      if (!share) {
        throw new Error('Share not found or not owned by user');
      }

      const deleteQuery = `DELETE FROM shared_media WHERE id = $1`;
      await this.postgres!.query(deleteQuery, [share.id]);

      await this.cleanupShareFiles(shareToken);

      console.log(`[SharedMediaService] Deleted share ${shareToken}`);

      return true;
    } catch (error) {
      console.error('[SharedMediaService] Failed to delete share:', error);
      throw new Error(`Failed to delete share: ${(error as Error).message}`);
    }
  }

  /** Rename a share (title only), owner-scoped. No file work — unlike the
   * PUT /image path this doesn't re-render, so a sharepic can be retitled
   * cheaply. Throws when the share isn't found or isn't owned by the user. */
  async renameShare(userId: string, shareToken: string, title: string): Promise<boolean> {
    await this.ensureInitialized();
    const rows = await this.postgres!.query(
      'UPDATE shared_media SET title = $1 WHERE share_token = $2 AND user_id = $3 RETURNING id',
      [title, shareToken, userId]
    );
    if (!rows || (rows as unknown[]).length === 0) {
      throw new Error('Share not found or not owned by user');
    }
    return true;
  }

  getMediaFilePath(relativePath: string | null): string | null {
    if (!relativePath) return null;
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(SHARED_MEDIA_PATH, safePath);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  getThumbnailFilePath(relativePath: string | null): string | null {
    if (!relativePath) return null;
    const safePath = path.normalize(relativePath).replace(/^(\.\.(\/|\\|$))+/, '');
    const fullPath = path.join(SHARED_MEDIA_PATH, safePath);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  getOriginalImagePath(shareToken: string, filename: string): string | null {
    if (!shareToken || !filename) return null;
    const safeToken = path.basename(shareToken);
    const safeFilename = path.basename(filename);
    const fullPath = path.join(SHARED_MEDIA_PATH, safeToken, safeFilename);
    const resolvedPath = path.resolve(fullPath);
    if (!resolvedPath.startsWith(SHARED_MEDIA_PATH_RESOLVED + path.sep)) {
      return null;
    }
    return fullPath;
  }

  // Clears stale `hasOriginalImage` / `originalImageFilename` flags when the
  // backing file is gone. Prevents the gallery from repeatedly trying to load
  // an original that no longer exists. Safe to call when the keys aren't set.
  async clearOriginalImageMetadata(shareToken: string): Promise<void> {
    await this.ensureInitialized();
    const query = `
      UPDATE shared_media
      SET image_metadata = (
        COALESCE(image_metadata, '{}'::jsonb)
        - 'originalImageFilename'
      ) || '{"hasOriginalImage": false}'::jsonb
      WHERE share_token = $1
    `;
    await this.postgres!.query(query, [shareToken]);
  }

  async getMediaLibrary(
    userId: string,
    filters: Partial<MediaLibraryFiltersInternal> = {}
  ): Promise<MediaLibraryResult> {
    await this.ensureInitialized();

    const { type = 'all', search = null, limit = 50, offset = 0, sort = 'newest' } = filters;

    try {
      let query = `
                SELECT id, share_token, media_type, title, thumbnail_path, file_size,
                       mime_type, duration, image_type, image_metadata, status,
                       download_count, view_count, created_at, alt_text, upload_source,
                       original_filename, content_origin
                FROM shared_media
                WHERE user_id = $1
                  AND ${assetPoolWhere()}
            `;
      const params: unknown[] = [userId];
      let paramIndex = 2;

      if (type && type !== 'all') {
        query += ` AND media_type = $${paramIndex}`;
        params.push(type);
        paramIndex++;
      }

      if (search) {
        query += ` AND (title ILIKE $${paramIndex} OR alt_text ILIKE $${paramIndex})`;
        params.push(likeContainsPattern(search));
        paramIndex++;
      }

      query += sort === 'oldest' ? ` ORDER BY created_at ASC` : ` ORDER BY created_at DESC`;

      query += ` LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`;
      params.push(limit, offset);

      const results = await this.postgres!.query<SharedMediaRow>(query, params);

      // Same predicate as the page query above, by construction — a COUNT that
      // drifts from its list promises rows the paginator never hands out.
      const countQuery = `
                SELECT COUNT(*) as total
                FROM shared_media
                WHERE user_id = $1
                  AND ${assetPoolWhere()}
                  ${type && type !== 'all' ? 'AND media_type = $2' : ''}
            `;
      const countParams = type && type !== 'all' ? [userId, type] : [userId];
      const countResult = await this.postgres!.queryOne<{ total: string }>(countQuery, countParams);

      return {
        items: results,
        total: parseInt(countResult?.total ?? '0', 10),
        limit,
        offset,
      };
    } catch (error) {
      console.error('[SharedMediaService] Failed to get media library:', error);
      throw new Error(`Failed to get media library: ${(error as Error).message}`);
    }
  }

  async getMediaById(userId: string, mediaId: string): Promise<SharedMediaRow | null> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT id, share_token, media_type, title, file_path, file_name,
                       thumbnail_path, file_size, mime_type, duration, image_type,
                       image_metadata, status, download_count, view_count, created_at,
                       alt_text, upload_source, original_filename, content_origin
                FROM shared_media
                WHERE id = $1 AND user_id = $2
            `;
      const result = await this.postgres!.queryOne<SharedMediaRow>(query, [mediaId, userId]);
      return result;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get media by id:', error);
      throw new Error(`Failed to get media: ${(error as Error).message}`);
    }
  }

  async updateMediaMetadata(
    userId: string,
    mediaId: string,
    params: UpdateMediaMetadataParams
  ): Promise<MetadataUpdateResult> {
    await this.ensureInitialized();

    const { title, altText } = params;

    try {
      const updates: string[] = [];
      const queryParams: unknown[] = [];
      let paramIndex = 1;

      if (title !== undefined) {
        updates.push(`title = $${paramIndex}`);
        queryParams.push(title);
        paramIndex++;
      }

      if (altText !== undefined) {
        updates.push(`alt_text = $${paramIndex}`);
        queryParams.push(altText);
        paramIndex++;
      }

      if (updates.length === 0) {
        throw new Error('No fields to update');
      }

      queryParams.push(mediaId, userId);

      const query = `
                UPDATE shared_media
                SET ${updates.join(', ')}
                WHERE id = $${paramIndex} AND user_id = $${paramIndex + 1}
                RETURNING id, share_token, title, alt_text
            `;

      const result = await this.postgres!.queryOne<MetadataUpdateResult>(query, queryParams);

      if (!result) {
        throw new Error('Media not found or not owned by user');
      }

      console.log(`[SharedMediaService] Updated media metadata for ${result.share_token}`);
      return result;
    } catch (error) {
      console.error('[SharedMediaService] Failed to update media metadata:', error);
      throw new Error(`Failed to update media: ${(error as Error).message}`);
    }
  }

  async uploadMediaFile(userId: string, params: UploadMediaFileParams): Promise<ShareResult> {
    await this.ensureInitialized();

    const {
      fileBuffer,
      originalFilename,
      mimeType,
      title,
      altText,
      uploadSource = 'upload',
    } = params;

    // Non-library sources (gallery thumbnails, canvas-element tool output) are
    // internal artifacts — keep them out of the Mediathek (getMediaLibrary
    // filters on is_library_item) and out of the quota.
    const isLibraryItem = !(NON_LIBRARY_UPLOAD_SOURCES as readonly string[]).includes(uploadSource);

    // Only a deliberate "put this file in my Mediathek" is refused. Uploads
    // that are a substep of making something (canvas-mint's background photo,
    // an asset dropped mid-edit) are creations wearing an upload's clothes, and
    // failing them mid-flow is the harm this whole change set out to remove.
    // Checked before the directory is created, so a refused upload leaves
    // neither a row nor a stray file behind. Throws MediaQuotaExceededError.
    if ((QUOTA_GATED_UPLOAD_SOURCES as readonly string[]).includes(uploadSource)) {
      await this.assertLibraryCapacity(userId);
    }

    const shareToken = this.generateShareToken();
    const shareDir = getSafeShareDir(shareToken);

    try {
      await fs.mkdir(shareDir, { recursive: true });

      const isImage = mimeType.startsWith('image/');
      const isVideo = mimeType.startsWith('video/');

      if (!isImage && !isVideo) {
        throw new Error('Unsupported file type. Only images and videos are allowed.');
      }

      const extension = this.getExtensionFromMime(mimeType);
      const targetPath = path.join(shareDir, `media.${extension}`);
      await fs.writeFile(targetPath, fileBuffer);

      const relativeFilePath = `${shareToken}/media.${extension}`;
      let imageInfo: ImageInfo | null = null;

      if (isImage) {
        // Cheap dimension read; thumbnail/variants/BlurHash run in the background.
        try {
          const m = await sharp(targetPath, { failOn: 'none' }).metadata();
          imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
        } catch (metaError) {
          console.warn('[SharedMediaService] Could not read upload dimensions:', metaError);
        }
      }

      // Everything arriving here is a source image, not a finished creation —
      // including the canvas editor's background/asset uploads. `ai_generated` is
      // the one source that would say otherwise; no caller assigns it today, but
      // handling it means a future one gets the right bucket for free.
      const contentOrigin = uploadSource === 'ai_generated' ? 'ki' : 'upload';

      const query = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, title, file_path, file_name, thumbnail_path,
                 file_size, mime_type, status, is_library_item, alt_text, upload_source, original_filename,
                 image_metadata, content_origin)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'ready', $10, $11, $12, $13, $14, $15)
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(query, [
        userId,
        shareToken,
        isImage ? 'image' : 'video',
        title || originalFilename || 'Uploaded media',
        relativeFilePath,
        `media.${extension}`,
        null, // thumbnail_path filled by processMediaVariants
        fileBuffer.length,
        mimeType,
        isLibraryItem,
        altText || null,
        uploadSource,
        originalFilename,
        imageInfo ? JSON.stringify(imageInfo) : null,
        contentOrigin,
      ]);

      if (isImage) {
        void this.processMediaVariants(shareToken, targetPath);
      }

      console.log(`[SharedMediaService] Uploaded media ${shareToken} for user ${userId}`);

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${shareToken}`,
        createdAt: result!.created_at,
        mediaType: isImage ? 'image' : 'video',
      };
    } catch (error) {
      try {
        await fs.rm(shareDir, { recursive: true, force: true });
      } catch {
        /* ignore cleanup errors */
      }
      console.error('[SharedMediaService] Failed to upload media:', error);
      throw new Error(`Failed to upload media: ${(error as Error).message}`);
    }
  }

  getExtensionFromMime(mimeType: string): string {
    const mimeToExt: MimeToExtensionMap = {
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
      'image/gif': 'gif',
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
    };
    return mimeToExt[mimeType] || 'bin';
  }

  async updateImageShare(
    userId: string,
    shareToken: string,
    params: UpdateImageShareParams
  ): Promise<ShareResult> {
    await this.ensureInitialized();

    const { imageBase64, title, metadata = {}, originalImage = null } = params;

    try {
      const existingShare = await this.postgres!.queryOne<{
        id: string;
        file_path: string;
        image_metadata: Record<string, unknown> | null;
      }>(
        'SELECT id, file_path, image_metadata FROM shared_media WHERE share_token = $1 AND user_id = $2',
        [shareToken, userId]
      );

      if (!existingShare) {
        throw new Error('Share not found or not owned by user');
      }

      const shareDir = getSafeShareDir(shareToken);
      await fs.mkdir(shareDir, { recursive: true });

      const base64Data = stripDataUrlPrefix(imageBase64);
      const imageBuffer = Buffer.from(base64Data, 'base64');

      const mimeType = imageBase64.startsWith('data:image/jpeg') ? 'image/jpeg' : 'image/png';
      const extension = mimeType === 'image/jpeg' ? 'jpg' : 'png';

      const targetImagePath = path.join(shareDir, `media.${extension}`);
      await fs.writeFile(targetImagePath, imageBuffer);

      let originalImageFilename: string | null = null;
      const existingMetadata = existingShare.image_metadata || {};

      if (originalImage) {
        const origBase64Data = stripDataUrlPrefix(originalImage);
        const origBuffer = Buffer.from(origBase64Data, 'base64');
        const origMimeType = originalImage.startsWith('data:image/jpeg')
          ? 'image/jpeg'
          : 'image/png';
        const origExtension = origMimeType === 'image/jpeg' ? 'jpg' : 'png';
        originalImageFilename = `original.${origExtension}`;
        const targetOriginalPath = path.join(shareDir, originalImageFilename);
        await fs.writeFile(targetOriginalPath, origBuffer);
      } else {
        originalImageFilename =
          ((existingMetadata as Record<string, unknown>).originalImageFilename as string | null) ||
          null;
      }

      let imageInfo: ImageInfo = { width: 0, height: 0 };
      try {
        const m = await sharp(targetImagePath, { failOn: 'none' }).metadata();
        imageInfo = { width: m.width ?? 0, height: m.height ?? 0 };
      } catch (metaError) {
        console.warn('[SharedMediaService] Could not read updated image dimensions:', metaError);
      }

      // The image changed: drop stale cached variants so the background pass and
      // the `/preview` on-demand path don't serve the previous image.
      await fs.rm(path.join(shareDir, 'thumbs'), { recursive: true, force: true });

      const enrichedMetadata: EnrichedImageMetadata = {
        ...metadata,
        width: imageInfo.width,
        height: imageInfo.height,
        hasOriginalImage: !!originalImageFilename,
        originalImageFilename: originalImageFilename,
        updatedAt: new Date().toISOString(),
      };

      const relativeImagePath = `${shareToken}/media.${extension}`;

      const query = `
                UPDATE shared_media
                SET title = $1, file_path = $2, file_name = $3, file_size = $4,
                    mime_type = $5, image_metadata = $6
                WHERE id = $7
                RETURNING id, share_token
            `;

      await this.postgres!.queryOne(query, [
        title || (existingShare as Record<string, unknown>).title || 'Geteiltes Bild',
        relativeImagePath,
        `media.${extension}`,
        imageBuffer.length,
        mimeType,
        JSON.stringify(enrichedMetadata),
        existingShare.id,
      ]);

      void this.processMediaVariants(shareToken, targetImagePath);

      console.log(`[SharedMediaService] Updated image share ${shareToken}`);

      return {
        id: existingShare.id,
        shareToken: shareToken,
        shareUrl: `/share/${shareToken}`,
        createdAt: new Date(),
        mediaType: 'image',
        hasOriginalImage: !!originalImageFilename,
      };
    } catch (error) {
      console.error('[SharedMediaService] Failed to update image share:', error);
      throw new Error(`Failed to update image share: ${(error as Error).message}`);
    }
  }

  /**
   * Mark existing shared media as a template
   */
  async markAsTemplate(
    userId: string,
    shareToken: string,
    title: string,
    visibility: 'private' | 'unlisted' | 'public',
    creatorName: string
  ): Promise<void> {
    await this.ensureInitialized();

    try {
      // Verify ownership
      const checkQuery = `SELECT user_id FROM shared_media WHERE share_token = $1`;
      const existing = await this.postgres!.queryOne<{ user_id: string }>(checkQuery, [shareToken]);

      if (!existing) {
        throw new Error('Share not found');
      }

      if (existing.user_id !== userId) {
        throw new Error('Not authorized to mark this as template');
      }

      // Mark as template
      const updateQuery = `
                UPDATE shared_media
                SET is_template = TRUE,
                    template_visibility = $1,
                    template_creator_name = $2,
                    title = $3
                WHERE share_token = $4
            `;

      await this.postgres!.query(updateQuery, [visibility, creatorName, title, shareToken]);

      console.log(
        `[SharedMediaService] Marked ${shareToken} as template with visibility: ${visibility}`
      );
    } catch (error) {
      console.error('[SharedMediaService] Failed to mark as template:', error);
      throw error;
    }
  }

  /**
   * Clone a template to user's gallery
   */
  async cloneTemplate(
    shareToken: string,
    userId: string,
    _userDisplayName: string
  ): Promise<ShareResult> {
    await this.ensureInitialized();

    try {
      // 1. Fetch template
      const templateQuery = `
                SELECT id, user_id, media_type, image_type, image_metadata, content_origin,
                       template_visibility, template_creator_name
                FROM shared_media
                WHERE share_token = $1 AND is_template = TRUE
            `;
      const template = await this.postgres!.queryOne<{
        id: string;
        user_id: string;
        media_type: string;
        image_type: string | null;
        image_metadata: Record<string, unknown>;
        content_origin: string;
        template_visibility: string;
        template_creator_name: string | null;
      }>(templateQuery, [shareToken]);

      if (!template) {
        throw new Error('Template not found');
      }

      // 2. Check visibility permissions
      if (template.template_visibility === 'private' && template.user_id !== userId) {
        throw new Error('Template not accessible (private)');
      }

      // 3. Deep copy metadata (all canvas state)
      const clonedMetadata: Record<string, unknown> = template.image_metadata
        ? (JSON.parse(JSON.stringify(template.image_metadata)) as Record<string, unknown>)
        : {};

      // 4. Create new share entry
      const newShareToken = this.generateShareToken();
      const insertQuery = `
                INSERT INTO shared_media
                (user_id, share_token, media_type, image_type, image_metadata, is_template,
                 original_template_id, status, content_origin)
                VALUES ($1, $2, $3, $4, $5, FALSE, $6, 'processing', $7)
                RETURNING id, share_token, created_at
            `;

      const result = await this.postgres!.queryOne<{
        id: string;
        share_token: string;
        created_at: Date;
      }>(insertQuery, [
        userId,
        newShareToken,
        template.media_type,
        template.image_type,
        JSON.stringify(clonedMetadata),
        template.id,
        // A clone is the same kind of artifact as what it was cloned from.
        template.content_origin,
      ]);

      // 5. Increment template use count
      const incrementQuery = `
                UPDATE shared_media
                SET template_use_count = template_use_count + 1
                WHERE share_token = $1
            `;
      await this.postgres!.query(incrementQuery, [shareToken]);

      console.log(
        `[SharedMediaService] Cloned template ${shareToken} to ${newShareToken} for user ${userId}`
      );

      return {
        id: result!.id,
        shareToken: result!.share_token,
        shareUrl: `/share/${result!.share_token}`,
        createdAt: result!.created_at,
        mediaType: template.media_type as 'image' | 'video',
      };
    } catch (error) {
      console.error('[SharedMediaService] Failed to clone template:', error);
      throw error;
    }
  }

  /**
   * Get templates (user's + public)
   */
  async getTemplates(
    userId: string,
    filters?: { type?: string; visibility?: string }
  ): Promise<SharedMediaRow[]> {
    await this.ensureInitialized();

    try {
      let query = `
                SELECT
                    id, user_id, share_token, media_type, title, image_type, image_metadata,
                    thumbnail_path, template_visibility, template_creator_name, template_use_count,
                    created_at
                FROM shared_media
                WHERE is_template = TRUE
                    AND (user_id = $1 OR template_visibility = 'public')
            `;

      const params: unknown[] = [userId];
      let paramIndex = 2;

      if (filters?.type) {
        query += ` AND image_type = $${paramIndex}`;
        params.push(filters.type);
        paramIndex++;
      }

      if (filters?.visibility && filters.visibility !== 'all') {
        query += ` AND template_visibility = $${paramIndex}`;
        params.push(filters.visibility);
        paramIndex++;
      }

      query += ` ORDER BY created_at DESC`;

      const templates = await this.postgres!.query<SharedMediaRow>(query, params);

      console.log(
        `[SharedMediaService] Retrieved ${templates.length} templates for user ${userId}`
      );
      return templates;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get templates:', error);
      throw new Error('Failed to retrieve templates');
    }
  }

  /**
   * Get template by shareToken
   */
  async getTemplateByToken(shareToken: string, requestingUserId?: string): Promise<SharedMediaRow> {
    await this.ensureInitialized();

    try {
      const query = `
                SELECT
                    id, user_id, share_token, media_type, title, image_type, image_metadata,
                    thumbnail_path, template_visibility, template_creator_name, template_use_count,
                    created_at
                FROM shared_media
                WHERE share_token = $1 AND is_template = TRUE
            `;

      const template = await this.postgres!.queryOne<SharedMediaRow>(query, [shareToken]);

      if (!template) {
        throw new Error('Template not found');
      }

      // Check access permissions
      const visibility = template.template_visibility as string;
      if (visibility === 'private' && template.user_id !== requestingUserId) {
        throw new Error('Template not accessible (private)');
      }

      return template;
    } catch (error) {
      console.error('[SharedMediaService] Failed to get template by token:', error);
      throw error;
    }
  }
}

let serviceInstance: SharedMediaService | null = null;

export function getSharedMediaService(): SharedMediaService {
  if (!serviceInstance) {
    serviceInstance = new SharedMediaService();
  }
  return serviceInstance;
}

export default SharedMediaService;
