/**
 * Kollaborative Dokumente (Docs, Präsentationen, Canvas, Tabellen, Boards) als
 * Qdrant-Punkte — durchsuchbar nach Dokument-ID wie hochgeladene Dateien.
 *
 * Wozu: Projekt-Chats suchen die ins Projekt geteilten Dokumente im selben
 * Dokument-Scope wie die Projekt-Dateien (`projectCollabDocs.ts`), statt dass
 * das Modell jedes Dokument ganz lesen muss. `read_artifact` bleibt für das
 * Volllesen.
 *
 * Auslöser: kein Hook in Hocuspocus. Der Dienst schreibt bei jedem Speichern
 * `collaborative_documents.updated_at`; ein Intervall-Worker (wie der
 * Upload-Worker: die Tabelle IST die Warteschlange) nimmt jedes geteilte
 * Dokument, dessen `updated_at` seit `QUIET_PERIOD_MINUTES` ruht und neuer ist
 * als `collab_search_index.checked_at`. Die Ruhefrist entprellt je Dokument
 * (ein Auftrag je Dokument, nie einer je Tastendruck), ein Neustart verliert
 * nichts, und nichts blockiert das Speichern. Frisch geteilte Dokumente ohne
 * Indexzeile sind sofort fällig.
 *
 * Kosten: eine Bearbeitung kostet erst nach der Ruhefrist und nur dann einen
 * Einbettungsaufruf, wenn sich Titel oder Text wirklich geändert haben
 * (Inhalts-Hash); eine Umbenennung ändert den Hash, eine Verschiebung nicht.
 *
 * Eigentümer der Punkte ist `created_by` (wie bei einem Upload der Hochladende);
 * die Zugriffsprüfung liegt im Projekt-Scope, nicht in der Suche.
 */
import { createHash } from 'node:crypto';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import {
  readArtifactContent,
  subtypeToReadKind,
} from '../../routes/chat/services/artifactReader.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { ensureConnected, redisClient } from '../../utils/redis/client.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { COLLAB_SOURCE_TYPE } from '../document-services/collabSourceType.js';
import { chunkAndEmbedText } from '../document-services/DocumentProcessingService/chunkingPipeline.js';
import { getQdrantDocumentService } from '../document-services/DocumentSearchService/index.js';
import { PROJECT_COLLAB_SUBTYPES } from '../groups/projectCollabDocs.js';
import { htmlToStructuredText } from '../scrapers/utils/htmlCleaner.js';

import { getDocumentHtml } from './docContentService.js';

const log = createLogger('CollabSearchIndex');

/** So lange darf ein Dokument nicht bearbeitet worden sein, bevor es neu gelesen wird. */
export const QUIET_PERIOD_MINUTES = 2;

const TICK_INTERVAL_MS = 60_000;
/** Begrenzt einen Durchlauf: jedes Dokument ist ein Einbettungsaufruf. */
const MAX_PER_TICK = 10;

/** Was mit einem Dokument geschah. */
export type CollabIndexResult = 'indexed' | 'unchanged' | 'removed' | 'skipped';

interface DocRow {
  id: string;
  title: string | null;
  subtype: string;
  created_by: string | null;
  started_at: Date;
}

const URL_BY_SUBTYPE: Record<string, (id: string) => string> = {
  boards: (id) => `/boards/${id}`,
  canvas: (id) => `/studio/canvas/${id}`,
};

function sourceUrl(subtype: string, id: string): string {
  return (URL_BY_SUBTYPE[subtype] ?? ((x: string) => `/docs/${x}`))(id);
}

/** Der Text, wie ihn die Leser der Chats sehen; Fliesstext behält Überschriften und Absätze. */
async function readCollabText(row: DocRow & { created_by: string }): Promise<string> {
  const kind = subtypeToReadKind(row.subtype);
  if (kind === 'doc') {
    const { html } = await getDocumentHtml(row.id);
    return htmlToStructuredText(html).trim();
  }
  return ((await readArtifactContent({ id: row.id, kind, userId: row.created_by })) ?? '').trim();
}

