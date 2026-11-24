/**
 * Synchronisierte Ablagen als Projektwissen (#5945, experimentell).
 *
 * Ein Projekt-Admin hängt einen Wolke-Ordner (Freigabelink) oder eine Auswahl
 * von Google-Drive-Dateien (Picker) an. Jede lesbare Datei wird ein
 * `documents`-Eintrag der Person, die angehängt hat, und als Projektdatei
 * geteilt (`content_type = 'documents'`) — derselbe Weg wie ein Upload auf der
 * Projektseite. Projekt-Chats lesen sie danach ohne Zusatzweg
 * (`getProjectFileDocumentIds`).
 *
 * Der Abgleich ist EIN Ablauf (`syncProjectCloudSource`); was je Anbieter
 * verschieden ist — auflisten und eine Datei einlesen —, steckt in einem
 * `SourceAdapter`:
 * - **Wolke:** der Ordner wird gelistet, eingelesen wird über
 *   `WolkeSyncService.processFile` (ETag-Prüfung dort).
 * - **Google Drive:** der Scope `drive.file` sieht nur im Picker gewählte
 *   Dateien, einen Ordnerinhalt nie (gemessen von anderen, von Google
 *   bestätigt). Die Quelle ist deshalb die Auswahl selbst: jede gewählte Datei
 *   wird abgefragt; geändert (`modifiedTime`) wird neu eingelesen, gelöscht,
 *   im Papierkorb oder nicht mehr freigegeben fällt sie heraus.
 *
 * Entscheidungen zu den offenen Fragen des Issues:
 * - **Zugang:** gelesen wird mit der Verbindung der anhängenden Person
 *   (`user_id`). Darf sie im Projekt nicht mehr teilen (ausgetreten,
 *   archiviert) oder ist ihre Verbindung weg, ruht der Abgleich mit
 *   `last_error`; schon eingelesene Dateien bleiben, wie ein Upload nach dem
 *   Austritt.
 * - **Takt:** beim Anhängen und auf Knopfdruck ein gedeckelter Lauf, sonst
 *   stündlich mit dem Wolke-Wächter (`runAllProjectCloudSources`).
 * - **Löschen:** verschwindet eine Datei aus der Quelle, verschwindet sie aus
 *   dem Projekt. Der `documents`-Eintrag bleibt bei der Person (er kann in ihren
 *   Notebooks hängen). Eine von Hand aus dem Wissen genommene Datei kommt nicht
 *   zurück — geteilt wird nur, was für die Quelle neu ist.
 * - **Kosten:** höchstens `MAX_SOURCE_FILES` Dateien je Quelle, je Lauf
 *   höchstens `maxIngest` neue oder geänderte in einem Zeitbudget.
 */
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import { createLogger } from '../../utils/logger.js';
import * as driveClient from '../api-clients/googleDriveClient.js';
import { statusOf } from '../api-clients/nextcloudApiClient.js';
import { isConnectFileSupported } from '../connections/connectFileSupport.js';
import { extractTextFromFile } from '../document-services/DocumentProcessingService/textExtraction.js';
import { CloudAccessError, guardDriveCall } from '../files/driveErrors.js';
import { googleDriveProvider } from '../files/googleDriveProvider.js';
import { getNangoAccessToken } from '../files/nangoDriveAccess.js';
import { storeExtractedDocument } from '../sync/storeExtractedDocument.js';
import { getWolkeSyncService, type WolkeSyncService } from '../sync/WolkeSyncService.js';

import { assertCanShareToGroup, getPostgresAndCheckMembership } from './groupMembership.js';
import { addGroupShare, removeGroupShare } from './groupShareWriter.js';
import { PROJECT_FILE_DOCUMENT_CAP } from './projectFiles.js';

