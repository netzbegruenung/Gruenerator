/**
 * TUS Service
 *
 * Resumable file uploads using TUS protocol with intelligent cleanup.
 */

import fs from 'fs/promises';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

import { FileStore } from '@tus/file-store';
import { Server } from '@tus/server';

import { createLogger } from '../../utils/logger.js';
import { sanitizePath } from '../../utils/validation/index.js';

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
    [key: string]: any;
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

(async () => {
  try {
    await fs.mkdir(TUS_UPLOAD_PATH, { recursive: true });
    log.debug(`Upload directory: ${TUS_UPLOAD_PATH}`);
  } catch (err: any) {
    log.error(`Failed to create upload directory: ${err.message}`);
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
        metadata = JSON.parse(metadataContent);
      } catch (err: any) {
        log.debug(`Metadata read error for ${uploadId}: ${err.message}`);
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
  } catch (err: any) {
    log.debug(`Upload status error for ${uploadId}: ${err.message}`);
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
  } catch (err: any) {
    log.debug(`Cleanup error for ${uploadId}: ${err.message}`);
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

tusServer.on('POST_CREATE', (req, res, upload) => {
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
  } catch (err: any) {
    log.debug(`Cleanup error: ${err.message}`);
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
  } catch (err: any) {
    log.debug(`Emergency cleanup error: ${err.message}`);
  }
}

function getFilePathFromUploadId(uploadId: string): string {
  if (!uploadId) throw new Error('Upload ID ist erforderlich');

  try {
    return sanitizePath(uploadId, TUS_UPLOAD_PATH);
  } catch (error) {
    log.warn(`Security validation failed for uploadId: ${uploadId}`);
    throw new Error('Invalid upload ID: security validation failed');
  }
}

async function checkFileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function cleanupTusUploads(maxAgeHours: number = 24): Promise<void> {
  await intelligentCleanup();
}

async function getOriginalFilename(uploadId: string): Promise<string> {
  const status = await getUploadStatus(uploadId);
  return status.metadata?.metadata?.filename || `video_${uploadId}.mp4`;
}

if (!isInitialized) {
  intelligentCleanup();

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
