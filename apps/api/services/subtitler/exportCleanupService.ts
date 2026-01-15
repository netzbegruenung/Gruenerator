/**
 * Export Cleanup Service
 *
 * Automatically cleans up old video exports to prevent disk space exhaustion.
 * Exports are temporary files that should be downloaded shortly after creation.
 */

import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs/promises';
import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('ExportCleanupService');

const EXPORTS_DIR = path.join(__dirname, '../../uploads/exports');

const CLEANUP_CONFIG = {
  MAX_AGE_MS: 24 * 60 * 60 * 1000,
  CLEANUP_INTERVAL_MS: 60 * 60 * 1000,
  VIDEO_EXTENSIONS: ['.mp4', '.webm', '.mov', '.avi'] as string[]
};

let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;
let isInitialized = false;

interface CleanupStats {
  checked: number;
  deleted: number;
  freedBytes: number;
  errors: number;
}

async function cleanupOldExports(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    checked: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0
  };

  try {
    await fs.mkdir(EXPORTS_DIR, { recursive: true });

    const files = await fs.readdir(EXPORTS_DIR);
    const now = Date.now();

    for (const file of files) {
      const ext = path.extname(file).toLowerCase();
      if (!CLEANUP_CONFIG.VIDEO_EXTENSIONS.includes(ext)) continue;

      stats.checked++;
      const filePath = path.join(EXPORTS_DIR, file);

      try {
        const fileStats = await fs.stat(filePath);
        const age = now - fileStats.mtimeMs;

        if (age > CLEANUP_CONFIG.MAX_AGE_MS) {
          await fs.unlink(filePath);
          stats.deleted++;
          stats.freedBytes += fileStats.size;
          log.debug(`Deleted old export: ${file} (age: ${Math.round(age / 3600000)}h)`);
        }
      } catch (err: any) {
        stats.errors++;
        log.warn(`Failed to process ${file}: ${err.message}`);
      }
    }

    if (stats.deleted > 0) {
      const freedMB = (stats.freedBytes / (1024 * 1024)).toFixed(2);
      log.info(`Export cleanup: deleted ${stats.deleted}/${stats.checked} files, freed ${freedMB}MB`);
    }
  } catch (err: any) {
    log.error(`Export cleanup failed: ${err.message}`);
  }

  return stats;
}

function startCleanupScheduler(): void {
  if (isInitialized) {
    log.debug('Cleanup scheduler already running');
    return;
  }

  cleanupOldExports();

  cleanupIntervalId = setInterval(cleanupOldExports, CLEANUP_CONFIG.CLEANUP_INTERVAL_MS);

  const shutdownHandler = () => {
    if (cleanupIntervalId) {
      clearInterval(cleanupIntervalId);
      cleanupIntervalId = null;
      log.debug('Export cleanup scheduler stopped');
    }
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  isInitialized = true;
  log.info(`Export cleanup scheduler started (interval: ${CLEANUP_CONFIG.CLEANUP_INTERVAL_MS / 60000}min, max age: ${CLEANUP_CONFIG.MAX_AGE_MS / 3600000}h)`);
}

function stopCleanupScheduler(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
    isInitialized = false;
    log.debug('Export cleanup scheduler stopped');
  }
}

export {
  cleanupOldExports,
  startCleanupScheduler,
  stopCleanupScheduler,
  EXPORTS_DIR,
  CLEANUP_CONFIG
};

export type { CleanupStats };