import type { PickedCloudFile, SyncedCloudFile } from '../../database/schema/groups.js';
import type { NextcloudFile } from '../sync/types.js';
import type {
  GroupCloudProvider,
  GroupCloudSource,
  GroupCloudSyncSummary,
} from '@gruenerator/contracts';

const log = createLogger('project-cloud');

/** Mehr liest der Projekt-Chat ohnehin nicht (`PROJECT_FILE_DOCUMENT_CAP`). */
export const MAX_SOURCE_FILES = PROJECT_FILE_DOCUMENT_CAP;

/** Im Request: wenige Dateien, damit der Knopf nicht minutenlang hängt (wie bei Notebooks). */
export const INLINE_BUDGET = { maxIngest: 5, ms: 60_000 } as const;
/** Stündlich: je Quelle mehr, über alle Quellen ein gemeinsames Zeitbudget. */
export const WATCH_BUDGET = { maxIngest: 20, ms: 5 * 60_000 } as const;

export class ProjectCloudSourceError extends Error {
  constructor(
    message: string,
    readonly status: 400 | 404 | 409
  ) {
    super(message);
    this.name = 'ProjectCloudSourceError';
  }
}

export interface SourceRow {
  id: string;
  group_id: string;
  user_id: string;
  provider: GroupCloudProvider;
  share_link_id: string;
  folder_path: string;
  name: string;
  include_subfolders: boolean;
  picked_files: PickedCloudFile[] | null;
  synced_files: Record<string, SyncedCloudFile> | null;
  file_count: number;
  pending_count: number;
  last_synced_at: Date | string | null;
  last_error: string | null;
  attached_by_name?: string | null;
}

// ── Adapter ──────────────────────────────────────────────────────────────────

export interface SourceItem {
  /** Stabiler Schlüssel in `synced_files`: WebDAV-href bzw. Drive-Id. */
  key: string;
  name: string;
  lastModified: number;
}

export interface IngestResult {
  /** Das Dokument, das die Datei jetzt trägt; `null`: nicht lesbar. */
  documentId: string | null;
  version: string | null;
  /** Wirklich neu eingelesen (kostet Budget) — nicht nur als unverändert erkannt. */
  ingested: boolean;
}

export interface SourceSession<I extends SourceItem = SourceItem> {
  items: I[];
  ingest(item: I, known: SyncedCloudFile | undefined): Promise<IngestResult>;
  /** Neue Auswahl, wenn die Quelle sie bereinigt hat (Drive: verschwundene Dateien raus). */
  pickedFiles?: PickedCloudFile[];
}

export interface SourceAdapter {
  open(row: SourceRow): Promise<SourceSession>;
  /** Der Satz an der Zeile, wenn die ganze Quelle nicht lesbar ist — nie Rohtext. */
  describeError(error: unknown): string;
}

/** Der Satz, den Admins an einem Wolke-Ordner sehen — nie eine rohe WebDAV-Meldung. */
export function wolkeErrorMessage(error: unknown): string {
  const status = statusOf(error);
  if (status === 401) {
    return 'Der Freigabelink gilt nicht mehr (gelöscht, abgelaufen oder mit Passwort geschützt).';
  }
  if (status === 403) return 'Die Wolke verweigert den Zugriff auf diese Freigabe.';
  if (status === 404) return 'Der Ordner ist in der Wolke nicht mehr zu finden.';
  if (status === 405) {
    return 'Das ist eine Ablage-Freigabe („Dateien ablegen") — lesen geht damit nicht.';
  }
  const message = error instanceof Error ? error.message : String(error);
  if (message === 'Share link not found' || message === 'Share link is not active') {
    return 'Die Wolke-Verbindung der Person, die den Ordner angehängt hat, gibt es nicht mehr.';
  }
  return 'Die Wolke hat nicht geantwortet. Der nächste Abgleich versucht es erneut.';
}

