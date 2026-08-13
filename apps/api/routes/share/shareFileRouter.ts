/**
 * Legacy Express router for /api/share public + file-streaming endpoints.
 *
 * These routes stay on raw Express (not ts-rest): they serve binary streams
 * with range support, do dynamic thumbnail generation, and the download route
 * uses a two-stage handler (public transfer path → requireAuth fallthrough for
 * image/video) that ts-rest can't model.
 *
 *   GET /:shareToken            — public share info (rate-limited)
 *   GET /:shareToken/thumbnail  — thumbnail file
 *   GET /:shareToken/original   — original image (owner only)
 *   GET /:shareToken/stream     — video playback (byte ranges)
 *   GET /:shareToken/preview    — image variants (?w=&fmt=); video for old clients
 *   GET /:shareToken/download   — transfer (public, password) or image/video (auth)
 *
 * New consumers should use the signed `/api/thumbs/media/...` URLs the list
 * endpoints hand out instead of composing preview URLs here: those carry a
 * version segment and can therefore be cached for a year without going stale.
 *
 * Auth-guarded read/management routes live in shareReadContractRouter.ts and
 * the write routes in shareContractRouter.ts.
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

import express, { type Request, type Response, type Router } from 'express';

import { requireAuth } from '../../middleware/authMiddleware.js';
import { getThumbnailVariant } from '../../services/media/thumbnailCache.js';
import { THUMBNAIL_WIDTHS, versionFromShareRow } from '../../services/media/thumbnailUrl.js';
import { transferService } from '../../services/transferService.js';
import { setContentDisposition } from '../../utils/http/contentDisposition.js';
import { createLogger } from '../../utils/logger.js';

import { getSharedMediaService } from './shareServices.js';

import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { SharedMediaRow } from '../../types/media.js';

const fsPromises = fs.promises;
const log = createLogger('share');

/**
 * Freshness for the versionless legacy media URLs (`/preview`, `/thumbnail`).
 *
 * These used to send `public, max-age=31536000, immutable`. That is only honest
 * for a URL that changes when its content does, and these do not: the gallery
 * edit flow (`updateImageShare`) overwrites the bytes under the SAME share
 * token, so every client that had already fetched the image kept showing the
 * pre-edit picture for a year. The server was carefully clearing its own
 * `thumbs/` cache while telling clients never to revalidate.
 *
 * Five minutes of freshness plus an ETag makes the unchanged case a cheap 304
 * and the edited case correct. The year-long cache now lives on the versioned
 * `/api/thumbs/...` URLs, where it is earned.
 */
const PREVIEW_CACHE_CONTROL = 'public, max-age=300, stale-while-revalidate=86400';

interface ShareTokenParams {
  shareToken: string;
  [key: string]: string;
}

/** Request extended with pre-fetched share data passed between middleware handlers */
interface RequestWithShare extends Request<ShareTokenParams> {
  _share?: SharedMediaRow;
}

interface ShareInfoResponse {
  success: boolean;
  share?: {
    mediaType: string;
    title: string | null;
    thumbnailUrl: string | null;
    downloadCount: number;
    viewCount: number;
    sharerName?: string;
    status: string;
    createdAt: Date;
    fileName?: string | null;
    fileSize?: number | null;
    mimeType?: string | null;
    isPasswordProtected?: boolean;
    expiresAt?: Date | null;
    transferMessage?: string | null;
    transferFiles?: Array<{ name: string; size: number; mimeType: string }> | null;
    duration?: number | null;
    imageType?: string | null;
    dimensions?: {
      width?: number | undefined;
      height?: number | undefined;
    };
  };
  error?: string;
}

const router: Router = express.Router();