/** Punkte und Indexzeile eines Dokuments entfernen (Papierkorb, Purge). */
export async function removeCollabIndex(docId: string): Promise<void> {
  // Punkte zuerst: scheitert das, bleibt die Zeile und der Worker versucht es erneut.
  await getQdrantDocumentService().deleteDocumentVectors(docId, null);
  await getPostgresInstance().query(
    'DELETE FROM collab_search_index WHERE document_id = $1::uuid',
    [docId]
  );
}

/**
 * Das Dokument in Qdrant auf den heutigen Stand bringen. Idempotent: ein
 * unveränderter Inhalt kostet einen Lesevorgang und keinen Einbettungsaufruf.
 */
export async function indexCollabDocument(docId: string): Promise<CollabIndexResult> {
  const db = getPostgresInstance();
  const row = (await db.queryOne(
    `SELECT id, title, COALESCE(document_subtype, 'docs') AS subtype, created_by, now() AS started_at
       FROM collaborative_documents
      WHERE id = $1::uuid AND deleted_at IS NULL AND is_deleted = false`,
    [docId]
  )) as DocRow | null;

  if (!row) {
    // Getrashed oder weg: nie indexieren, Vorhandenes entfernen.
    await removeCollabIndex(docId);
    return 'removed';
  }
  if (!row.created_by || !PROJECT_COLLAB_SUBTYPES.includes(row.subtype as never)) return 'skipped';

  const title = (row.title ?? '').trim() || '(ohne Titel)';
  const text = await readCollabText({ ...row, created_by: row.created_by });

  const hash = createHash('sha256').update(`${title}\n${text}`).digest('hex');
  const known = (await db.queryOne(
    'SELECT content_hash FROM collab_search_index WHERE document_id = $1::uuid',
    [docId]
  )) as { content_hash: string } | null;
  if (known?.content_hash === hash) {
    await db.query('UPDATE collab_search_index SET checked_at = $2 WHERE document_id = $1::uuid', [
      docId,
      row.started_at,
    ]);
    return text ? 'unchanged' : 'removed';
  }

  const qdrant = getQdrantDocumentService();
  let chunks: unknown[] = [];
  if (text) {
    // Erst einbetten, dann ersetzen: ein Ausfall des Anbieters lässt den alten Stand stehen.
    const embedded = await chunkAndEmbedText(text, { title });
    chunks = embedded.chunks;
    await qdrant.deleteDocumentVectors(docId, null);
    await qdrant.storeDocumentVectors(row.created_by, docId, embedded.chunks, embedded.embeddings, {
      sourceType: COLLAB_SOURCE_TYPE,
      title,
      filename: title,
      additionalPayload: { collab_subtype: row.subtype, source_url: sourceUrl(row.subtype, docId) },
    });
  } else {
    // Leer: Punkte weg, die Indexzeile aber bleibt (0 Chunks, `checked_at`). Ohne
    // Zeile gälte das Dokument in `findDueCollabDocuments` sofort wieder als fällig
    // und würde bei jedem Tick neu gelesen und gelöscht.
    await qdrant.deleteDocumentVectors(docId, null);
  }
  await db.query(
    `INSERT INTO collab_search_index (document_id, content_hash, chunk_count, checked_at, indexed_at)
     VALUES ($1::uuid, $2, $3, $4, now())
     ON CONFLICT (document_id) DO UPDATE
       SET content_hash = EXCLUDED.content_hash, chunk_count = EXCLUDED.chunk_count,
           checked_at = EXCLUDED.checked_at, indexed_at = EXCLUDED.indexed_at`,
    [docId, hash, chunks.length, row.started_at]
  );
  if (!text) return 'removed';
  log.info(`Indexed ${row.subtype} ${docId} (${chunks.length} chunks)`);
  return 'indexed';
}

/**
 * Geteilte, lebende Dokumente, die einen neuen Index brauchen: nie indexiert
 * oder seit der letzten Prüfung bearbeitet, und seit `quietMinutes` unberührt.
 * Nur ins Projekt geteilte Dokumente — der Index kostet Einbettungen, und nur
 * Projekt-Chats suchen darin.
 */
