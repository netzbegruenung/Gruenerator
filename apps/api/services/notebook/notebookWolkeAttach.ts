/**
 * Einen Wolke-Ordner an ein Notebook hängen — und eine gedeckelte erste Charge
 * sofort importieren.
 *
 * Aufrufer: die Bestätigungskarte `attach_wolke_folder` des Chats
 * (`confirmController.executeAction`) und der MCP-Override in `mcpMutations.ts`.
 * Beide laufen SYNCHRON in einem Request; der `pendingActionStore` hält den
 * Claim 120 s — danach führt ein zweiter Klick die Aktion erneut aus. Deshalb
 * die zwei Deckel `maxInline` und `inlineBudgetMs`: OCR ist seitenweise
 * abgerechnet und braucht 1–3 s je Seite, ein Ordner mit 40 Scans passt in
 * kein Request-Budget. Was nicht mehr hineinpasst, wird als
 * `wolke_pending_files` vorgemerkt und erscheint im „Neue Dateien"-Panel — der
 * Weg, den auch der stündliche Wächter geht.
 *
 * Reihenfolge-Garantien:
 * 1. Die Ordner-Ref wird ZUERST geschrieben. Stirbt der Import danach, hängt
 *    der Ordner trotzdem, und der Wächter vollendet die Arbeit.
 * 2. Schon importierte Dateien (gleicher Link, gleiche href) werden nur
 *    angehängt — kein zweiter Download, keine zweite OCR.
 * 3. Ein Fehler beim Import einer Datei wirft sie in die Warteschlange, nie
 *    weg.
 * 4. Genau zwei `updateNotebookCollection`-Schreibvorgänge: der Aufruf ist
 *    read-modify-write und embeddet neu, jeder weitere kostet.
 */
import { and, eq } from 'drizzle-orm';

import { documents } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { listAllCloudRoots } from '../files/index.js';
import { insertPendingFiles } from '../sync/wolkePendingFiles.js';
import { getWolkeSyncService, type WolkeSyncService } from '../sync/WolkeSyncService.js';

import type { NextcloudShareLink } from '../../utils/integrations/nextcloud/types.js';
import type { CloudRoot } from '../files/index.js';
import type { NextcloudFile } from '../sync/types.js';
import type { WolkeFolderRef } from '@gruenerator/contracts';

/** Über dieser Größe wandert eine Datei direkt in die Warteschlange. */
const MAX_INLINE_BYTES = 20 * 1024 * 1024;

export interface AttachWolkeFolderInput {
  userId: string;
  collectionId: string;
  shareLinkId: string;
  folderPath: string;
  includeSubfolders: boolean;
  maxInline?: number;
  inlineBudgetMs?: number;
}

export interface AttachWolkeFolderResult {
  folderName: string;
  total: number;
  alreadyImported: number;
  importedNow: number;
  queued: number;
  failed: number;
}

export interface AttachDeps {
  sync: Pick<WolkeSyncService, 'getShareLink' | 'listSupportedFilesInFolder' | 'processFile'>;
  helper: Pick<
    NotebookQdrantHelper,
    | 'getNotebookCollection'
    | 'updateNotebookCollection'
    | 'addDocumentsToCollection'
    | 'getCollectionDocuments'
  >;
  /** `documents`-Zeilen dieser Person für diesen Link: href → Dokument-Id. */
  findImported: (
    userId: string,
    shareLinkId: string
  ) => Promise<Array<{ id: string; path: string }>>;
  insertPending: typeof insertPendingFiles;
  now: () => number;
}

let helperSingleton: NotebookQdrantHelper | null = null;

async function findImportedDocuments(
  userId: string,
  shareLinkId: string
): Promise<Array<{ id: string; path: string }>> {
  const rows = await getDrizzleInstance()
    .select({ id: documents.id, path: documents.wolke_file_path })
    .from(documents)
    .where(and(eq(documents.user_id, userId), eq(documents.wolke_share_link_id, shareLinkId)));
  return rows.flatMap((r) => (r.path ? [{ id: String(r.id), path: r.path }] : []));
}

export function defaultAttachDeps(): AttachDeps {
  return {
    sync: getWolkeSyncService(),
    helper: (helperSingleton ??= new NotebookQdrantHelper()),
    findImported: findImportedDocuments,
    insertPending: insertPendingFiles,
    now: Date.now,
  };
}

export function wolkeFolderName(folderPath: string, shareLink: Pick<NextcloudShareLink, 'label'>) {
  return folderPath.split('/').filter(Boolean).pop() || shareLink.label || '/';
}

function readFolders(settings: Record<string, unknown>): WolkeFolderRef[] {
  const raw = settings.wolke_folders;
  return Array.isArray(raw) ? [...(raw as WolkeFolderRef[])] : [];
}

