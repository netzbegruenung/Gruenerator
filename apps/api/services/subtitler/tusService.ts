/**
 * TUS Service
 *
 * Resumable file uploads using TUS protocol with intelligent cleanup.
 */

import { randomBytes } from 'crypto';
import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path, { dirname } from 'path';
import { Transform } from 'stream';
import { pipeline } from 'stream/promises';
import { fileURLToPath } from 'url';

import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';
import { type Request, type Response } from 'express';

import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const log = createLogger('TusService');

let isInitialized = false;
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
let emergencyCleanupIntervalId: ReturnType<typeof setInterval> | null = null;

const TUS_UPLOAD_PATH = path.join(__dirname, '../../uploads/tus-temp');

const TUS_CLEANUP_CONFIG = {
  INCOMPLETE_UPLOAD_TTL: 30 * 60 * 1000,
  PROCESSED_FILE_TTL: 4 * 60 * 60 * 1000,
  ORPHANED_METADATA_TTL: 15 * 60 * 1000,
  CLEANUP_INTERVAL: 15 * 60 * 1000,
  EMERGENCY_CLEANUP_INTERVAL: 60 * 60 * 1000,
  MAX_FILE_AGE: 24 * 60 * 60 * 1000,
} as const;

const activeUploads = new Set<string>();
const processedUploads = new Set<string>();
const promotedUploads = new Set<string>();

interface UploadMetadata {
  offset: number;
  size: number;
  metadata?: {
    filename?: string;
    [key: string]: unknown;
  };
}

interface UploadStatus {
  exists: boolean;
  hasMetadata?: boolean;
  hasVideo?: boolean;
  isComplete?: boolean;
  isIncomplete?: boolean;
  isOrphaned?: boolean;
  metadata?: UploadMetadata | null;
  error?: boolean;
}

void (async () => {
  try {
    await fs.mkdir(TUS_UPLOAD_PATH, { recursive: true });
    log.debug(`Upload directory: ${TUS_UPLOAD_PATH}`);
  } catch (err: unknown) {
    log.error(
      `Failed to create upload directory: ${err instanceof Error ? err.message : String(err)}`
    );
  }
})();

const tusServer = new Server({
  path: '/api/subtitler/upload',
  datastore: new FileStore({ directory: TUS_UPLOAD_PATH }),
  maxSize: 500 * 1024 * 1024,
  respectForwardedHeaders: true,
});

