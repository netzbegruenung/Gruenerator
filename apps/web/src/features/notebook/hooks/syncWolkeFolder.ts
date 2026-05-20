import { type WolkeFolderRef } from '@gruenerator/contracts';

import { type useDocumentsStore } from '../../../stores/documentsStore';

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
      updatedLastSyncedAt: string;
      skippedDueToSlotsFull: number;
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

    if (supported.length === 0) {
      return {
        kind: 'success',
        shareLinkId: folder.shareLinkId,
        folderPath: folder.folderPath,
        currentDocumentIds: [],
        newlyImported: [],
        updatedLastSyncedAt: new Date().toISOString(),
        skippedDueToSlotsFull: 0,
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
    const results = result.results ?? [];

    const newlyImported: ImportedWolkeDocument[] = results
      .filter((r) => r.success === true && !r.skipped && typeof r.documentId === 'string')
      .map((r) => ({ id: r.documentId as string, title: r.filename }));

    const alreadyImportedIds = results
      .filter(
        (r) =>
          r.skipped === true && r.reason === 'already_imported' && typeof r.documentId === 'string'
      )
      .map((r) => r.documentId as string);

    const currentDocumentIds = [...newlyImported.map((d) => d.id), ...alreadyImportedIds];

    return {
      kind: 'success',
      shareLinkId: folder.shareLinkId,
      folderPath: folder.folderPath,
      currentDocumentIds,
      newlyImported,
      updatedLastSyncedAt: new Date().toISOString(),
      skippedDueToSlotsFull,
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