export async function attachWolkeFolderToNotebook(
  input: AttachWolkeFolderInput,
  deps: AttachDeps = defaultAttachDeps()
): Promise<AttachWolkeFolderResult> {
  const { userId, collectionId, shareLinkId, folderPath, includeSubfolders } = input;
  const maxInline = input.maxInline ?? 5;
  const inlineBudgetMs = input.inlineBudgetMs ?? 60_000;

  const shareLink = await deps.sync.getShareLink(userId, shareLinkId);
  const files = await deps.sync.listSupportedFilesInFolder(shareLink, folderPath, {
    includeSubfolders,
  });
  const folderName = wolkeFolderName(folderPath, shareLink);

  const collection = await deps.helper.getNotebookCollection(collectionId);
  if (!collection) throw new Error('Notebook collection not found');
  const settings: Record<string, unknown> = { ...collection.settings };
  const folders = readFolders(settings);

  // 1. Ref zuerst — dedupliziert auf Link + Pfad.
  let ref = folders.find((f) => f.shareLinkId === shareLinkId && f.folderPath === folderPath);
  if (!ref) {
    ref = {
      shareLinkId,
      shareLabel: shareLink.label,
      folderPath,
      folderName,
      includeSubfolders,
      lastSyncedAt: null,
    };
    folders.push(ref);
    settings.wolke_folders = folders;
    await deps.helper.updateNotebookCollection(collectionId, { settings });
  }

  // 2. Schon Importiertes nur anhängen.
  const importedByPath = new Map(
    (await deps.findImported(userId, shareLinkId)).map((d) => [d.path, d.id])
  );
  const attachedIds: string[] = [];
  const newFiles: NextcloudFile[] = [];
  for (const f of files) {
    const id = importedByPath.get(f.href);
    if (id) attachedIds.push(id);
    else newFiles.push(f);
  }
  const alreadyImported = attachedIds.length;

  // 3./4. Gedeckelte Charge; Fehler und Rest in die Warteschlange.
  const start = deps.now();
  const queue: NextcloudFile[] = [];
  let importedNow = 0;
  let failed = 0;
  for (const f of newFiles) {
    if (
      importedNow >= maxInline ||
      deps.now() - start >= inlineBudgetMs ||
      f.size > MAX_INLINE_BYTES
    ) {
      queue.push(f);
      continue;
    }
    try {
      const result = await deps.sync.processFile(userId, shareLinkId, f, shareLink);
      if (result.documentId) {
        attachedIds.push(result.documentId);
        importedNow += 1;
      } else {
        queue.push(f);
      }
    } catch {
      failed += 1;
      queue.push(f);
    }
  }
  if (queue.length > 0) {
    await deps.insertPending({ collectionId, userId, shareLinkId, folderPath, files: queue });
  }

  // 5. Anhängen, dann der zweite und letzte Schreibvorgang.
  const existing = new Set(
    (await deps.helper.getCollectionDocuments(collectionId)).map((d) => d.document_id)
  );
  if (attachedIds.length > 0) {
    await deps.helper.addDocumentsToCollection(collectionId, attachedIds, userId);
  }
  const added = attachedIds.filter((id) => !existing.has(id)).length;
  ref.lastSyncedAt = new Date(deps.now()).toISOString();
  settings.wolke_folders = folders;
  await deps.helper.updateNotebookCollection(collectionId, {
    document_count: existing.size + added,
    settings,
  });

  return {
    folderName,
    total: files.length,
    alreadyImported,
    importedNow,
    queued: queue.length,
    failed,
  };
}

// ---------------------------------------------------------------------------
// Vorschau — was die Karte zeigt, bevor die Person zustimmt
// ---------------------------------------------------------------------------

export interface WolkeFolderPreviewInput {
  userId: string;
  connectionId: string | undefined;
  folderPath: string;
  includeSubfolders: boolean;
}

export interface WolkeFolderPreview {
  root: CloudRoot;
  folderName: string;
  fileCount: number;
  alreadyImported: number;
}

export interface PreviewDeps {
  listRoots: (userId: string) => Promise<CloudRoot[]>;
  sync: Pick<WolkeSyncService, 'getShareLink' | 'listSupportedFilesInFolder'>;
  findImported: AttachDeps['findImported'];
}

export function defaultPreviewDeps(): PreviewDeps {
  return {
    listRoots: listAllCloudRoots,
    sync: getWolkeSyncService(),
    findImported: findImportedDocuments,
  };
}

/**
 * Nur EIGENE Verbindungen: Pending-Zeilen und der Wächter laufen als Owner,
 * und `getShareLink` löst nur die eigenen Links auf. Eine über ein Projekt
 * geteilte Wolke lässt sich lesen (`cloud_files`), aber nicht anhängen.
 */
export function pickOwnRoot(
  roots: CloudRoot[],
  connectionId: string | undefined
): { root: CloudRoot } | { error: string } {
  const usable = roots.filter((r) => r.isActive && r.origin === 'own');
  if (usable.length === 0) {
    return {
      error:
        'Für dieses Konto ist keine eigene Wolke verbunden — anhängen lässt sich nur eine eigene Verbindung (Einstellungen → Wolke oder cloud_files action="add_connection").',
    };
  }
  if (!connectionId) {
    if (usable.length === 1) return { root: usable[0] };
    return {
      error: `Es gibt mehrere eigene Verbindungen — gib connectionId an. Verfügbar: ${usable
        .map((r) => `${r.connectionId} (${r.label || r.host})`)
        .join(', ')}`,
    };
  }
  const match = usable.find((r) => r.connectionId === connectionId);
  if (!match) {
    return {
      error: `Keine eigene aktive Verbindung mit der Id "${connectionId}". Rufe zuerst cloud_files action="list_connections" auf.`,
    };
  }
  return { root: match };
}

export async function previewWolkeFolder(
  input: WolkeFolderPreviewInput,
  deps: PreviewDeps = defaultPreviewDeps()
): Promise<WolkeFolderPreview | { error: string }> {
  const picked = pickOwnRoot(await deps.listRoots(input.userId), input.connectionId);
  if ('error' in picked) return picked;
  const shareLink = await deps.sync.getShareLink(input.userId, picked.root.connectionId);
  const files = await deps.sync.listSupportedFilesInFolder(shareLink, input.folderPath, {
    includeSubfolders: input.includeSubfolders,
  });
  const imported = new Set(
    (await deps.findImported(input.userId, picked.root.connectionId)).map((d) => d.path)
  );
  return {
    root: picked.root,
    folderName: wolkeFolderName(input.folderPath, shareLink),
    fileCount: files.length,
    alreadyImported: files.filter((f) => imported.has(f.href)).length,
  };
}
