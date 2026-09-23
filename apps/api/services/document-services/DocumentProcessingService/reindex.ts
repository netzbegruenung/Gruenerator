/**
 * „Neu indexieren" für Quellen, deren Original noch erreichbar ist.
 *
 * Kein eigenes Jobsystem: die `documents`-Tabelle ist die Warteschlange (siehe
 * `documentIngestWorker.ts`). Das Neu-Indexieren setzt die Zeile nur zurück auf
 * `uploaded` und merkt sich in `metadata.reindex_origin`, woher das Original
 * kommt; der Worker lädt die Wolke-Datei dann in `processUploadedDocument`
 * selbst herunter und fährt denselben Weg wie ein
 * Upload: Extraktion mit Seitenmarken, Zerlegen, Punkte ersetzen. Die
 * Dokument-ID bleibt, damit auch Notebook-Mitgliedschaft, Tags und Metadaten.
 *
 * Nur Wolke-Dateien (siehe `reindexOrigin.ts`, warum nicht URL/WordPress).
 * Ein Upload ohne erreichbares Original wird NICHT eingereiht: die Datei ist
 * nach der Verarbeitung gelöscht (`fileProcessing.ts`), und ein „Neu
 * indexieren" aus dem gespeicherten Text brächte keine Seitenzahlen, würde
 * aber so aussehen.
 */
import { getPostgresInstance } from '../../../database/services/PostgresService.js';
import { hasAiConsent } from '../../../middleware/requireAiConsent.js';

import { kickIngestWorker } from './documentIngestWorker.js';
import { reindexOrigin, type ReindexOrigin, type ReindexRow } from './reindexOrigin.js';

import type { NotebookAccess } from '../../../routes/notebook/notebookAccess.js';

export const REINDEX_UNAVAILABLE_MESSAGE = 'Original nicht mehr vorhanden — bitte neu hochladen.';
export const REINDEX_QUEUED_MESSAGE = 'Wird neu indexiert.';

const IN_FLIGHT = new Set(['uploaded', 'processing']);

export type ReindexDocumentResult =
  | { status: 'queued'; message: string }
  | { status: 'unavailable'; message: string }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'consent_missing' };

export interface ReindexDeps {
  db: { query: <T>(sql: string, params: unknown[]) => Promise<T[]> };
  access: (notebookId: string, userId: string) => Promise<NotebookAccess>;
  isInNotebook: (notebookId: string, documentId: string) => Promise<boolean>;
  collectionDocumentIds: (notebookId: string) => Promise<string[]>;
  hasAiConsent: (userId: string) => Promise<boolean>;
  kick: () => void;
}

async function defaultDeps(): Promise<ReindexDeps> {
  const { checkNotebookAccess } = await import('../../../routes/notebook/notebookAccess.js');
  const { NotebookQdrantHelper } =
    await import('../../../database/services/NotebookQdrantHelper.js');
  const helper = new NotebookQdrantHelper();
  const postgres = getPostgresInstance();
  return {
    db: {
      query: async <T>(sql: string, params: unknown[]) =>
        (await postgres.query(sql, params)) as T[],
    },
    access: checkNotebookAccess,
    isInNotebook: (notebookId, documentId) => helper.isDocumentInCollection(notebookId, documentId),
    collectionDocumentIds: async (notebookId) =>
      (await helper.getCollectionDocuments(notebookId, { rethrow: true })).map(
        (d) => d.document_id
      ),
    hasAiConsent,
    kick: kickIngestWorker,
  };
}

const ROW_COLUMNS =
  'id, user_id, filename, status, wolke_share_link_id, wolke_file_path, vector_count';

/**
 * Setzt eingereihte Zeilen zurück auf `uploaded`. Die Bedingung auf den Status
 * macht es idempotent: eine Zeile, die schon läuft, wird nicht noch einmal
 * gezählt, und zwei Klicks hintereinander reihen sie nur einmal ein.
 */
async function enqueue(
  deps: ReindexDeps,
  rows: ReadonlyArray<{ id: string; origin: ReindexOrigin }>
): Promise<void> {
  if (rows.length === 0) return;
  for (const { id, origin } of rows) {
    await deps.db.query(
      `UPDATE documents
          SET status = 'uploaded',
              processing_attempts = 0,
              metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
                'reindex_origin', $2::text,
                'processing_error', NULL,
                -- War die Quelle vorher durchsuchbar? Nur dann darf ein
                -- gescheiterter Lauf auf die alte Fassung zurückfallen.
                'reindex_prev_searchable',
                  (COALESCE(status, '') = 'completed' AND COALESCE(vector_count, 0) > 0),
                -- Reihenfolge in der Warteschlange: eingereiht jetzt, nicht
                -- beim ersten Upload — sonst überholt es frische Uploads.
                'queued_at', NOW()
              )
        WHERE id = $1 AND COALESCE(status, '') NOT IN ('uploaded', 'processing')`,
      [id, origin.kind]
    );
  }
  deps.kick();
}