// Public share info
router.get(
  '/:shareToken',
  async (req: Request<ShareTokenParams>, res: Response<ShareInfoResponse>) => {
    try {
      const { shareToken } = req.params;
      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return res.status(404).json({
          success: false,
          error: 'Geteiltes Medium nicht gefunden',
        });
      }

      await service.recordView(shareToken);

      const shareObj: NonNullable<ShareInfoResponse['share']> = {
        mediaType: share.media_type,
        title: share.title,
        thumbnailUrl: share.thumbnail_path ? `/api/share/${shareToken}/thumbnail` : null,
        downloadCount: share.download_count,
        viewCount: share.view_count,
        status: share.status || 'ready',
        createdAt: share.created_at,
        ...(share.sharer_name != null ? { sharerName: share.sharer_name } : {}),
      };
      const response: ShareInfoResponse = {
        success: true,
        share: shareObj,
      };

      if (share.media_type === 'transfer') {
        // Check expiry for transfers
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
          return res.status(410).json({
            success: false,
            error: 'Dieser Transfer-Link ist abgelaufen.',
          });
        }

        response.share!.fileName = share.file_name;
        response.share!.fileSize = share.file_size;
        response.share!.mimeType = share.mime_type;
        response.share!.isPasswordProtected = !!share.password_hash;
        response.share!.expiresAt = share.expires_at ?? null;
        response.share!.transferMessage = share.transfer_message ?? null;

        const files = share.transfer_files;
        if (Array.isArray(files) && files.length > 0) {
          response.share!.transferFiles = files.map(
            (f: { name: string; size: number; mimeType: string }) => ({
              name: f.name,
              size: f.size,
              mimeType: f.mimeType,
            })
          );
        }
      } else if (share.media_type === 'video') {
        response.share!.duration = share.duration;
      } else {
        const metadata = (
          typeof share.image_metadata === 'string'
            ? JSON.parse(share.image_metadata)
            : share.image_metadata || {}
        ) as { width?: number; height?: number };
        response.share!.imageType = share.image_type;
        response.share!.dimensions = {
          width: metadata.width,
          height: metadata.height,
        };
      }

      return res.json(response);
    } catch (error) {
      log.error('Failed to get share info:', error);
      return res.status(500).json({
        success: false,
        error: 'Fehler beim Laden des geteilten Mediums',
      });
    }
  }
);

router.get('/:shareToken/thumbnail', async (req: Request<ShareTokenParams>, res: Response) => {
  try {
    const { shareToken } = req.params;
    const service = await getSharedMediaService();
    const share = await service.getShareByToken(shareToken);

    if (!share || !share.thumbnail_path) {
      return res.status(404).json({ error: 'Thumbnail nicht gefunden' });
    }

    const thumbnailPath = service.getThumbnailFilePath(share.thumbnail_path);
    if (!thumbnailPath) {
      return res.status(404).json({ error: 'Thumbnail nicht gefunden' });
    }

    // Same reasoning as /preview: no version in the URL, and an edit rewrites
    // thumbnail.jpg in place, so `immutable` for a year was a promise this
    // route cannot keep.
    const etag = `"${versionFromShareRow(share)}"`;
    res.setHeader('Cache-Control', PREVIEW_CACHE_CONTROL);
    if (req.headers['if-none-match'] === etag) {
      res.setHeader('ETag', etag);
      return res.status(304).end();
    }

    try {
      await fsPromises.access(thumbnailPath);
      res.setHeader('ETag', etag);
      // etag:false — otherwise sendFile overwrites the content version above
      // with an mtime/size validator, and the 304 branch could never match.
      return res.sendFile(thumbnailPath, { etag: false });
    } catch {
      res.removeHeader('ETag');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(404).json({ error: 'Thumbnail-Datei nicht gefunden' });
    }
  } catch (error) {
    log.error('Failed to get thumbnail:', error);
    return res.status(500).json({ error: 'Fehler beim Laden des Thumbnails' });
  }
});