export function driveErrorMessage(error: unknown): string {
  if (error instanceof CloudAccessError) {
    if (error.kind === 'reauth') {
      return 'Der Google-Zugang der Person, die die Dateien hinzugefügt hat, ist abgelaufen. Sie muss Google Drive in den Einstellungen unter Konnektoren neu verbinden.';
    }
    if (error.kind === 'rate_limit') {
      return 'Google Drive bremst gerade. Der nächste Abgleich versucht es erneut.';
    }
  }
  return 'Google Drive hat nicht geantwortet. Der nächste Abgleich versucht es erneut.';
}

type WolkeItem = SourceItem & { file: NextcloudFile };

export function wolkeAdapter(
  sync: Pick<
    WolkeSyncService,
    'getShareLink' | 'listSupportedFilesInFolder' | 'processFile'
  > = getWolkeSyncService()
): SourceAdapter {
  return {
    describeError: wolkeErrorMessage,
    async open(row) {
      const shareLink = await sync.getShareLink(row.user_id, row.share_link_id);
      const files = await sync.listSupportedFilesInFolder(shareLink, row.folder_path || '/', {
        includeSubfolders: row.include_subfolders,
      });
      const items: WolkeItem[] = files.map((file) => ({
        key: file.href,
        name: file.name,
        lastModified: file.lastModified ? new Date(file.lastModified).getTime() || 0 : 0,
        file,
      }));
      return {
        items,
        async ingest(item, known) {
          // `processFile` prüft den ETag selbst und gibt bei „unverändert" die Id zurück.
          const result = await sync.processFile(
            row.user_id,
            row.share_link_id,
            (item as WolkeItem).file,
            shareLink
          );
          return {
            documentId: result.documentId ?? known?.id ?? null,
            version: (item as WolkeItem).file.etag ?? null,
            ingested: !result.skipped && !!result.documentId,
          };
        },
      } satisfies SourceSession<WolkeItem> as SourceSession;
    },
  };
}

type DriveItem = SourceItem & { version: string; mimeType: string };

export interface DriveAdapterDeps {
  token(userId: string): Promise<string>;
  getFile: typeof driveClient.getFile;
  /** Lädt bzw. exportiert eine Datei (Google-Formate als Text) — `googleDriveProvider.read`. */
  read(
    userId: string,
    fileId: string
  ): Promise<{ buffer: Buffer; mimeType: string | null; name?: string }>;
  extractText: typeof extractTextFromFile;
  store: typeof storeExtractedDocument;
}

function defaultDriveDeps(): DriveAdapterDeps {
  return {
    token: (userId) => getNangoAccessToken(userId, 'google'),
    getFile: driveClient.getFile,
    read: async (userId, fileId) => {
      const [root] = await googleDriveProvider.listRoots(userId);
      if (!root) throw new CloudAccessError('reauth', 'Google Drive ist nicht verbunden.');
      return googleDriveProvider.read(root, fileId);
    },
    extractText: extractTextFromFile,
    store: storeExtractedDocument,
  };
}