/**
 * Eigentümer*in darf immer; wer es nicht ist, braucht Schreibrecht auf ein
 * Notebook, das die Quelle enthält — dieselbe Regel wie beim Entfernen.
 */
export async function reindexDocument(
  documentId: string,
  userId: string,
  opts: { notebookId?: string | null } = {},
  injected?: ReindexDeps
): Promise<ReindexDocumentResult> {
  const deps = injected ?? (await defaultDeps());
  const rows = await deps.db.query<ReindexRow>(
    `SELECT ${ROW_COLUMNS} FROM documents WHERE id = $1`,
    [documentId]
  );
  const row = rows[0];
  if (!row) return { status: 'not_found' };

  if (row.user_id !== userId) {
    if (!opts.notebookId) return { status: 'forbidden' };
    const access = await deps.access(opts.notebookId, userId);
    if (!access.exists || !access.canRead) return { status: 'not_found' };
    if (!access.canEdit) return { status: 'forbidden' };
    if (!(await deps.isInNotebook(opts.notebookId, documentId))) return { status: 'not_found' };
  }

  const origin = reindexOrigin(row);
  if (!origin) return { status: 'unavailable', message: REINDEX_UNAVAILABLE_MESSAGE };

  if (row.status && IN_FLIGHT.has(row.status)) {
    return { status: 'queued', message: REINDEX_QUEUED_MESSAGE };
  }

  // Wie beim Upload: wer auslöst UND wem die Daten gehören, müssen eingewilligt
  // haben — der Worker prüft die Eigentümer*in ein zweites Mal.
  const owner = row.user_id ?? userId;
  const consenters = owner === userId ? [userId] : [userId, owner];
  for (const id of consenters) {
    if (!(await deps.hasAiConsent(id))) return { status: 'consent_missing' };
  }

  await enqueue(deps, [{ id: row.id, origin }]);
  return { status: 'queued', message: REINDEX_QUEUED_MESSAGE };
}

export type ReindexNotebookResult =
  | { status: 'ok'; queued: string[]; unavailable: number; consentMissing: number }
  | { status: 'not_found' }
  | { status: 'forbidden' }
  | { status: 'consent_missing' };

/** Alle erreichbaren Quellen eines Notebooks einreihen. */
export async function reindexNotebookSources(
  collectionId: string,
  userId: string,
  injected?: ReindexDeps
): Promise<ReindexNotebookResult> {
  const deps = injected ?? (await defaultDeps());
  const access = await deps.access(collectionId, userId);
  if (!access.exists || !access.canRead) return { status: 'not_found' };
  if (!access.canEdit) return { status: 'forbidden' };
  if (!(await deps.hasAiConsent(userId))) return { status: 'consent_missing' };

  const ids = await deps.collectionDocumentIds(collectionId);
  if (ids.length === 0) return { status: 'ok', queued: [], unavailable: 0, consentMissing: 0 };

  const rows = await deps.db.query<ReindexRow>(
    `SELECT ${ROW_COLUMNS} FROM documents WHERE id = ANY($1)`,
    [ids]
  );

  const consent = new Map<string, boolean>([[userId, true]]);
  const toEnqueue: Array<{ id: string; origin: ReindexOrigin }> = [];
  const queued: string[] = [];
  let unavailable = 0;
  let consentMissing = 0;

  for (const row of rows) {
    const origin = reindexOrigin(row);
    if (!origin) {
      unavailable++;
      continue;
    }
    if (row.status && IN_FLIGHT.has(row.status)) {
      queued.push(row.id);
      continue;
    }
    const owner = row.user_id ?? userId;
    if (!consent.has(owner)) consent.set(owner, await deps.hasAiConsent(owner));
    if (!consent.get(owner)) {
      consentMissing++;
      continue;
    }
    toEnqueue.push({ id: row.id, origin });
    queued.push(row.id);
  }

  await enqueue(deps, toEnqueue);
  return { status: 'ok', queued, unavailable, consentMissing };
}