export async function findDueCollabDocuments(
  quietMinutes: number,
  limit: number
): Promise<string[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT cd.id
       FROM collaborative_documents cd
       LEFT JOIN collab_search_index ci ON ci.document_id = cd.id
      WHERE cd.deleted_at IS NULL AND cd.is_deleted = false
        AND cd.created_by IS NOT NULL
        AND COALESCE(cd.document_subtype, 'docs') = ANY($1::text[])
        AND cd.updated_at < now() - ($2::int * interval '1 minute')
        AND (ci.document_id IS NULL OR ci.checked_at < cd.updated_at)
        AND EXISTS (
          SELECT 1 FROM group_content_shares gcs
            JOIN groups g ON g.id = gcs.group_id AND g.deleted_at IS NULL
           WHERE gcs.content_type = 'collaborative_documents' AND gcs.content_id = cd.id::text)
      ORDER BY cd.updated_at ASC
      LIMIT $3`,
    [[...PROJECT_COLLAB_SUBTYPES], quietMinutes, limit]
  )) as { id: string }[];
  return rows.map((r) => r.id);
}

/** Indexzeilen getrashter Dokumente — ihre Punkte müssen weg (Fallback für jeden Trash-Weg). */
async function findTrashedIndexed(limit: number): Promise<string[]> {
  const rows = (await getPostgresInstance().query(
    `SELECT ci.document_id AS id
       FROM collab_search_index ci
       JOIN collaborative_documents cd ON cd.id = ci.document_id
      WHERE cd.deleted_at IS NOT NULL OR cd.is_deleted = true
      LIMIT $1`,
    [limit]
  )) as { id: string }[];
  return rows.map((r) => r.id);
}

const CLAIM_TTL_S = 600;

/**
 * Je Dokument nur ein Cluster-Worker zugleich: sonst betten zwei Worker dasselbe
 * Dokument doppelt ein. Ohne Redis läuft der Durchlauf ohne Claim weiter (die
 * Punkt-IDs sind deterministisch, ein Doppellauf kostet nur Geld).
 */
async function claim(docId: string): Promise<boolean> {
  try {
    await ensureConnected();
    return Boolean(
      await redisClient.set(`collab-index:claim:${docId}`, '1', { NX: true, EX: CLAIM_TTL_S })
    );
  } catch {
    return true;
  }
}

async function release(docId: string): Promise<void> {
  try {
    await redisClient.del(`collab-index:claim:${docId}`);
  } catch {
    // the claim expires on its own
  }
}

/** Ein Durchlauf; `quietMinutes = 0` für das Nachindexieren per Skript. */
export async function runCollabIndexPass(
  quietMinutes = QUIET_PERIOD_MINUTES,
  limit = MAX_PER_TICK
): Promise<{ processed: number; results: Record<CollabIndexResult, number> }> {
  const results: Record<CollabIndexResult, number> = {
    indexed: 0,
    unchanged: 0,
    removed: 0,
    skipped: 0,
  };
  const ids = [
    ...new Set([
      ...(await findTrashedIndexed(limit)),
      ...(await findDueCollabDocuments(quietMinutes, limit)),
    ]),
  ];
  for (const id of ids) {
    if (!(await claim(id))) continue;
    try {
      results[await indexCollabDocument(id)]++;
    } catch (err) {
      // Beim nächsten Durchlauf wieder fällig, weil checked_at nicht fortgeschrieben wurde.
      reportBackgroundError(err, { job: 'collab-search-index', docId: id });
    } finally {
      await release(id);
    }
  }
  return { processed: ids.length, results };
}

const worker = createIntervalWorker({
  name: 'CollabSearchIndex',
  intervalMs: TICK_INTERVAL_MS,
  tick: async () => {
    await runCollabIndexPass();
  },
});

export function startCollabSearchIndexWorker(): void {
  worker.start();
}