router.get(
  '/:shareToken/original',
  requireAuth,
  async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response) => {
    try {
      const { shareToken } = req.params;
      const userId = req.user!.id;

      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken);

      if (!share) {
        return res.status(404).json({ error: 'Share nicht gefunden' });
      }

      if (share.user_id !== userId) {
        return res.status(403).json({ error: 'Zugriff verweigert' });
      }

      const metadata = (share.image_metadata || {}) as Record<string, unknown>;
      if (!metadata.hasOriginalImage || !metadata.originalImageFilename) {
        return res.status(404).json({ error: 'Originalbild nicht vorhanden' });
      }

      const originalPath = service.getOriginalImagePath(
        shareToken,
        metadata.originalImageFilename as string
      );
      if (!originalPath) {
        return res.status(404).json({ error: 'Originalbild nicht vorhanden' });
      }

      try {
        const stat = await fsPromises.stat(originalPath);
        const mimeType = (metadata.originalImageFilename as string).endsWith('.jpg')
          ? 'image/jpeg'
          : 'image/png';

        res.setHeader('Content-Type', mimeType);
        res.setHeader('Content-Length', stat.size);
        res.setHeader('Cache-Control', 'private, max-age=3600');

        return fs.createReadStream(originalPath).pipe(res);
      } catch {
        // File is missing on disk but metadata claims it exists. Self-heal so
        // the gallery edit handler stops generating /original URLs for this share.
        try {
          await service.clearOriginalImageMetadata(shareToken);
        } catch (healError) {
          log.warn(
            'Failed to clear stale originalImage metadata for %s: %s',
            shareToken,
            healError
          );
        }
        return res.status(404).json({ error: 'Originalbild-Datei nicht gefunden' });
      }
    } catch (error) {
      log.error('Failed to get original image:', error);
      return res.status(500).json({ error: 'Fehler beim Laden des Originalbildes' });
    }
  }
);

/**
 * Resolve a share to a readable media file, or answer the request and return
 * null. Shared by /preview and /stream so the two cannot drift on which
 * statuses are visible.
 */
async function resolveShareMedia(
  shareToken: string,
  res: Response
): Promise<{ share: SharedMediaRow; mediaPath: string; fileSize: number } | null> {
  const service = await getSharedMediaService();
  const share = await service.getShareByToken(shareToken);

  if (!share) {
    res.status(404).json({ error: 'Medium nicht gefunden' });
    return null;
  }
  if (share.status === 'processing') {
    res.status(202).json({ status: 'processing', message: 'Medium wird noch verarbeitet' });
    return null;
  }
  if (share.status === 'failed') {
    res.status(500).json({ error: 'Verarbeitung fehlgeschlagen' });
    return null;
  }

  const mediaPath = share.file_path ? service.getMediaFilePath(share.file_path) : null;
  if (!mediaPath) {
    res.status(404).json({ error: 'Datei nicht verfügbar' });
    return null;
  }

  const stat = await fsPromises.stat(mediaPath).catch(() => null);
  if (!stat) {
    res.status(404).json({ error: 'Datei nicht gefunden' });
    return null;
  }

  return { share, mediaPath, fileSize: stat.size };
}

/** Byte-range video streaming. */
function streamVideo(req: Request, res: Response, mediaPath: string, fileSize: number): void {
  const range = req.headers.range;

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': 'video/mp4',
    });
    fs.createReadStream(mediaPath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, { 'Content-Length': fileSize, 'Content-Type': 'video/mp4' });
  fs.createReadStream(mediaPath).pipe(res);
}

/**
 * GET /:shareToken/stream — video playback with byte ranges.
 *
 * Split out of /preview, which served video and still images through the same
 * URL. That made "the preview route" mean two unrelated things and put a
 * multi-megabyte mp4 one wrong content-type check away from every consumer that
 * thinks it is asking for a picture.
 */
router.get('/:shareToken/stream', async (req: Request<ShareTokenParams>, res: Response) => {
  try {
    const resolved = await resolveShareMedia(req.params.shareToken, res);
    if (!resolved) return;
    if (resolved.share.media_type !== 'video') {
      res.status(404).json({ error: 'Kein Video' });
      return;
    }
    streamVideo(req, res, resolved.mediaPath, resolved.fileSize);
  } catch (error) {
    log.error('Failed to stream media:', error);
    res.status(500).json({ error: 'Fehler beim Laden des Videos' });
  }
});

