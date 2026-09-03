/**
 * Neue Wolke-Dateien als `wolke_pending_files` vormerken.
 *
 * Aus `WolkeWatchService.detectForCollection` herausgezogen, weil der
 * Chat-Import (`attachWolkeFolderToNotebook`) dieselben Zeilen schreibt: was
 * er in seinem Zeitbudget nicht mehr auslesen kann, landet hier und erscheint
 * im „Neue Dateien"-Panel — derselbe Weg, den der stündliche Wächter geht.
 * Zwei Schreiber mit je eigenem INSERT hätten irgendwann verschiedene Spalten
 * gefüllt.
 *
 * Idempotent über den Unique-Index (collection_id, file_path): ein zweiter
 * Lauf legt keine Doppel an, und die Rückgabe zählt nur, was WIRKLICH neu
 * eingefügt wurde — der Wächter benachrichtigt danach.
 */
import { wolkePendingFiles } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';

import type { NextcloudFile } from './types.js';

export interface InsertPendingFilesInput {
  collectionId: string;
  userId: string;
  shareLinkId: string;
  folderPath: string;
  files: NextcloudFile[];
}

/** @returns Anzahl der tatsächlich neu eingefügten Zeilen. */
export async function insertPendingFiles(
  input: InsertPendingFilesInput,
  db: ReturnType<typeof getDrizzleInstance> = getDrizzleInstance()
): Promise<number> {
  if (input.files.length === 0) return 0;
  const inserted = await db
    .insert(wolkePendingFiles)
    .values(
      input.files.map((f) => ({
        collectionId: input.collectionId,
        userId: input.userId,
        shareLinkId: input.shareLinkId,
        folderPath: input.folderPath,
        filePath: f.href,
        fileName: f.name,
        etag: f.etag ?? null,
        size: f.size ?? null,
        mimeType: null,
        status: 'pending',
      }))
    )
    .onConflictDoNothing({
      target: [wolkePendingFiles.collectionId, wolkePendingFiles.filePath],
    })
    .returning({ id: wolkePendingFiles.id });
  return inserted.length;
}
