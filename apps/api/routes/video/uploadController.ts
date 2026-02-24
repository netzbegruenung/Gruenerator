/**
 * Video Upload Controller
 *
 * Handles file uploads for the video editor via two methods:
 * 1. Direct file upload via multipart form data
 * 2. URL-based upload (download from external URL)
 *
 * Files are stored in a local upload directory accessible to both
 * the API server and the Remotion render container.
 */

import crypto from 'crypto';
import fs from 'fs';
import path, { dirname } from 'path';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

import { Router, type Response, type Request } from 'express';
import multer from 'multer';

import { type AuthenticatedRequest } from '../../middleware/types.js';
import { createLogger } from '../../utils/logger.js';
import { safeFetch } from '../../utils/validation/urlSecurity.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('video-upload');
const router = Router();

const MIME_MAP: Record<string, string> = {
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

function lookupMime(filename: string): string {
  const ext = path.extname(filename).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

const VIDEO_UPLOAD_DIR = path.join(__dirname, '../../uploads/video-media');
const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Ensure upload directory exists
(async () => {
  try {
    await fs.promises.mkdir(VIDEO_UPLOAD_DIR, { recursive: true });
    log.debug(`Video upload directory: ${VIDEO_UPLOAD_DIR}`);
  } catch (err: any) {
    log.error(`Failed to create video upload directory: ${err.message}`);
  }
})();

// Multer config for direct file uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, VIDEO_UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.bin';
    cb(null, `${crypto.randomUUID()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_FILE_SIZE },
});

function getPublicUrl(req: Request, filename: string): string {
  const protocol = req.headers['x-forwarded-proto'] || req.protocol;
  const host = req.headers['x-forwarded-host'] || req.get('host');
  return `${protocol}://${host}/api/video/uploads/file/${filename}`;
}

/**
 * POST /api/video/uploads
 *
 * Direct file upload via multipart form data.
 * Returns upload metadata with accessible URL.
 */
router.post(
  '/',
  upload.single('file'),
  async (req: AuthenticatedRequest, res: Response): Promise<void> => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({ error: 'No file provided' });
        return;
      }

      const uploadData = {
        id: path.parse(file.filename).name,
        fileName: file.originalname,
        filePath: file.path,
        fileSize: file.size,
        contentType: file.mimetype,
        url: getPublicUrl(req, file.filename),
        type: file.mimetype.split('/')[0],
        status: 'uploaded',
      };

      log.info(`File uploaded: ${file.originalname} (${(file.size / 1024 / 1024).toFixed(1)}MB)`);
      res.json({ success: true, uploads: [uploadData] });
    } catch (error: any) {
      log.error(`Upload failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
);

/**
 * POST /api/video/uploads/from-url
 *
 * Download file from external URL and store locally.
 * Replaces the old presign + url upload flow.
 */
router.post('/from-url', async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    res.status(400).json({ error: 'urls array is required' });
    return;
  }

  try {
    const uploads = await Promise.all(
      urls.map(async (url: string) => {
        const response = await safeFetch(url);
        if (!response.ok) {
          throw new Error(`Failed to download from ${url}: ${response.status}`);
        }
        if (!response.body) {
          throw new Error(`Empty response body from ${url}`);
        }

        const urlPath = new URL(url).pathname;
        const ext = path.extname(urlPath) || '.bin';
        const contentType =
          response.headers.get('content-type') ||
          lookupMime(`file${ext}`) ||
          'application/octet-stream';

        const id = crypto.randomUUID();
        const filename = `${id}${ext}`;
        const filePath = path.join(VIDEO_UPLOAD_DIR, filename);

        const fileStream = fs.createWriteStream(filePath);
        await pipeline(response.body!, fileStream);

        const stats = await fs.promises.stat(filePath);

        return {
          id,
          fileName: path.basename(urlPath) || filename,
          filePath,
          fileSize: stats.size,
          contentType,
          url: getPublicUrl(req as Request, filename),
          originalUrl: url,
          type: contentType.split('/')[0],
          status: 'uploaded',
        };
      })
    );

    log.info(`URL upload: ${uploads.length} files downloaded`);
    res.json({ success: true, uploads });
  } catch (error: any) {
    log.error(`URL upload failed: ${error.message}`);
    res.status(500).json({ error: error.message });
  }
});

/**
 * GET /api/video/uploads/file/:filename
 *
 * Serves uploaded files. Used by the video editor player and
 * the Remotion render container to access uploaded media.
 */
router.get(
  '/file/:filename',
  async (req: Request<{ filename: string }>, res: Response): Promise<void> => {
    const { filename } = req.params;

    // Security: prevent directory traversal
    const safeName = path.basename(filename);
    const filePath = path.join(VIDEO_UPLOAD_DIR, safeName);

    try {
      await fs.promises.access(filePath);
      const stats = await fs.promises.stat(filePath);
      const contentType = lookupMime(safeName) || 'application/octet-stream';

      // Support range requests for video seeking
      const range = req.headers.range;
      if (range) {
        const parts = range.replace(/bytes=/, '').split('-');
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        const chunkSize = end - start + 1;

        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': chunkSize,
          'Content-Type': contentType,
        });

        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          'Content-Length': stats.size,
          'Content-Type': contentType,
          'Accept-Ranges': 'bytes',
        });

        fs.createReadStream(filePath).pipe(res);
      }
    } catch {
      res.status(404).json({ error: 'File not found' });
    }
  }
);

/**
 * GET /api/video/uploads/:id/url
 *
 * Returns the accessible URL for an uploaded file by its ID.
 */
router.get(
  '/:id/url',
  async (req: AuthenticatedRequest<{ id: string }>, res: Response): Promise<void> => {
    const { id } = req.params;

    try {
      const files = await fs.promises.readdir(VIDEO_UPLOAD_DIR);
      const match = files.find((f) => f.startsWith(id));

      if (!match) {
        res.status(404).json({ error: 'Upload not found' });
        return;
      }

      res.json({ url: getPublicUrl(req as Request, match) });
    } catch (error: any) {
      log.error(`URL lookup failed: ${error.message}`);
      res.status(500).json({ error: error.message });
    }
  }
);

export default router;