/**
 * GET /:shareToken/preview — image variants via `?w=&fmt=`.
 *
 * The rendering itself now goes through the same code as `/api/thumbs`
 * (`services/media/thumbnailCache`), so the sharp settings, the pre-generated
 * lookup and the write-after-send ordering exist once instead of twice.
 *
 * Video still works here for clients that have not moved to /stream — the
 * shipped 1.3.0 binary among them. Deprecated: remove the video branch once a
 * release has gone out with /stream (earliest 2026-11).
 *
 * Cache policy differs from `/api/thumbs` on purpose. This URL carries no
 * version segment, and `updateImageShare` overwrites the bytes under the same
 * share token, so `immutable, max-age=1y` — what this route used to send — left
 * every client that had already fetched the image showing the pre-edit picture
 * for a year. A short freshness window plus an ETag makes the common case a
 * 304 and the edited case correct.
 */
router.get('/:shareToken/preview', async (req: Request<ShareTokenParams>, res: Response) => {
  try {
    const resolved = await resolveShareMedia(req.params.shareToken, res);
    if (!resolved) return;
    const { share, mediaPath, fileSize } = resolved;

    if (share.media_type === 'video') {
      streamVideo(req, res, mediaPath, fileSize);
      return;
    }

    const version = versionFromShareRow(share);
    const rawWidth = parseInt(req.query.w as string, 10);
    const fmt = req.query.fmt === 'avif' ? 'avif' : 'webp';
    // Unlike /api/thumbs this clamps rather than rejects: the widths in the wild
    // come from already-shipped clients, so a 400 here would be a broken image
    // on a page nobody can redeploy.
    const width =
      Number.isInteger(rawWidth) && rawWidth > 0
        ? THUMBNAIL_WIDTHS.reduce((best, w) =>
            Math.abs(w - rawWidth) < Math.abs(best - rawWidth) ? w : best
          )
        : null;

    const etag = `"${version}-w${width ?? 'orig'}-${width ? fmt : 'src'}"`;
    res.setHeader('Cache-Control', PREVIEW_CACHE_CONTROL);
    res.setHeader('ETag', etag);
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }

    const variant = await getThumbnailVariant(
      { kind: 'media', id: share.share_token, v: version, width, fmt },
      {
        sourcePath: mediaPath,
        contentType: share.mime_type || 'image/png',
        pregenerated: {
          dir: path.join(path.dirname(mediaPath), 'thumbs'),
          base: path.basename(mediaPath, path.extname(mediaPath)),
        },
      }
    );
    if (!variant) {
      res.removeHeader('ETag');
      res.setHeader('Cache-Control', 'no-store');
      res.status(404).json({ error: 'Datei nicht gefunden' });
      return;
    }

    res.setHeader('Content-Type', variant.contentType);
    res.setHeader('Content-Length', variant.size);
    if (variant.buffer) {
      res.send(variant.buffer);
      return;
    }
    fs.createReadStream(variant.filePath as string).pipe(res);
  } catch (error) {
    log.error('Failed to serve preview:', error);
    res.status(500).json({ error: 'Fehler beim Laden der Vorschau' });
  }
});

/**
 * GET /:shareToken/download
 * Transfer downloads are public (no auth). Image/video downloads require auth.
 */
