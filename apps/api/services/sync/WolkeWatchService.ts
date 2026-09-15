/**
 * WolkeWatchService — hourly detection of NEW files in the Wolke folders of
 * notebooks the user opted into (auto_sync=true).
 *
 * Detection is cheap: it only LISTS each share (no download) and diffs against
 * the files already imported (`documents.wolke_file_path`) and already-recorded
 * pending rows. New files are recorded in `wolke_pending_files` and the owner
 * gets ONE aggregated notification per notebook. The actual import (download →
 * OCR → embed → attach) happens on demand when the user clicks "Hinzufügen",
 * via WolkePendingContractRouter reusing WolkeSyncService.processFile.
 *
 * Idempotency + anti-spam: the unique (collection_id, file_path) index plus
 * onConflictDoNothing means re-runs never create duplicate pending rows, and
 * `newCount` (rows actually inserted) only counts genuinely-new files — so a
 * notebook is never re-notified about files it already flagged.
 */
import { type WolkeFolderRef } from '@gruenerator/contracts';
import { and, eq } from 'drizzle-orm';

import { documents, wolkePendingFiles } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { createLogger } from '../../utils/logger.js';
import { createNotification } from '../notifications/NotificationService.js';

import { insertPendingFiles } from './wolkePendingFiles.js';
import { getWolkeSyncService } from './WolkeSyncService.js';

const log = createLogger('wolke-watch');

/** Minimal shape the watcher needs from a notebook collection. */
interface WatchableCollection {
  id: string;
  user_id: string;
  name: string;
  wolke_folders: WolkeFolderRef[];
}

/** Read the persisted Wolke folder refs out of a collection's settings JSONB. */
function readWolkeFolders(settings: Record<string, unknown>): WolkeFolderRef[] {
  const raw = settings.wolke_folders;
  return Array.isArray(raw) ? (raw as WolkeFolderRef[]) : [];
}

export interface DetectResult {
  collectionId: string;
  newCount: number;
}

export interface WatchRunResult {
  scannedCollections: number;
  collectionsWithNewFiles: number;
  totalNewFiles: number;
  notificationsSent: number;
  durationMs: number;
}

export class WolkeWatchService {
  private sync = getWolkeSyncService();
  private notebookHelper = new NotebookQdrantHelper();

  /**
   * Detect new files for ONE collection across all its Wolke share links.
   * Idempotent: inserts pending rows with ON CONFLICT DO NOTHING and returns
   * only the count of genuinely-new rows.
   */
  async detectForCollection(collection: WatchableCollection): Promise<DetectResult> {
    const db = getDrizzleInstance();
    let newCount = 0;

    // Files already recorded as pending (any status) for this notebook — skip them.
    const existingPending = await db
      .select({ path: wolkePendingFiles.filePath })
      .from(wolkePendingFiles)
      .where(eq(wolkePendingFiles.collectionId, collection.id));
    const pendingPaths = new Set(existingPending.map((p) => p.path));

    for (const folder of collection.wolke_folders) {
      const shareLink = await this.sync.getShareLink(collection.user_id, folder.shareLinkId);
      // The watcher must look exactly as deep as the sync does — otherwise a new
      // file in a subfolder of a recursive folder is never offered.
      const files = await this.sync.listSupportedFilesInFolder(shareLink, folder.folderPath, {
        includeSubfolders: folder.includeSubfolders === true,
      });

      // Files already imported into `documents` for this (user, share link).
      const importedRows = await db
        .select({ path: documents.wolke_file_path })
        .from(documents)
        .where(
          and(
            eq(documents.user_id, collection.user_id),
            eq(documents.wolke_share_link_id, folder.shareLinkId)
          )
        );
      const importedPaths = new Set(importedRows.map((d) => d.path));

      const newFiles = files.filter((f) => !importedPaths.has(f.href) && !pendingPaths.has(f.href));
      if (newFiles.length === 0) continue;

      newCount += await insertPendingFiles(
        {
          collectionId: collection.id,
          userId: collection.user_id,
          shareLinkId: folder.shareLinkId,
          folderPath: folder.folderPath,
          files: newFiles,
        },
        db
      );
      for (const f of newFiles) pendingPaths.add(f.href);
    }

    return { collectionId: collection.id, newCount };
  }

  /**
   * Top-level hourly runner: scan every auto_sync notebook with Wolke sources,
   * and fire ONE aggregated notification per notebook that gained new files.
   * A per-collection failure (e.g. a dead share link) is logged and skipped so
   * one bad notebook never aborts the whole run.
   */
  async runAll(): Promise<WatchRunResult> {
    const start = Date.now();
    const collections = await this.notebookHelper.getNotebookCollectionsByAutoSync();
    const eligible: WatchableCollection[] = collections
      .map((c) => ({
        id: c.id,
        user_id: c.user_id,
        name: c.name,
        wolke_folders: readWolkeFolders(c.settings),
      }))
      .filter((c) => c.wolke_folders.length > 0);

    let collectionsWithNewFiles = 0;
    let totalNewFiles = 0;
    let notificationsSent = 0;

    for (const collection of eligible) {
      try {
        const { newCount } = await this.detectForCollection(collection);
        if (newCount === 0) continue;

        collectionsWithNewFiles += 1;
        totalNewFiles += newCount;

        const plural = newCount === 1 ? 'eine neue Datei' : `${newCount} neue Dateien`;
        await createNotification({
          userId: collection.user_id,
          type: 'wolke_new_files',
          title: `${plural} in „${collection.name}“`,
          body: `In deinem Notebook „${collection.name}“ wurde${
            newCount === 1 ? '' : 'n'
          } ${plural} aus der Wolke gefunden. Du kannst sie mit einem Klick hinzufügen.`,
          metadata: { collectionId: collection.id, newCount },
          actionUrl: `/notebooks/${collection.id}/bearbeiten`,
          groupKey: `wolke_new_files:${collection.id}`,
        });
        notificationsSent += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Wolke watch failed for collection ${collection.id}: ${message}`);
      }
    }

    return {
      scannedCollections: eligible.length,
      collectionsWithNewFiles,
      totalNewFiles,
      notificationsSent,
      durationMs: Date.now() - start,
    };
  }
}

let instance: WolkeWatchService | null = null;
export function getWolkeWatchService(): WolkeWatchService {
  if (!instance) instance = new WolkeWatchService();
  return instance;
}