export function driveAdapter(deps: DriveAdapterDeps = defaultDriveDeps()): SourceAdapter {
  return {
    describeError: driveErrorMessage,
    async open(row) {
      const token = await deps.token(row.user_id);
      const picked = row.picked_files ?? [];
      const items: DriveItem[] = [];
      const kept: PickedCloudFile[] = [];
      for (const pick of picked) {
        try {
          const meta = await guardDriveCall(() => deps.getFile(token, pick.id));
          if (meta.trashed) continue;
          kept.push({ id: meta.id, name: meta.name, mimeType: meta.mimeType });
          items.push({
            key: meta.id,
            name: meta.name,
            lastModified: new Date(meta.modifiedTime).getTime() || 0,
            version: meta.modifiedTime,
            mimeType: meta.mimeType,
          });
        } catch (error) {
          // Gelöscht oder nicht mehr freigegeben: die Datei ist für uns weg.
          if (error instanceof CloudAccessError && error.kind === 'not_found') continue;
          throw error;
        }
      }
      return {
        items,
        pickedFiles: kept,
        async ingest(raw, known) {
          const item = raw as DriveItem;
          if (known && known.v === item.version) {
            return { documentId: known.id, version: item.version, ingested: false };
          }
          if (!isConnectFileSupported('google', item.name, item.mimeType)) {
            return { documentId: known?.id ?? null, version: item.version, ingested: false };
          }
          const download = await guardDriveCall(() => deps.read(row.user_id, item.key));
          const text = await deps.extractText({
            buffer: download.buffer,
            mimetype: download.mimeType ?? item.mimeType,
            originalname: download.name ?? item.name,
            size: download.buffer.length,
          });
          const stored = await deps.store({
            userId: row.user_id,
            existingDocumentId: known?.id ?? null,
            text,
            title: item.name,
            filename: item.name,
            fileSize: download.buffer.length,
            create: {
              sourceType: 'google_drive',
              sourceUrl: `https://drive.google.com/open?id=${item.key}`,
            },
            vectorMetadata: {
              sourceType: 'google_drive',
              title: item.name,
              filename: item.name,
              additionalPayload: { drive_file_id: item.key, last_modified: item.version },
            },
          });
          if (!stored.stored) {
            return { documentId: known?.id ?? null, version: item.version, ingested: false };
          }
          return { documentId: stored.documentId, version: item.version, ingested: true };
        },
      } satisfies SourceSession<DriveItem> as SourceSession;
    },
  };
}

// ── Abgleich ─────────────────────────────────────────────────────────────────

type Query = <T = unknown>(text: string, params?: unknown[]) => Promise<T[]>;

export interface ProjectCloudDeps {
  query: Query;
  adapters: Record<GroupCloudProvider, SourceAdapter>;
  addShare: (groupId: string, userId: string, documentId: string) => Promise<void>;
  removeShare: (groupId: string, documentId: string) => Promise<void>;
  /** Wirft mit dem Satz der Mitgliedsprüfung, wenn `userId` hier nicht teilen darf. */
  assertCanShare: (groupId: string, userId: string) => Promise<unknown>;
  findWolkeLink: (userId: string, url: string) => Promise<{ id: string; label: string | null }>;
  hasGoogleDrive: (userId: string) => Promise<boolean>;
  now: () => number;
}

export function defaultProjectCloudDeps(): ProjectCloudDeps {
  const pg = getPostgresInstance();
  return {
    query: (text, params) => pg.query(text, params) as never,
    adapters: { wolke: wolkeAdapter(), 'google-drive': driveAdapter() },
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
    findWolkeLink: (userId, url) => NextcloudShareManager.findOrSaveShareLink(userId, url),
    hasGoogleDrive: async (userId) => (await googleDriveProvider.listRoots(userId)).length > 0,
    now: Date.now,
  };
}

const SELECT_SOURCE = `SELECT s.*, COALESCE(p.display_name, p.first_name) AS attached_by_name
   FROM group_cloud_sources s
   LEFT JOIN profiles p ON p.id = s.user_id`;

function toIso(value: Date | string | null): string | null {
  if (value == null) return null;
  return value instanceof Date ? value.toISOString() : value;
}

export function toGroupCloudSource(row: SourceRow): GroupCloudSource {
  return {
    id: row.id,
    provider: row.provider,
    name: row.name,
    includeSubfolders: row.include_subfolders,
    fileCount: row.file_count,
    pendingCount: row.pending_count,
    lastSyncedAt: toIso(row.last_synced_at),
    lastError: row.last_error,
    attachedById: row.user_id,
    attachedByName: row.attached_by_name ?? null,
  };
}

export const EMPTY_SUMMARY: GroupCloudSyncSummary = {
  imported: 0,
  removed: 0,
  pending: 0,
  skipped: 0,
  failed: 0,
};

