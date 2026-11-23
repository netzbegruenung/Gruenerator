/**
 * Wolke-Ordner als Projektwissen (#5945, experimentell).
 *
 * Ein Projekt-Admin hängt einen Nextcloud-Ordner per Freigabelink an. Jede
 * unterstützte Datei darin wird über `WolkeSyncService.processFile` ein
 * `documents`-Eintrag der Person, die angehängt hat, und als Projektdatei geteilt
 * (`content_type = 'documents'`) — derselbe Weg wie ein Upload in die
 * Projektseite. Projekt-Chats lesen sie danach ohne Zusatzweg
 * (`getProjectFileDocumentIds`).
 *
 * Entscheidungen zu den offenen Fragen des Issues:
 * - **Zugang:** gelesen wird mit dem Freigabelink der anhängenden Person
 *   (`user_id`). Ist sie nicht mehr Mitglied, das Projekt archiviert oder der
 *   Link aus ihrem Konto entfernt, ruht der Abgleich mit `last_error`; schon
 *   eingelesene Dateien bleiben, wie eine hochgeladene Datei nach dem Austritt.
 * - **Takt:** beim Anhängen und auf Knopfdruck sofort ein gedeckelter Lauf, sonst
 *   stündlich mit dem Wolke-Wächter (`runAllProjectWolkeFolders`).
 * - **Löschen:** verschwindet eine Datei aus dem Ordner, verschwindet sie aus dem
 *   Projekt. Der `documents`-Eintrag selbst bleibt bei der Person (er kann in
 *   ihren Notebooks hängen); nur die Projektfreigabe geht. Eine von Hand aus dem
 *   Wissen genommene Datei kommt nicht zurück — geteilt wird nur, was für den
 *   Ordner neu ist.
 * - **Kosten:** höchstens `MAX_FOLDER_FILES` Dateien je Ordner, je Lauf höchstens
 *   `maxIngest` neue oder geänderte Dateien in einem Zeitbudget. Unveränderte
 *   Dateien erkennt `processFile` am ETag ohne Download.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import { createLogger } from '../../utils/logger.js';
import { statusOf } from '../api-clients/nextcloudApiClient.js';
import { getWolkeSyncService, type WolkeSyncService } from '../sync/WolkeSyncService.js';

import { assertCanShareToGroup, getPostgresAndCheckMembership } from './groupMembership.js';
import { addGroupShare, removeGroupShare } from './groupShareWriter.js';
import { PROJECT_FILE_DOCUMENT_CAP } from './projectFiles.js';

import type { NextcloudFile } from '../sync/types.js';
import type { GroupWolkeFolder, GroupWolkeSyncSummary } from '@gruenerator/contracts';

const log = createLogger('project-wolke');

/** Mehr liest der Projekt-Chat ohnehin nicht (`PROJECT_FILE_DOCUMENT_CAP`). */
export const MAX_FOLDER_FILES = PROJECT_FILE_DOCUMENT_CAP;

/** Im Request: wenige Dateien, damit der Knopf nicht minutenlang hängt (wie bei Notebooks). */
export const INLINE_BUDGET = { maxIngest: 5, ms: 60_000 } as const;
/** Stündlich: je Ordner mehr, über alle Ordner ein gemeinsames Zeitbudget. */
export const WATCH_BUDGET = { maxIngest: 20, ms: 5 * 60_000 } as const;

export class ProjectWolkeFolderError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = 'ProjectWolkeFolderError';
  }
}

interface FolderRow {
  id: string;
  group_id: string;
  user_id: string;
  share_link_id: string;
  folder_path: string;
  folder_name: string;
  include_subfolders: boolean;
  synced_files: Record<string, string> | null;
  file_count: number;
  pending_count: number;
  last_synced_at: Date | string | null;
  last_error: string | null;
  attached_by_name?: string | null;
}

type Query = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>;

export interface ProjectWolkeDeps {
  query: Query;
  sync: Pick<WolkeSyncService, 'getShareLink' | 'listSupportedFilesInFolder' | 'processFile'>;
  addShare: (groupId: string, userId: string, documentId: string) => Promise<void>;
  removeShare: (groupId: string, documentId: string) => Promise<void>;
  /** Wirft mit dem Satz der Mitgliedsprüfung, wenn `userId` hier nicht teilen darf. */
  assertCanShare: (groupId: string, userId: string) => Promise<unknown>;
  now: () => number;
}