async function getUploadStatus(uploadId: string): Promise<UploadStatus> {
  try {
    const safeUploadId = path.basename(uploadId);
    const metadataPath = path.join(TUS_UPLOAD_PATH, `${safeUploadId}.json`);
    const videoPath = path.join(TUS_UPLOAD_PATH, safeUploadId);

    const [metadataExists, videoExists] = await Promise.all([
      fs
        .access(metadataPath)
        .then(() => true)
        .catch(() => false),
      fs
        .access(videoPath)
        .then(() => true)
        .catch(() => false),
    ]);

    if (!metadataExists && !videoExists) {
      return { exists: false };
    }

    let metadata: UploadMetadata | null = null;
    if (metadataExists) {
      try {
        const metadataContent = await fs.readFile(metadataPath, 'utf8');
        metadata = JSON.parse(metadataContent) as UploadMetadata;
      } catch (err: unknown) {
        log.debug(
          `Metadata read error for ${uploadId}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    return {
      exists: true,
      hasMetadata: metadataExists,
      hasVideo: videoExists,
      isComplete: metadata ? metadata.offset >= metadata.size : false,
      isIncomplete: metadata ? metadata.offset < metadata.size : false,
      isOrphaned: metadataExists && !videoExists,
      metadata,
    };
  } catch (err: unknown) {
    log.debug(
      `Upload status error for ${uploadId}: ${err instanceof Error ? err.message : String(err)}`
    );
    return { exists: false, error: true };
  }
}

async function cleanupUploadFiles(
  uploadId: string,
  reason: string = 'TTL expired'
): Promise<boolean> {
  try {
    const safeUploadId = path.basename(uploadId);
    const metadataPath = path.join(TUS_UPLOAD_PATH, `${safeUploadId}.json`);
    const videoPath = path.join(TUS_UPLOAD_PATH, safeUploadId);

    await Promise.all([
      fs.unlink(metadataPath).catch(() => {}),
      fs.unlink(videoPath).catch(() => {}),
    ]);

    activeUploads.delete(uploadId);
    processedUploads.delete(uploadId);

    log.debug(`Cleaned up ${uploadId} (${reason})`);
    return true;
  } catch (err: unknown) {
    log.debug(`Cleanup error for ${uploadId}: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

function markUploadAsProcessed(uploadId: string): void {
  activeUploads.delete(uploadId);
  processedUploads.add(uploadId);
}

function markUploadAsPromoted(uploadId: string): void {
  activeUploads.delete(uploadId);
  processedUploads.delete(uploadId);
  promotedUploads.add(uploadId);
  log.debug(`Upload ${uploadId} promoted to project storage`);
}

function isUploadPromoted(uploadId: string): boolean {
  return promotedUploads.has(uploadId);
}

async function scheduleImmediateCleanup(
  uploadId: string,
  reason: string = 'immediate'
): Promise<void> {
  if (promotedUploads.has(uploadId)) {
    log.debug(`Skipping cleanup for promoted upload: ${uploadId}`);
    return;
  }
  setTimeout(async () => {
    if (!promotedUploads.has(uploadId)) {
      await cleanupUploadFiles(uploadId, reason);
    }
  }, 5000);
}

tusServer.on('POST_CREATE', (req, upload) => {
  activeUploads.add(upload.id);
});

tusServer.on('POST_FINISH', (req, res, upload) => {
  markUploadAsProcessed(upload.id);
});

const CLEANUP_BATCH_SIZE = 10;

async function intelligentCleanup(): Promise<void> {
  try {
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;

    const uploadIds = [
      ...new Set(
        files
          .filter((file) => file !== '.gitkeep')
          .map((file) => (file.endsWith('.json') ? file.slice(0, -5) : file))
      ),
    ];

    for (let i = 0; i < uploadIds.length; i += CLEANUP_BATCH_SIZE) {
      const batch = uploadIds.slice(i, i + CLEANUP_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (uploadId) => {
          try {
            const filePath = path.join(TUS_UPLOAD_PATH, uploadId);
            const stats = await fs.stat(filePath).catch(() => null);
            if (!stats) return false;

            const fileAge = now - stats.mtime.getTime();
            const status = await getUploadStatus(uploadId);

            if (!status.exists) return false;

            if (promotedUploads.has(uploadId)) {
              return false;
            }

            let shouldCleanup = false;
            let reason = '';

            if (status.isOrphaned && fileAge > TUS_CLEANUP_CONFIG.ORPHANED_METADATA_TTL) {
              shouldCleanup = true;
              reason = 'orphaned metadata';
            } else if (status.isIncomplete && fileAge > TUS_CLEANUP_CONFIG.INCOMPLETE_UPLOAD_TTL) {
              shouldCleanup = true;
              reason = 'incomplete upload TTL';
            } else if (
              processedUploads.has(uploadId) &&
              fileAge > TUS_CLEANUP_CONFIG.PROCESSED_FILE_TTL
            ) {
              shouldCleanup = true;
              reason = 'processed file TTL';
            } else if (fileAge > TUS_CLEANUP_CONFIG.MAX_FILE_AGE) {
              shouldCleanup = true;
              reason = 'maximum age exceeded';
            }

            if (shouldCleanup) {
              return await cleanupUploadFiles(uploadId, reason);
            }
            return false;
          } catch {
            return false;
          }
        })
      );

      cleanedCount += results.filter(Boolean).length;

      if (i + CLEANUP_BATCH_SIZE < uploadIds.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (cleanedCount > 0) log.debug(`Cleanup: ${cleanedCount} files removed`);
  } catch (err: unknown) {
    log.debug(`Cleanup error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

async function emergencyCleanup(): Promise<void> {
  try {
    const files = await fs.readdir(TUS_UPLOAD_PATH);
    const now = Date.now();
    let cleanedCount = 0;

    const uploadIds = [
      ...new Set(
        files
          .filter((file) => file !== '.gitkeep')
          .map((file) => (file.endsWith('.json') ? file.slice(0, -5) : file))
      ),
    ];

    for (let i = 0; i < uploadIds.length; i += CLEANUP_BATCH_SIZE) {
      const batch = uploadIds.slice(i, i + CLEANUP_BATCH_SIZE);

      const results = await Promise.all(
        batch.map(async (uploadId) => {
          try {
            if (promotedUploads.has(uploadId)) {
              return false;
            }

            const filePath = path.join(TUS_UPLOAD_PATH, uploadId);
            const stats = await fs.stat(filePath).catch(() => null);
            if (!stats) return false;

            const fileAge = now - stats.mtime.getTime();

            if (fileAge > TUS_CLEANUP_CONFIG.MAX_FILE_AGE / 2) {
              return await cleanupUploadFiles(uploadId, 'emergency');
            }
            return false;
          } catch {
            return false;
          }
        })
      );

      cleanedCount += results.filter(Boolean).length;

      if (i + CLEANUP_BATCH_SIZE < uploadIds.length) {
        await new Promise((resolve) => setImmediate(resolve));
      }
    }

    if (cleanedCount > 0) log.debug(`Emergency cleanup: ${cleanedCount} files removed`);
  } catch (err: unknown) {
    log.debug(`Emergency cleanup error: ${err instanceof Error ? err.message : String(err)}`);
  }
}

function getFilePathFromUploadId(uploadId: string): string {
  if (!uploadId) throw new Error('Upload ID ist erforderlich');
  if (!/^[a-zA-Z0-9_-]+$/.test(uploadId)) {
    log.warn(`Security validation failed for uploadId: ${uploadId}`);
    throw new Error('Invalid upload ID: security validation failed');
  }

  const base = path.resolve(TUS_UPLOAD_PATH);
  const resolved = path.resolve(base, uploadId);
  if (!resolved.startsWith(base + path.sep)) {
    log.warn(`Path traversal blocked for uploadId: ${uploadId}`);
    throw new Error('Invalid upload ID: security validation failed');
  }
  return resolved;
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupTusUploads(_maxAgeHours: number = 24): Promise<void> {
  await intelligentCleanup();
}

async function getOriginalFilename(uploadId: string): Promise<string> {
  const status = await getUploadStatus(uploadId);
  return status.metadata?.metadata?.filename || `video_${uploadId}.mp4`;
}

const MAX_UPLOAD_SIZE = 500 * 1024 * 1024;

/**
 * Plain binary upload endpoint for clients that can't speak the TUS protocol.
 * The mobile app streams the picked video natively via expo-file-system, which
 * only supports binary/multipart uploads — not TUS's create + PATCH-offset loop.
 * The bytes land at the same `tus-temp/<uploadId>` path the rest of the subtitler
 * pipeline (process-auto / projects / export) already reads, alongside a
 * TUS-compatible `.json` sidecar so `getUploadStatus` and cleanup treat it like
 * any other upload (it reads `offset`/`size`/`metadata.filename`, and considers
 * `offset >= size` complete). Mounted before the body parsers so `req` is the
 * raw byte stream; the file streams straight to disk (no full-file buffering).
 */
async function handleBinaryUpload(req: Request, res: Response): Promise<void> {
  const declaredSize = Number(req.headers['content-length'] ?? 0);
  if (declaredSize > MAX_UPLOAD_SIZE) {
    res.status(413).json({ error: 'Video ist zu groß. Maximal 500MB erlaubt.' });
    return;
  }

  const uploadId = randomBytes(16).toString('hex');
  const filenameHeader = req.headers['x-filename'];
  const filename =
    typeof filenameHeader === 'string' && filenameHeader.length > 0
      ? filenameHeader
      : `video_${uploadId}.mp4`;
  const videoPath = getFilePathFromUploadId(uploadId);

  let bytesWritten = 0;
  const counter = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      bytesWritten += chunk.length;
      if (bytesWritten > MAX_UPLOAD_SIZE) {
        callback(new Error('UPLOAD_TOO_LARGE'));
        return;
      }
      callback(null, chunk);
    },
  });

  try {
    await pipeline(req, counter, createWriteStream(videoPath));
  } catch (err: unknown) {
    await fs.unlink(videoPath).catch(() => {});
    if (err instanceof Error && err.message === 'UPLOAD_TOO_LARGE') {
      if (!res.headersSent) {
        res.status(413).json({ error: 'Video ist zu groß. Maximal 500MB erlaubt.' });
      }
      return;
    }
    log.error(
      `Binary upload failed for ${uploadId}: ${err instanceof Error ? err.message : String(err)}`
    );
    if (!res.headersSent) {
      res.status(500).json({ error: 'Upload fehlgeschlagen' });
    }
    return;
  }

  const sidecar = {
    id: uploadId,
    size: bytesWritten,
    offset: bytesWritten,
    metadata: { filename, filetype: 'video/mp4' },
    creation_date: new Date().toISOString(),
    storage: { type: 'file', path: uploadId },
  };
  await fs.writeFile(`${videoPath}.json`, JSON.stringify(sidecar), 'utf8');

  activeUploads.add(uploadId);
  log.debug(`Binary upload complete: ${uploadId} (${bytesWritten} bytes)`);
  res.status(201).json({ uploadId });
}

if (!isInitialized) {
  void intelligentCleanup();

  cleanupIntervalId = setInterval(intelligentCleanup, TUS_CLEANUP_CONFIG.CLEANUP_INTERVAL);
  emergencyCleanupIntervalId = setInterval(
    emergencyCleanup,
    TUS_CLEANUP_CONFIG.EMERGENCY_CLEANUP_INTERVAL
  );

  log.debug('Cleanup intervals configured');

  const shutdownHandler = () => {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      if (emergencyCleanupIntervalId) clearInterval(emergencyCleanupIntervalId);
      cleanupIntervalId = null;
      emergencyCleanupIntervalId = null;
    }
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  isInitialized = true;
}

export {
  tusServer,
  handleBinaryUpload,
  getFilePathFromUploadId,
  checkFileExists,
  cleanupTusUploads,
  markUploadAsProcessed,
  markUploadAsPromoted,
  isUploadPromoted,
  scheduleImmediateCleanup,
  getUploadStatus,
  cleanupUploadFiles,
  getOriginalFilename,
};

export type { UploadStatus, UploadMetadata };