router.get(
  '/:shareToken/download',
  async (
    req: Request<ShareTokenParams>,
    res: Response,
    next: express.NextFunction
  ): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const service = await getSharedMediaService();
      const share = await service.getShareByToken(shareToken as string);

      if (!share) {
        res.status(404).json({ success: false, error: 'Geteiltes Medium nicht gefunden' });
        return;
      }

      if (share.media_type === 'transfer') {
        if (share.expires_at && new Date(share.expires_at) < new Date()) {
          res.status(410).json({ success: false, error: 'Dieser Transfer-Link ist abgelaufen.' });
          return;
        }

        // scrypt format: "salt:hash"
        const password = req.headers['x-transfer-password'] as string;
        if (share.password_hash) {
          if (!password) {
            res.status(401).json({ success: false, error: 'Passwort erforderlich.' });
            return;
          }
          const [salt, storedHash] = share.password_hash.split(':');
          if (!salt || !storedHash) {
            res.status(500).json({ success: false, error: 'Ungültiger Passwort-Hash.' });
            return;
          }
          const derivedKey = crypto.scryptSync(password, salt, 64).toString('hex');
          const passwordValid = crypto.timingSafeEqual(
            Buffer.from(derivedKey, 'hex'),
            Buffer.from(storedHash, 'hex')
          );
          if (!passwordValid) {
            res.status(403).json({ success: false, error: 'Falsches Passwort.' });
            return;
          }
        }

        const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
        await service.recordDownload(shareToken as string, null, ipAddress, share.id);

        try {
          const transferParams = {
            user_id: share.user_id,
            ...(share.wolke_share_link_id != null
              ? { wolke_share_link_id: share.wolke_share_link_id }
              : {}),
            ...(share.wolke_file_path != null ? { wolke_file_path: share.wolke_file_path } : {}),
            ...(share.file_name != null ? { file_name: share.file_name } : {}),
          };
          const result = await transferService.proxyDownloadWithRecord(transferParams);

          res.setHeader(
            'Content-Type',
            result.mimeType || share.mime_type || 'application/octet-stream'
          );
          res.setHeader('Content-Length', result.size);
          setContentDisposition(res, result.fileName);

          log.info(`Transfer download: ${(shareToken as string).substring(0, 8)} (public)`);
          res.send(result.buffer);
        } catch (proxyErr) {
          const err = proxyErr as Error;
          log.error('Transfer proxy download failed', { error: err.message });
          if (!res.headersSent) {
            res.status(502).json({ success: false, error: 'Download von Wolke fehlgeschlagen.' });
          }
        }
        return;
      }

      // Image/video downloads: require auth — pass share to avoid re-fetch
      (req as RequestWithShare)._share = share;
      next();
    } catch (error) {
      log.error('Failed to process download:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Fehler beim Download' });
      }
    }
  },
  requireAuth,
  async (req: Request<ShareTokenParams> & AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const { shareToken } = req.params;
      const userId = req.user!.id;
      const userEmail = req.user!.email || 'authenticated-user';

      const service = await getSharedMediaService();
      const share =
        (req as RequestWithShare)._share ?? (await service.getShareByToken(shareToken as string));

      if (!share) {
        res.status(404).json({ success: false, error: 'Geteiltes Medium nicht gefunden' });
        return;
      }

      if (share.status === 'processing') {
        res.status(202).json({
          success: false,
          status: 'processing',
          error: 'Medium wird noch verarbeitet. Bitte warte einen Moment.',
        });
        return;
      }

      if (share.status === 'failed') {
        res.status(500).json({ success: false, error: 'Verarbeitung fehlgeschlagen' });
        return;
      }

      if (!share.file_path) {
        res.status(404).json({ success: false, error: 'Datei nicht verfügbar' });
        return;
      }

      const ipAddress = req.ip || req.socket.remoteAddress || 'unknown';
      await service.recordDownload(shareToken as string, userEmail, ipAddress);

      const mediaPath = service.getMediaFilePath(share.file_path);
      if (!mediaPath) {
        res.status(404).json({ success: false, error: 'Datei nicht gefunden' });
        return;
      }

      try {
        const stat = await fsPromises.stat(mediaPath);
        const fileSize = stat.size;

        const sanitizedTitle = (share.title || 'media')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 50);

        const extension =
          share.media_type === 'video' ? 'mp4' : share.mime_type === 'image/jpeg' ? 'jpg' : 'png';
        const filename = `${sanitizedTitle}_gruenerator.${extension}`;

        res.setHeader(
          'Content-Type',
          share.mime_type || (share.media_type === 'video' ? 'video/mp4' : 'image/png')
        );
        res.setHeader('Content-Length', fileSize);
        setContentDisposition(res, filename);

        log.info(`Download started: ${shareToken} by user ${userId} (${userEmail})`);

        const fileStream = fs.createReadStream(mediaPath);
        fileStream.pipe(res);

        fileStream.on('error', (streamError): void => {
          log.error(`Stream error for ${shareToken}: ${streamError.message}`);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Fehler beim Download' });
          }
        });

        return;
      } catch {
        res.status(404).json({ success: false, error: 'Datei nicht gefunden' });
        return;
      }
    } catch (error) {
      log.error('Failed to download share:', error);
      if (!res.headersSent) {
        res.status(500).json({ success: false, error: 'Fehler beim Download' });
      }
      return;
    }
  }
);

export default router;