export function defaultProjectWolkeDeps(): ProjectWolkeDeps {
  const pg = getPostgresInstance();
  return {
    query: (text, params) => pg.query(text, params) as never,
    sync: getWolkeSyncService(),
    addShare: async (groupId, userId, documentId) => {
      await addGroupShare({
        userId,
        groupId,
        contentType: 'documents',
        contentId: documentId,
        permissions: { read: true, write: false },
        notify: false,
      });
    },
    removeShare: async (groupId, documentId) => {
      await removeGroupShare({ groupId, contentType: 'documents', contentId: documentId });
    },
    assertCanShare: assertCanShareToGroup,
    now: Date.now,
  };
}

const SELECT_FOLDER = `SELECT f.*, COALESCE(p.display_name, p.first_name) AS attached_by_name
   FROM group_wolke_folders f
   LEFT JOIN profiles p ON p.id = f.user_id`;

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toGroupWolkeFolder(row: FolderRow): GroupWolkeFolder {
  return {
    id: row.id,
    folderName: row.folder_name,
    folderPath: row.folder_path,
    includeSubfolders: row.include_subfolders,
    fileCount: row.file_count,
    pendingCount: row.pending_count,
    lastSyncedAt: toIso(row.last_synced_at),
    lastError: row.last_error,
    attachedById: row.user_id,
    attachedByName: row.attached_by_name ?? null,
  };
}

/** Der Satz, den Admins an der Zeile sehen — nie eine rohe WebDAV-Meldung. */
export function wolkeErrorMessage(error: unknown): string {
  const status = statusOf(error);
  if (status === 401) {
    return 'Der Freigabelink gilt nicht mehr (gelöscht, abgelaufen oder mit Passwort geschützt).';
  }
  if (status === 403) return 'Die Wolke verweigert den Zugriff auf diese Freigabe.';
  if (status === 404) return 'Der Ordner ist in der Wolke nicht mehr zu finden.';
  if (status === 405)
    return 'Das ist eine Ablage-Freigabe („Dateien ablegen") — lesen geht damit nicht.';
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'Share link not found' || message === 'Share link is not active') {
    return 'Die Wolke-Verbindung der Person, die den Ordner angehängt hat, gibt es nicht mehr.';
  }
  return 'Die Wolke hat nicht geantwortet. Der nächste Abgleich versucht es erneut.';
}

export const EMPTY_SUMMARY: GroupWolkeSyncSummary = {
  imported: 0,
  removed: 0,
  pending: 0,
  skipped: 0,
  failed: 0,
};

function lastModifiedMs(f: NextcloudFile): number {
  if (!f.lastModified) return 0;
  const t = new Date(f.lastModified).getTime();
  return Number.isFinite(t) ? t : 0;
}

/**
 * Ein Abgleich eines Ordners. Wirft nicht: ein Fehler landet in `last_error`
 * und in der Rückgabe, der Bestand bleibt unberührt. `deadline` ist absolut,
 * damit der stündliche Lauf sein Zeitbudget über alle Ordner teilt.
 */
