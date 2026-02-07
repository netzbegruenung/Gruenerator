/**
 * Uploads Cleanup Service
 *
 * Periodically cleans up orphaned and expired files across all upload directories.
 * Runs alongside the existing exportCleanupService (which handles exports/).
 *
 * Cleanup strategies:
 * - Age-based: flux/, imagine/, temp/, transcriptions/, remotion-bundle/ (no DB tracking)
 * - Orphan-based: subtitler-projects/, shared-media/ (DB-tracked, only delete if not in DB)
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

import { createLogger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const log = createLogger('UploadsCleanup');

const UPLOADS_BASE = path.resolve(__dirname, '../../uploads');

const AGE_BASED_DIRS = [
  { name: 'flux/results', maxAgeDays: 7 },
  { name: 'imagine', maxAgeDays: 7 },
  { name: 'temp', maxAgeDays: 1 },
  { name: 'transcriptions', maxAgeDays: 7 },
  { name: 'remotion-bundle', maxAgeDays: 30 },
  { name: 'pending', maxAgeDays: 7 },
] as const;

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours
const DAY_MS = 24 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;
let initialized = false;

interface CleanupStats {
  directory: string;
  checked: number;
  deleted: number;
  freedBytes: number;
  errors: number;
}

async function getFilesRecursive(dir: string): Promise<string[]> {
  const results: string[] = [];
  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.gitkeep') continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...(await getFilesRecursive(fullPath)));
      } else {
        results.push(fullPath);
      }
    }
  } catch {
    // Directory doesn't exist — that's fine
  }
  return results;
}

async function removeEmptyDirs(dir: string, baseDir: string): Promise<void> {
  if (dir === baseDir) return;
  try {
    const entries = await fs.readdir(dir);
    const nonGitkeep = entries.filter((e) => e !== '.gitkeep');
    if (nonGitkeep.length === 0) {
      await fs.rm(dir, { recursive: true, force: true });
    }
  } catch {
    // Ignore
  }
}

async function cleanAgeBasedDir(dirName: string, maxAgeDays: number): Promise<CleanupStats> {
  const stats: CleanupStats = {
    directory: dirName,
    checked: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0,
  };

  const dirPath = path.join(UPLOADS_BASE, dirName);
  const maxAgeMs = maxAgeDays * DAY_MS;
  const now = Date.now();

  const files = await getFilesRecursive(dirPath);

  for (const filePath of files) {
    stats.checked++;
    try {
      const fileStat = await fs.stat(filePath);
      const age = now - fileStat.mtimeMs;

      if (age > maxAgeMs) {
        await fs.unlink(filePath);
        stats.deleted++;
        stats.freedBytes += fileStat.size;
      }
    } catch (err: any) {
      stats.errors++;
      log.warn(`Failed to process ${filePath}: ${err.message}`);
    }
  }

  // Clean up empty parent directories
  if (stats.deleted > 0) {
    const dirs = await getFilesRecursive(dirPath);
    const uniqueDirs = new Set(dirs.map((f) => path.dirname(f)));
    for (const d of uniqueDirs) {
      await removeEmptyDirs(d, dirPath);
    }
  }

  return stats;
}

async function cleanOrphanedSubtitlerProjects(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    directory: 'subtitler-projects (orphans)',
    checked: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0,
  };

  const projectsDir = path.join(UPLOADS_BASE, 'subtitler-projects');

  try {
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    // Get all user directories
    const userDirs = await fs.readdir(projectsDir).catch(() => [] as string[]);

    for (const userId of userDirs) {
      if (userId === '.gitkeep') continue;
      const userPath = path.join(projectsDir, userId);
      const userStat = await fs.stat(userPath).catch(() => null);
      if (!userStat?.isDirectory()) continue;

      const projectDirs = await fs.readdir(userPath).catch(() => [] as string[]);

      for (const projectId of projectDirs) {
        if (projectId === '.gitkeep') continue;
        stats.checked++;

        try {
          // Check if project exists in database
          const result = await postgres.queryOne(
            'SELECT id FROM subtitler_projects WHERE id = $1',
            [projectId]
          );

          if (!result) {
            // Orphaned: exists on disk but not in DB
            const projectPath = path.join(userPath, projectId);
            const size = await getDirSize(projectPath);
            await fs.rm(projectPath, { recursive: true, force: true });
            stats.deleted++;
            stats.freedBytes += size;
            log.debug(`Deleted orphaned project: ${userId}/${projectId}`);
          }
        } catch (err: any) {
          stats.errors++;
          log.warn(`Failed to check project ${projectId}: ${err.message}`);
        }
      }

      // Clean empty user directories
      await removeEmptyDirs(userPath, projectsDir);
    }
  } catch (err: any) {
    log.error(`Subtitler project cleanup failed: ${err.message}`);
  }

  return stats;
}

async function cleanOrphanedSharedMedia(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    directory: 'shared-media (orphans)',
    checked: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0,
  };

  const mediaDir = path.join(UPLOADS_BASE, 'shared-media');

  try {
    const { getPostgresInstance } = await import('../../database/services/PostgresService.js');
    const postgres = getPostgresInstance();
    await postgres.ensureInitialized();

    const shareDirs = await fs.readdir(mediaDir).catch(() => [] as string[]);

    for (const shareToken of shareDirs) {
      if (shareToken === '.gitkeep') continue;
      stats.checked++;

      try {
        const result = await postgres.queryOne(
          'SELECT id FROM shared_media WHERE share_token = $1',
          [shareToken]
        );

        if (!result) {
          const sharePath = path.join(mediaDir, shareToken);
          const size = await getDirSize(sharePath);
          await fs.rm(sharePath, { recursive: true, force: true });
          stats.deleted++;
          stats.freedBytes += size;
          log.debug(`Deleted orphaned shared media: ${shareToken}`);
        }
      } catch (err: any) {
        stats.errors++;
        log.warn(`Failed to check shared media ${shareToken}: ${err.message}`);
      }
    }
  } catch (err: any) {
    log.error(`Shared media cleanup failed: ${err.message}`);
  }

  return stats;
}

async function getDirSize(dirPath: string): Promise<number> {
  let size = 0;
  try {
    const files = await getFilesRecursive(dirPath);
    for (const file of files) {
      const s = await fs.stat(file).catch(() => null);
      if (s) size += s.size;
    }
  } catch {
    // Ignore
  }
  return size;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)}GB`;
}

async function runFullCleanup(): Promise<void> {
  log.info('Starting uploads cleanup cycle');
  const startTime = Date.now();
  let totalDeleted = 0;
  let totalFreed = 0;

  // Age-based cleanup
  for (const dir of AGE_BASED_DIRS) {
    const stats = await cleanAgeBasedDir(dir.name, dir.maxAgeDays);
    totalDeleted += stats.deleted;
    totalFreed += stats.freedBytes;
    if (stats.deleted > 0) {
      log.info(
        `[${dir.name}] Deleted ${stats.deleted}/${stats.checked} files older than ${dir.maxAgeDays}d, freed ${formatBytes(stats.freedBytes)}`
      );
    }
  }

  // Orphan-based cleanup
  const projectStats = await cleanOrphanedSubtitlerProjects();
  totalDeleted += projectStats.deleted;
  totalFreed += projectStats.freedBytes;
  if (projectStats.deleted > 0) {
    log.info(
      `[subtitler-projects] Deleted ${projectStats.deleted} orphaned projects, freed ${formatBytes(projectStats.freedBytes)}`
    );
  }

  const mediaStats = await cleanOrphanedSharedMedia();
  totalDeleted += mediaStats.deleted;
  totalFreed += mediaStats.freedBytes;
  if (mediaStats.deleted > 0) {
    log.info(
      `[shared-media] Deleted ${mediaStats.deleted} orphaned shares, freed ${formatBytes(mediaStats.freedBytes)}`
    );
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  if (totalDeleted > 0) {
    log.info(
      `Cleanup complete: deleted ${totalDeleted} items, freed ${formatBytes(totalFreed)} in ${elapsed}s`
    );
  } else {
    log.debug(`Cleanup complete: nothing to clean (${elapsed}s)`);
  }
}

function startUploadsCleanup(): void {
  if (initialized) {
    log.debug('Uploads cleanup already running');
    return;
  }

  // Run after a short delay to let DB connections initialize
  setTimeout(() => {
    runFullCleanup().catch((err) => log.error(`Initial cleanup failed: ${err.message}`));
  }, 30_000);

  intervalId = setInterval(() => {
    runFullCleanup().catch((err) => log.error(`Scheduled cleanup failed: ${err.message}`));
  }, CLEANUP_INTERVAL_MS);

  const shutdownHandler = () => {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      log.debug('Uploads cleanup stopped');
    }
  };

  process.on('SIGTERM', shutdownHandler);
  process.on('SIGINT', shutdownHandler);

  initialized = true;
  log.info(`Uploads cleanup started (interval: ${CLEANUP_INTERVAL_MS / 3600000}h)`);
}

function stopUploadsCleanup(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    initialized = false;
    log.debug('Uploads cleanup stopped');
  }
}

export { startUploadsCleanup, stopUploadsCleanup, runFullCleanup };
