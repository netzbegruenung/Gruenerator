/**
 * Uploads Cleanup Service
 *
 * Periodically cleans up orphaned and expired files across all upload directories.
 * Runs alongside the existing exportCleanupService (which handles exports/).
 *
 * Cleanup strategies:
 * - Age-based: flux/, imagine/, temp/, transcriptions/ (no DB tracking)
 * - Orphan-based: subtitler-projects/, shared-media/ (DB-tracked, only delete if not in DB)
 * - Row-based: shared_media rows stuck in 'processing'/'failed' (delete the row
 *   *and* its files — the directory-only pass above cannot see them, because
 *   they still have a row)
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
  { name: 'pending', maxAgeDays: 7 },
  // run_python figures/exports referenced from chat-message metadata — kept
  // long (the Berechnung cards live in threads); the ComputeCard tolerates
  // expired figure URLs by hiding the image.
  { name: 'compute-assets', maxAgeDays: 90 },
] as const;

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // Every 6 hours
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * How old a `processing`/`failed` share must be before it is reaped (#2989).
 *
 * Not a guess at the worst-case render time — there is no timeout on
 * `processProjectExport`, so there is no such number to read. It is derived
 * from what a render *needs*: it writes into `uploads/exports`, and
 * `exportCleanupService` deletes anything there older than 24h. A render still
 * running past that point has had its own output unlinked out from under it and
 * can no longer finish, so 24h is the point beyond which `processing` provably
 * means stuck rather than slow.
 *
 * `failed` could go sooner — nothing will ever revive it — but it shares the
 * threshold so that whoever holds the share link still reads "konnte nicht
 * verarbeitet werden" on `/share/:token` for a day instead of a bare 404.
 */
const ORPHANED_SHARE_MAX_AGE_HOURS = 24;

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
    } catch (err: unknown) {
      stats.errors++;
      log.warn(
        `Failed to process ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
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
        } catch (err: unknown) {
          stats.errors++;
          log.warn(
            `Failed to check project ${projectId}: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }

      // Clean empty user directories
      await removeEmptyDirs(userPath, projectsDir);
    }
  } catch (err: unknown) {
    log.error(
      `Subtitler project cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    );
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
      } catch (err: unknown) {
        stats.errors++;
        log.warn(
          `Failed to check shared media ${shareToken}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  } catch (err: unknown) {
    log.error(`Shared media cleanup failed: ${err instanceof Error ? err.message : String(err)}`);
  }

  return stats;
}

/**
 * Rows the directory pass above is blind to.
 *
 * `cleanOrphanedSharedMedia` deletes share directories that have *no* row. A
 * failed or stuck render still has one, so its directory does not look orphaned
 * and it survives every other pass in this file — while the row itself is
 * invisible to every listing. Deleting the row is what would make the directory
 * an orphan; the service removes both in one go rather than leaving the bytes
 * for the next cycle.
 *
 * Runs in the master process only (see `startUploadsCleanup` in server.ts), so
 * the DELETE has no sibling to race with.
 */
async function cleanStuckShareRows(): Promise<CleanupStats> {
  const stats: CleanupStats = {
    directory: 'shared_media (stuck rows)',
    checked: 0,
    deleted: 0,
    freedBytes: 0,
    errors: 0,
  };

  try {
    const { getSharedMediaService } = await import('../../routes/share/shareServices.js');
    const service = await getSharedMediaService();
    const reaped = await service.reapOrphanedShares(ORPHANED_SHARE_MAX_AGE_HOURS);

    stats.checked = reaped.length;
    stats.deleted = reaped.length;
    stats.freedBytes = reaped.reduce((sum, row) => sum + row.fileSize, 0);

    for (const row of reaped) {
      log.debug(`Reaped stuck share: ${row.shareToken} (${row.status})`);
    }

    // Rows the interlock held back. Each one is a finished sharepic wearing a
    // dead status. The known producer — the template clone flow behind #3009 —
    // is retired and its rows were promoted, so this should now read zero
    // forever; a nonzero count means a new writer of `'processing'` has appeared
    // on a path that finishes synchronously. They must not be deleted, but they
    // should not be silent either: the count is the only place this shows up.
    const withFiles = await service.countFileBearingOrphans();
    if (withFiles > 0) {
      log.warn(
        `${withFiles} share(s) sit in processing/failed but carry a file — NOT reaped. ` +
          `These are user media with the wrong status, not orphans.`
      );
    }
  } catch (err: unknown) {
    stats.errors++;
    log.error(
      `Stuck shared_media row cleanup failed: ${err instanceof Error ? err.message : String(err)}`
    );
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

  // Before the directory pass: reaping a row turns its directory into an orphan,
  // so anything `cleanupShareFiles` failed to remove is caught in the same cycle.
  const stuckRowStats = await cleanStuckShareRows();
  totalDeleted += stuckRowStats.deleted;
  totalFreed += stuckRowStats.freedBytes;
  if (stuckRowStats.deleted > 0) {
    log.info(
      `[shared_media] Reaped ${stuckRowStats.deleted} share(s) stuck in processing/failed for over ${ORPHANED_SHARE_MAX_AGE_HOURS}h, freed ${formatBytes(stuckRowStats.freedBytes)}`
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
    runFullCleanup().catch((err: unknown) =>
      log.error(`Initial cleanup failed: ${err instanceof Error ? err.message : String(err)}`)
    );
  }, 30_000);

  intervalId = setInterval(() => {
    runFullCleanup().catch((err: unknown) =>
      log.error(`Scheduled cleanup failed: ${err instanceof Error ? err.message : String(err)}`)
    );
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