export async function syncProjectWolkeFolder(
  row: FolderRow,
  budget: { maxIngest: number; deadline: number },
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<{ summary: GroupWolkeSyncSummary; error: string | null }> {
  const summary = { ...EMPTY_SUMMARY };
  let files: NextcloudFile[];
  try {
    await deps.assertCanShare(row.group_id, row.user_id);
  } catch (error) {
    const message = `Abgleich pausiert: ${error instanceof Error ? error.message : String(error)}`;
    await deps.query(`UPDATE group_wolke_folders SET last_error = $2 WHERE id = $1`, [
      row.id,
      message,
    ]);
    return { summary, error: message };
  }
  try {
    const shareLink = await deps.sync.getShareLink(row.user_id, row.share_link_id);
    files = await deps.sync.listSupportedFilesInFolder(shareLink, row.folder_path, {
      includeSubfolders: row.include_subfolders,
    });
    files.sort((a, b) => lastModifiedMs(b) - lastModifiedMs(a));
    if (files.length > MAX_FOLDER_FILES) {
      summary.skipped += files.length - MAX_FOLDER_FILES;
      files = files.slice(0, MAX_FOLDER_FILES);
    }

    const previous = row.synced_files ?? {};
    const next: Record<string, string> = {};
    let ingested = 0;
    for (const file of files) {
      const known = previous[file.href];
      const inBudget = ingested < budget.maxIngest && deps.now() < budget.deadline;
      if (!inBudget) {
        // Bekannte Dateien bleiben stehen (eine Änderung holt der nächste Lauf),
        // neue warten.
        if (known) next[file.href] = known;
        else summary.pending += 1;
        continue;
      }
      try {
        const result = await deps.sync.processFile(row.user_id, row.share_link_id, file, shareLink);
        const documentId = result.documentId ?? known;
        if (documentId) next[file.href] = documentId;
        else summary.skipped += 1;
        if (!result.skipped) {
          ingested += 1;
          summary.imported += 1;
        }
      } catch (error) {
        log.warn(`[project-wolke] ${row.id}: ${file.name} failed: ${String(error)}`);
        summary.failed += 1;
        if (known) next[file.href] = known;
      }
    }

    const keptIds = new Set(Object.values(next));
    const previousIds = new Set(Object.values(previous));
    for (const id of previousIds) {
      if (keptIds.has(id)) continue;
      await deps.removeShare(row.group_id, id);
      summary.removed += 1;
    }
    for (const id of keptIds) {
      if (!previousIds.has(id)) await deps.addShare(row.group_id, row.user_id, id);
    }

    await deps.query(
      `UPDATE group_wolke_folders
          SET synced_files = $2::jsonb, file_count = $3, pending_count = $4,
              last_synced_at = $5, last_error = NULL
        WHERE id = $1`,
      [row.id, JSON.stringify(next), keptIds.size, summary.pending, new Date(deps.now())]
    );
    return { summary, error: null };
  } catch (error) {
    log.warn(`[project-wolke] ${row.id}: sync failed: ${String(error)}`);
    const message = wolkeErrorMessage(error);
    await deps.query(`UPDATE group_wolke_folders SET last_error = $2 WHERE id = $1`, [
      row.id,
      message,
    ]);
    return { summary, error: message };
  }
}

async function loadFolder(
  groupId: string,
  folderId: string,
  deps: ProjectWolkeDeps
): Promise<FolderRow> {
  const rows = await deps.query<FolderRow>(`${SELECT_FOLDER} WHERE f.id = $1 AND f.group_id = $2`, [
    folderId,
    groupId,
  ]);
  if (!rows[0]) throw new ProjectWolkeFolderError('Ordner nicht gefunden.', 404);
  return rows[0];
}

/** Für Mitglieder; wirft („Du bist nicht Mitglied …"), wenn die Person keines ist. */
export async function listProjectWolkeFolders(
  groupId: string,
  userId: string,
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<GroupWolkeFolder[]> {
  await getPostgresAndCheckMembership(groupId, userId);
  const rows = await deps.query<FolderRow>(
    `${SELECT_FOLDER} WHERE f.group_id = $1 ORDER BY f.created_at`,
    [groupId]
  );
  return rows.map(toGroupWolkeFolder);
}

async function requireAdminWhoCanShare(groupId: string, userId: string, deps: ProjectWolkeDeps) {
  await getPostgresAndCheckMembership(groupId, userId, true);
  await deps.assertCanShare(groupId, userId);
}

/**
 * Ordner anhängen und gleich einen ersten, gedeckelten Lauf machen. Der
 * Freigabelink landet in den Wolke-Verbindungen der Person (oder sie hatte ihn
 * schon) — mit ihm liest auch der stündliche Abgleich.
 */
export async function attachProjectWolkeFolder(
  input: {
    groupId: string;
    userId: string;
    url: string;
    includeSubfolders: boolean;
    name?: string | null;
  },
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<{ folder: GroupWolkeFolder; summary: GroupWolkeSyncSummary }> {
  const { groupId, userId, includeSubfolders } = input;
  await requireAdminWhoCanShare(groupId, userId, deps);

  let link: Awaited<ReturnType<typeof NextcloudShareManager.findOrSaveShareLink>>;
  try {
    link = await NextcloudShareManager.findOrSaveShareLink(userId, input.url);
  } catch {
    throw new ProjectWolkeFolderError(
      'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).',
      400
    );
  }
  const folderPath = '/';
  const inserted = await deps.query<{ id: string }>(
    `INSERT INTO group_wolke_folders
        (group_id, user_id, share_link_id, folder_path, folder_name, include_subfolders)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (group_id, share_link_id, folder_path) DO NOTHING
      RETURNING id`,
    [
      groupId,
      userId,
      link.id,
      folderPath,
      input.name?.trim() || link.label?.trim() || 'Wolke-Ordner',
      includeSubfolders,
    ]
  );
  if (!inserted[0]) {
    throw new ProjectWolkeFolderError('Dieser Ordner ist schon im Projekt.', 409);
  }
  return runAndReload(groupId, inserted[0].id, deps);
}

async function runAndReload(groupId: string, folderId: string, deps: ProjectWolkeDeps) {
  const row = await loadFolder(groupId, folderId, deps);
  const { summary } = await syncProjectWolkeFolder(
    row,
    { maxIngest: INLINE_BUDGET.maxIngest, deadline: deps.now() + INLINE_BUDGET.ms },
    deps
  );
  return { folder: toGroupWolkeFolder(await loadFolder(groupId, folderId, deps)), summary };
}

/** „Jetzt abgleichen" — jede*r Admin, gelesen wird weiter mit dem Link der anhängenden Person. */
export async function syncProjectWolkeFolderNow(
  input: { groupId: string; userId: string; folderId: string },
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<{ folder: GroupWolkeFolder; summary: GroupWolkeSyncSummary }> {
  await requireAdminWhoCanShare(input.groupId, input.userId, deps);
  return runAndReload(input.groupId, input.folderId, deps);
}

/** Trennen: die Dateien des Ordners verlassen das Projekt, in der Wolke bleibt alles. */
export async function detachProjectWolkeFolder(
  input: { groupId: string; userId: string; folderId: string },
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<void> {
  await getPostgresAndCheckMembership(input.groupId, input.userId, true);
  const row = await loadFolder(input.groupId, input.folderId, deps);
  await deps.query(`DELETE FROM group_wolke_folders WHERE id = $1`, [row.id]);
  for (const id of new Set(Object.values(row.synced_files ?? {}))) {
    await deps.removeShare(row.group_id, id);
  }
}

export interface ProjectWolkeRunResult {
  scannedFolders: number;
  imported: number;
  removed: number;
  pending: number;
  failedFolders: number;
  durationMs: number;
}

/**
 * Der stündliche Lauf (aus `/internal/wolke-watch/run`). Gelöschte und
 * archivierte Projekte ruhen; die ältesten Abgleiche zuerst, damit ein Ordner,
 * der das Zeitbudget nicht mehr bekam, beim nächsten Mal vorne steht.
 */
export async function runAllProjectWolkeFolders(
  deps: ProjectWolkeDeps = defaultProjectWolkeDeps()
): Promise<ProjectWolkeRunResult> {
  const start = deps.now();
  const deadline = start + WATCH_BUDGET.ms;
  const rows = await deps.query<FolderRow>(
    `SELECT f.* FROM group_wolke_folders f
       JOIN groups g ON g.id = f.group_id
      WHERE g.deleted_at IS NULL AND g.archived_at IS NULL
      ORDER BY f.last_synced_at ASC NULLS FIRST`
  );
  const result: ProjectWolkeRunResult = {
    scannedFolders: 0,
    imported: 0,
    removed: 0,
    pending: 0,
    failedFolders: 0,
    durationMs: 0,
  };
  for (const row of rows) {
    if (deps.now() >= deadline) break;
    result.scannedFolders += 1;
    const { summary, error } = await syncProjectWolkeFolder(
      row,
      { maxIngest: WATCH_BUDGET.maxIngest, deadline },
      deps
    );
    result.imported += summary.imported;
    result.removed += summary.removed;
    result.pending += summary.pending;
    if (error) result.failedFolders += 1;
  }
  result.durationMs = deps.now() - start;
  return result;
}