/**
 * Ein Abgleich einer Quelle. Wirft nicht: ein Fehler landet in `last_error`
 * und in der Rückgabe, der Bestand bleibt unberührt. `deadline` ist absolut,
 * damit der stündliche Lauf sein Zeitbudget über alle Quellen teilt.
 */
export async function syncProjectCloudSource(
  row: SourceRow,
  budget: { maxIngest: number; deadline: number },
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<{ summary: GroupCloudSyncSummary; error: string | null }> {
  const summary = { ...EMPTY_SUMMARY };
  const adapter = deps.adapters[row.provider];
  try {
    await deps.assertCanShare(row.group_id, row.user_id);
  } catch (error) {
    const message = `Abgleich pausiert: ${error instanceof Error ? error.message : String(error)}`;
    await deps.query(`UPDATE group_cloud_sources SET last_error = $2 WHERE id = $1`, [
      row.id,
      message,
    ]);
    return { summary, error: message };
  }
  try {
    const session = await adapter.open(row);
    const previous = row.synced_files ?? {};
    // Schon eingelesene Dateien behalten ihren Platz unter der Grenze; neue
    // füllen auf, die neuesten zuerst. Sonst schöbe eine neue Datei eine alte
    // aus dem Fenster, und der Abgleich nähme sie aus dem Projekt, obwohl sie
    // in der Quelle noch liegt.
    const isKnown = (item: SourceItem) => (previous[item.key] ? 1 : 0);
    let items = [...session.items].sort(
      (a, b) => isKnown(b) - isKnown(a) || b.lastModified - a.lastModified
    );
    if (items.length > MAX_SOURCE_FILES) {
      summary.skipped += items.length - MAX_SOURCE_FILES;
      items = items.slice(0, MAX_SOURCE_FILES);
    }

    const next: Record<string, SyncedCloudFile> = {};
    let ingested = 0;
    for (const item of items) {
      const known = previous[item.key];
      const inBudget = ingested < budget.maxIngest && deps.now() < budget.deadline;
      if (!inBudget) {
        // Bekannte Dateien bleiben stehen (eine Änderung holt der nächste Lauf),
        // neue warten.
        if (known) next[item.key] = known;
        else summary.pending += 1;
        continue;
      }
      try {
        const result = await session.ingest(item, known);
        if (result.documentId) {
          next[item.key] = {
            id: result.documentId,
            // Nicht eingelesen heisst: die alte Version gilt weiter.
            v: result.ingested || !known ? result.version : (known.v ?? null),
          };
        } else {
          summary.skipped += 1;
        }
        if (result.ingested) {
          ingested += 1;
          summary.imported += 1;
        }
      } catch (error) {
        log.warn(`[project-cloud] ${row.id}: ${item.name} failed: ${String(error)}`);
        summary.failed += 1;
        if (known) next[item.key] = known;
      }
    }

    const keptIds = new Set(Object.values(next).map((f) => f.id));
    const previousIds = new Set(Object.values(previous).map((f) => f.id));
    for (const id of previousIds) {
      if (keptIds.has(id)) continue;
      await deps.removeShare(row.group_id, id);
      summary.removed += 1;
    }
    for (const id of keptIds) {
      if (!previousIds.has(id)) await deps.addShare(row.group_id, row.user_id, id);
    }

    await deps.query(
      `UPDATE group_cloud_sources
          SET synced_files = $2::jsonb, file_count = $3, pending_count = $4,
              last_synced_at = $5, last_error = NULL,
              picked_files = COALESCE($6::jsonb, picked_files)
        WHERE id = $1`,
      [
        row.id,
        JSON.stringify(next),
        keptIds.size,
        summary.pending,
        new Date(deps.now()),
        session.pickedFiles ? JSON.stringify(session.pickedFiles) : null,
      ]
    );
    return { summary, error: null };
  } catch (error) {
    log.warn(`[project-cloud] ${row.id}: sync failed: ${String(error)}`);
    const message = adapter.describeError(error);
    await deps.query(`UPDATE group_cloud_sources SET last_error = $2 WHERE id = $1`, [
      row.id,
      message,
    ]);
    return { summary, error: message };
  }
}

// ── Türen ────────────────────────────────────────────────────────────────────

async function loadSource(
  groupId: string,
  sourceId: string,
  deps: ProjectCloudDeps
): Promise<SourceRow> {
  const rows = await deps.query<SourceRow>(`${SELECT_SOURCE} WHERE s.id = $1 AND s.group_id = $2`, [
    sourceId,
    groupId,
  ]);
  if (!rows[0]) throw new ProjectCloudSourceError('Quelle nicht gefunden.', 404);
  return rows[0];
}

/** Für Mitglieder; wirft („Du bist nicht Mitglied …"), wenn die Person keines ist. */
export async function listProjectCloudSources(
  groupId: string,
  userId: string,
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<GroupCloudSource[]> {
  await getPostgresAndCheckMembership(groupId, userId);
  const rows = await deps.query<SourceRow>(
    `${SELECT_SOURCE} WHERE s.group_id = $1 ORDER BY s.created_at`,
    [groupId]
  );
  return rows.map(toGroupCloudSource);
}

async function requireAdminWhoCanShare(groupId: string, userId: string, deps: ProjectCloudDeps) {
  await getPostgresAndCheckMembership(groupId, userId, true);
  await deps.assertCanShare(groupId, userId);
}

type SyncOutcome = { source: GroupCloudSource; summary: GroupCloudSyncSummary };

async function runAndReload(
  groupId: string,
  sourceId: string,
  deps: ProjectCloudDeps
): Promise<SyncOutcome> {
  const row = await loadSource(groupId, sourceId, deps);
  const { summary } = await syncProjectCloudSource(
    row,
    { maxIngest: INLINE_BUDGET.maxIngest, deadline: deps.now() + INLINE_BUDGET.ms },
    deps
  );
  return { source: toGroupCloudSource(await loadSource(groupId, sourceId, deps)), summary };
}

/**
 * Wolke-Ordner anhängen und gleich einen ersten, gedeckelten Lauf machen. Der
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
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<SyncOutcome> {
  const { groupId, userId, includeSubfolders } = input;
  await requireAdminWhoCanShare(groupId, userId, deps);

  let link: { id: string; label: string | null };
  try {
    link = await deps.findWolkeLink(userId, input.url);
  } catch {
    throw new ProjectCloudSourceError(
      'Das sieht nicht nach einem Nextcloud-Freigabelink aus (…/s/…).',
      400
    );
  }
  const inserted = await deps.query<{ id: string }>(
    `INSERT INTO group_cloud_sources
        (group_id, user_id, provider, share_link_id, folder_path, name, include_subfolders)
      VALUES ($1, $2, 'wolke', $3, '/', $4, $5)
      ON CONFLICT (group_id, user_id, provider, share_link_id, folder_path) DO NOTHING
      RETURNING id`,
    [
      groupId,
      userId,
      link.id,
      input.name?.trim() || link.label?.trim() || 'Wolke-Ordner',
      includeSubfolders,
    ]
  );
  if (!inserted[0]) {
    throw new ProjectCloudSourceError('Dieser Ordner ist schon im Projekt.', 409);
  }
  return runAndReload(groupId, inserted[0].id, deps);
}

/**
 * Im Picker gewählte Drive-Dateien anhängen. Eine Drive-Quelle je Person und
 * Projekt: eine weitere Auswahl hängt an die bestehende an (ohne Doppel).
 */
export async function attachProjectDriveFiles(
  input: { groupId: string; userId: string; files: PickedCloudFile[] },
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<SyncOutcome> {
  const { groupId, userId } = input;
  await requireAdminWhoCanShare(groupId, userId, deps);
  if (!(await deps.hasGoogleDrive(userId))) {
    throw new ProjectCloudSourceError(
      'Verbinde zuerst Google Drive in den Einstellungen unter Konnektoren.',
      400
    );
  }
  const rows = await deps.query<{ id: string; picked_files: PickedCloudFile[] | null }>(
    `INSERT INTO group_cloud_sources (group_id, user_id, provider, name)
      VALUES ($1, $2, 'google-drive', 'Google Drive')
      ON CONFLICT (group_id, user_id, provider, share_link_id, folder_path)
        DO UPDATE SET provider = EXCLUDED.provider
      RETURNING id, picked_files`,
    [groupId, userId]
  );
  const row = rows[0];
  if (!row) throw new Error('Drive source upsert returned no row');
  const merged = [...(row.picked_files ?? [])];
  for (const file of input.files) {
    if (!merged.some((f) => f.id === file.id)) merged.push(file);
  }
  await deps.query(`UPDATE group_cloud_sources SET picked_files = $2::jsonb WHERE id = $1`, [
    row.id,
    JSON.stringify(merged.slice(0, MAX_SOURCE_FILES)),
  ]);
  return runAndReload(groupId, row.id, deps);
}

/** „Jetzt abgleichen" — jede*r Admin; gelesen wird weiter mit der Verbindung der anhängenden Person. */
export async function syncProjectCloudSourceNow(
  input: { groupId: string; userId: string; sourceId: string },
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<SyncOutcome> {
  await requireAdminWhoCanShare(input.groupId, input.userId, deps);
  return runAndReload(input.groupId, input.sourceId, deps);
}

/** Trennen: die Dateien der Quelle verlassen das Projekt, in der Quelle bleibt alles. */
export async function detachProjectCloudSource(
  input: { groupId: string; userId: string; sourceId: string },
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<void> {
  await getPostgresAndCheckMembership(input.groupId, input.userId, true);
  const row = await loadSource(input.groupId, input.sourceId, deps);
  await deps.query(`DELETE FROM group_cloud_sources WHERE id = $1`, [row.id]);
  for (const id of new Set(Object.values(row.synced_files ?? {}).map((f) => f.id))) {
    await deps.removeShare(row.group_id, id);
  }
}

export interface ProjectCloudRunResult {
  scannedSources: number;
  imported: number;
  removed: number;
  pending: number;
  failedSources: number;
  durationMs: number;
}

/**
 * Der stündliche Lauf (aus `/internal/wolke-watch/run`). Gelöschte und
 * archivierte Projekte ruhen; die ältesten Abgleiche zuerst, damit eine
 * Quelle, die das Zeitbudget nicht mehr bekam, beim nächsten Mal vorne steht.
 */
export async function runAllProjectCloudSources(
  deps: ProjectCloudDeps = defaultProjectCloudDeps()
): Promise<ProjectCloudRunResult> {
  const start = deps.now();
  const deadline = start + WATCH_BUDGET.ms;
  const rows = await deps.query<SourceRow>(
    `SELECT s.* FROM group_cloud_sources s
       JOIN groups g ON g.id = s.group_id
      WHERE g.deleted_at IS NULL AND g.archived_at IS NULL
      ORDER BY s.last_synced_at ASC NULLS FIRST`
  );
  const result: ProjectCloudRunResult = {
    scannedSources: 0,
    imported: 0,
    removed: 0,
    pending: 0,
    failedSources: 0,
    durationMs: 0,
  };
  for (const row of rows) {
    if (deps.now() >= deadline) break;
    result.scannedSources += 1;
    const { summary, error } = await syncProjectCloudSource(
      row,
      { maxIngest: WATCH_BUDGET.maxIngest, deadline },
      deps
    );
    result.imported += summary.imported;
    result.removed += summary.removed;
    result.pending += summary.pending;
    if (error) result.failedSources += 1;
  }
  result.durationMs = deps.now() - start;
  return result;
}
