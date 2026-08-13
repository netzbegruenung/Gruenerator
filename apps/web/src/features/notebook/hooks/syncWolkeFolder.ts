import { type WolkeFolderRef } from '@gruenerator/contracts';

import { type useDocumentsStore } from '../../../stores/documentsStore';

import {
  failureNotice,
  joinNotices,
  summarizeWolkeImport,
  unsupportedFileNotice,
  type WolkeImportFailure,
} from './wolkeImportSummary';

export interface ImportedWolkeDocument {
  id: string;
  title: string;
}

export type WolkeFolderSyncResult =
  | {
      kind: 'success';
      shareLinkId: string;
      folderPath: string;
      /** All documentIds present in this folder after sync (newly imported + already-imported). */
      currentDocumentIds: string[];
      /** Subset newly created on this sync — caller may want to poll for indexing. */
      newlyImported: ImportedWolkeDocument[];
      /** Files that were already imported before this sync. */
      alreadyImported: ImportedWolkeDocument[];
      updatedLastSyncedAt: string;
      skippedDueToSlotsFull: number;
      /** Files the import rejected, with a reason each. Empty on a clean run. */
      failures: WolkeImportFailure[];
      /** Human-readable line about failures and unsupported formats, or null. */
      notice: string | null;
    }
  | {
      kind: 'error';
      shareLinkId: string;
      folderPath: string;
      message: string;
    };

interface SyncContext {
  documentsStore: ReturnType<typeof useDocumentsStore.getState>;
  remainingSlots: number;
}

export async function syncWolkeFolder(
  folder: WolkeFolderRef,
  ctx: SyncContext
): Promise<WolkeFolderSyncResult> {
  try {
    const browseResult = await ctx.documentsStore.browseWolkeFiles(folder.shareLinkId);
    const supported = browseResult.files.filter((f) => f.isSupported);
    const unsupportedNotice = unsupportedFileNotice(browseResult.files);

    if (supported.length === 0) {
      return {
        kind: 'success',
        shareLinkId: folder.shareLinkId,
        folderPath: folder.folderPath,
        currentDocumentIds: [],
        newlyImported: [],
        alreadyImported: [],
        updatedLastSyncedAt: new Date().toISOString(),
        skippedDueToSlotsFull: 0,
        failures: [],
        notice: unsupportedNotice,
      };
    }

    const sliced = supported.slice(0, Math.max(0, ctx.remainingSlots));
    const skippedDueToSlotsFull = supported.length - sliced.length;

    if (sliced.length === 0) {
      return {
        kind: 'error',
        shareLinkId: folder.shareLinkId,
        folderPath: folder.folderPath,
        message: 'Notebook ist voll — Ordner übersprungen.',
      };
    }

    const result = await ctx.documentsStore.importWolkeFiles(folder.shareLinkId, sliced);
    const summary = summarizeWolkeImport(result.results ?? []);

    const currentDocumentIds = [
      ...summary.imported.map((d) => d.id),
      ...summary.alreadyImported.map((d) => d.id),
    ];

    return {
      kind: 'success',
      shareLinkId: folder.shareLinkId,
      folderPath: folder.folderPath,
      currentDocumentIds,
      newlyImported: summary.imported,
      alreadyImported: summary.alreadyImported,
      updatedLastSyncedAt: new Date().toISOString(),
      skippedDueToSlotsFull,
      failures: summary.failures,
      notice: joinNotices([failureNotice(summary.failures), unsupportedNotice]),
    };
  } catch (e) {
    return {
      kind: 'error',
      shareLinkId: folder.shareLinkId,
      folderPath: folder.folderPath,
      message: e instanceof Error ? e.message : 'Synchronisation fehlgeschlagen.',
    };
  }
}
