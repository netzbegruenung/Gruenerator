/**
 * Liest Datum, Datumsart und Gremium aus dem Kopf fertig verarbeiteter
 * Dokumente und legt sie in `documents.metadata.doc_meta` ab.
 *
 * Die `documents`-Tabelle ist die Queue, wie beim Ingest-Worker: geclaimt wird
 * mit `FOR UPDATE SKIP LOCKED`, also darf jeder Cluster-Prozess mitlaufen.
 *
 * WELCHE Dokumente: neue immer — angelegt ab dem Zeitpunkt, den die Migration
 * in `document_meta_boundary` festhält. Fehlt die Grenze (Migration nicht
 * gelaufen, zurückgerollt, oder ein Cluster-Prozess war schneller als sie),
 * claimt der Worker NICHTS: die Grenze hängt bewusst an keinem Spalten-Default,
 * den `syncSchemaColumns` aus schema.sql über den ganzen Bestand legen könnte.
 * Bestand und Dokumente einer älteren `DOC_META_VERSION` nur mit
 * `DOCUMENT_META_BACKFILL` — erst nach einem Trockenlauf
 * (`scripts/document-meta-backfill.ts`).
 *
 * Nur gesetzte Zeilen: `status='completed'` steht in mehreren Ingest-Pfaden,
 * BEVOR die Vektoren geschrieben sind. Deshalb erst nach `SETTLE_MS` Ruhe, und
 * vor dem Schreiben muss Qdrant mindestens `vector_count` Punkte tragen — sonst
 * wirft der Lauf und der Claim kommt wieder.
 *
 * Takt: höchstens `MAX_PER_TICK` Dokumente pro Minute UND Prozess — clusterweit
 * also das Vielfache der Prozesszahl. Der Modell-Rückfall läuft auf GreenPT,
 * dessen 600 Anfragen/15 min pro Konto mit Rerank und Planer geteilt sind.
 *
 * Ein Modell fragt nur `extractDocumentMeta`, und nur mit Einwilligung der
 * Eigentümer*in. Die Heuristik ist lokal und läuft immer.
 *
 * Qdrant vor Postgres: scheitert die Nutzlast, bleibt `doc_meta` ungeschrieben
 * und der Claim kommt nach `STALE_CLAIM_MS` zurück. Andersherum stünde das
 * Datum im Notebook, während die Suche es nie sähe.
 */
import { env } from '../../config/env.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getQdrantInstance } from '../../database/services/QdrantService/QdrantService.js';
import { hasAiConsent } from '../../middleware/requireAiConsent.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { reportBackgroundError } from '../../utils/reportBackgroundError.js';
import { aiObject } from '../ai/generate.js';
import { getQdrantDocumentService } from '../document-services/DocumentSearchService/index.js';

import { type HeaderMeta } from './headerMeta.js';
import { LLM_INPUT_CHARS, extractDocumentMeta } from './llmMeta.js';

const log = createLogger('DocumentMeta');

/** Bei jeder Änderung an Heuristik oder Prompt hochzählen — der Backfill liest dann neu. */
export const DOC_META_VERSION = 1;

const TICK_INTERVAL_MS = 60_000;
const MAX_PER_TICK = 10;
const MAX_ATTEMPTS = 3;
const STALE_CLAIM_MS = 10 * 60 * 1000;
/** So lange muss eine Zeile unverändert sein, bevor sie als fertig gilt. */
const SETTLE_MS = 2 * 60 * 1000;

const MIRRORED_KINDS: ReadonlySet<string> = new Set(['beschluss', 'published', 'stand']);

export type TextOrigin = 'markdown' | 'chunks' | 'preview' | 'none';

export interface DocMetaRecord extends HeaderMeta {
  version: number;
  extractedAt: string;
  textOrigin: TextOrigin;
  /** Was nach `metadata.published_at` gespiegelt wurde — null, wenn nichts. */
  publishedAt: string | null;
}

export interface ClaimedDocMetaRow {
  id: string;
  user_id: string;
  title: string | null;
  filename: string | null;
  head: string | null;
  content_preview: string | null;
  existing_published_at: string | null;
  previous_mirror: string | null;
  vector_count: number | null;
}

export interface DocMetaDeps {
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
  getChunks: (
    userId: string,
    documentId: string
  ) => Promise<{ success: boolean; chunks: Array<{ index: number; text: string }> }>;
  setPayload: (
    target: { documentId: string; userId: string },
    payload: Record<string, string | null>
  ) => Promise<void>;
  countPoints: (documentId: string, userId: string) => Promise<number>;
  hasAiConsent: (userId: string) => Promise<boolean>;
  aiObject: typeof aiObject;
  backfill: boolean;
  now?: () => Date;
}

export const CLAIM_SQL = `UPDATE documents d
    SET metadata = COALESCE(d.metadata, '{}'::jsonb) || jsonb_build_object(
          'doc_meta_claim', jsonb_build_object(
            'at', NOW(),
            'attempts', COALESCE((d.metadata->'doc_meta_claim'->>'attempts')::int, 0) + 1))
  WHERE d.id = (
    SELECT id
      FROM documents
     WHERE status = 'completed'
       AND user_id IS NOT NULL
       AND (
             (
               $5::timestamptz IS NOT NULL
               AND created_at >= $5::timestamptz
               AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doc_meta')
             )
             OR ($2::boolean AND COALESCE((metadata->'doc_meta'->>'version')::int, 0) <> $1)
           )
       AND GREATEST(created_at, updated_at) < NOW() - ($6::text || ' milliseconds')::interval
       AND COALESCE((metadata->'doc_meta_claim'->>'attempts')::int, 0) < $3
       AND (
             metadata->'doc_meta_claim' IS NULL
             OR (metadata->'doc_meta_claim'->>'at')::timestamptz
                < NOW() - ($4::text || ' milliseconds')::interval
           )
     ORDER BY created_at DESC
       FOR UPDATE SKIP LOCKED
     LIMIT 1
  )
  RETURNING d.id, d.user_id, d.title, d.filename,
            LEFT(d.markdown_content, ${LLM_INPUT_CHARS}) AS head,
            d.metadata->>'content_preview' AS content_preview,
            d.metadata->>'published_at' AS existing_published_at,
            d.metadata->'doc_meta'->>'publishedAt' AS previous_mirror,
            d.vector_count`;

/**
 * Atomarer jsonb-Merge — nie Lesen-Ändern-Schreiben: der Tag-Schreiber und der
 * Ingest schreiben dieselbe Spalte. `published_at` nur, wo keines steht oder
 * das stehende unser eigener früherer Spiegel ist; `$4` räumt diesen eigenen
 * Spiegel ab, wenn die neue Version kein Datum mehr findet.
 */
export const STORE_SQL = `UPDATE documents
    SET metadata = (
          CASE
            WHEN $4::boolean
             AND metadata->>'published_at' = metadata->'doc_meta'->>'publishedAt'
            THEN COALESCE(metadata, '{}'::jsonb) - 'published_at'
            ELSE COALESCE(metadata, '{}'::jsonb)
          END - 'doc_meta_claim')
          || jsonb_build_object('doc_meta', $2::jsonb)
          || CASE
               WHEN $3::text IS NOT NULL
                AND (
                      NOT (COALESCE(metadata, '{}'::jsonb) ? 'published_at')
                      OR metadata->>'published_at' = metadata->'doc_meta'->>'publishedAt'
                    )
               THEN jsonb_build_object('published_at', $3::text)
               ELSE '{}'::jsonb
             END
  WHERE id = $1`;

async function loadHead(
  row: ClaimedDocMetaRow,
  deps: DocMetaDeps
): Promise<{ text: string; origin: TextOrigin }> {
  if (row.head?.trim()) return { text: row.head, origin: 'markdown' };
  try {
    const result = await deps.getChunks(row.user_id, row.id);
    if (result.success && result.chunks.length > 0) {
      let text = '';
      for (const chunk of [...result.chunks].sort((a, b) => a.index - b.index)) {
        if (text.length >= LLM_INPUT_CHARS) break;
        text += (text ? '\n\n' : '') + chunk.text;
      }
      return { text: text.slice(0, LLM_INPUT_CHARS), origin: 'chunks' };
    }
  } catch (err) {
    log.warn(`Chunks für ${row.id} nicht lesbar: ${(err as Error).message}`);
  }
  if (row.content_preview?.trim()) return { text: row.content_preview, origin: 'preview' };
  return { text: '', origin: 'none' };
}

/** Berechnet `doc_meta` für ein geclaimtes Dokument — ohne zu schreiben. */
export async function computeDocMeta(
  row: ClaimedDocMetaRow,
  deps: DocMetaDeps
): Promise<{ record: DocMetaRecord; mirror: string | null; clearMirror: boolean }> {
  const now = deps.now?.() ?? new Date();
  const [{ text, origin }, profile, aiAllowed] = await Promise.all([
    loadHead(row, deps),
    deps.db.query('SELECT locale FROM profiles WHERE id = $1', [row.user_id]) as Promise<
      Array<{ locale: string | null }>
    >,
    // Ein Lesefehler ist hier ein Nein: im Hintergrund wartet niemand.
    deps.hasAiConsent(row.user_id).catch(() => false),
  ]);
  if (origin === 'none') {
    // Kein Text ist kein Befund — meist ist der Ingest noch nicht durch.
    throw new Error(`Kein Text für ${row.id} ladbar — später erneut`);
  }
  const meta = await extractDocumentMeta(
    { text, filename: row.filename, locale: profile[0]?.locale ?? null, aiAllowed, now },
    deps
  );
  // Nur taggenau: `published_at` sortiert und filtert Suchtreffer, ein
  // „März 2024" als 2024-03-01 wäre dort ein erfundener Tag.
  const candidate =
    meta.date && meta.dateKind && MIRRORED_KINDS.has(meta.dateKind) && meta.precision === 'day'
      ? meta.date
      : null;
  const mayMirror =
    candidate !== null &&
    (row.existing_published_at === null || row.existing_published_at === row.previous_mirror);
  const record: DocMetaRecord = {
    ...meta,
    version: DOC_META_VERSION,
    extractedAt: now.toISOString(),
    textOrigin: origin,
    publishedAt: mayMirror ? candidate : null,
  };
  const clearMirror =
    candidate === null &&
    row.previous_mirror !== null &&
    row.existing_published_at === row.previous_mirror;
  return { record, mirror: record.publishedAt, clearMirror };
}

async function processDocument(row: ClaimedDocMetaRow, deps: DocMetaDeps): Promise<void> {
  const points = await deps.countPoints(row.id, row.user_id);
  if (points === 0 || points < (row.vector_count ?? 0)) {
    throw new Error(
      `Vektoren für ${row.id} noch nicht vollständig (${points}/${row.vector_count ?? 0})`
    );
  }
  const { record, mirror, clearMirror } = await computeDocMeta(row, deps);

  const payload: Record<string, string | null> = {};
  if (mirror) payload.published_at = mirror;
  if (clearMirror) payload.published_at = null;
  if (record.gremium) payload.gremium = record.gremium;
  if (Object.keys(payload).length > 0) {
    await deps.setPayload({ documentId: row.id, userId: row.user_id }, payload);
  }

  await deps.db.query(STORE_SQL, [row.id, JSON.stringify(record), record.publishedAt, clearMirror]);
}

let draining = false;

/**
 * Die Grenze zwischen Bestand und neu, wie die Migration sie gesetzt hat — oder
 * null, wenn Tabelle oder Zeile fehlen. Null heisst: kein Neu-Zweig.
 */
async function readBoundary(deps: DocMetaDeps): Promise<string | null> {
  try {
    const rows = (await deps.db.query(
      'SELECT since FROM document_meta_boundary WHERE id = 1'
    )) as Array<{ since: Date | string | null }>;
    const since = rows[0]?.since ?? null;
    return since instanceof Date ? since.toISOString() : since;
  } catch {
    return null;
  }
}

export async function drainDocMetaQueue(
  deps: DocMetaDeps = defaultDeps(),
  opts: { maxDocs?: number } = {}
): Promise<number> {
  if (draining) return 0;
  draining = true;
  let processed = 0;
  try {
    const boundary = await readBoundary(deps);
    if (boundary === null && !deps.backfill) {
      log.debug('Keine Grenze aus der Migration — nichts zu tun');
      return 0;
    }
    const maxDocs = opts.maxDocs ?? MAX_PER_TICK;
    while (processed < maxDocs) {
      const rows = (await deps.db.query(CLAIM_SQL, [
        DOC_META_VERSION,
        deps.backfill,
        MAX_ATTEMPTS,
        String(STALE_CLAIM_MS),
        boundary,
        String(SETTLE_MS),
      ])) as ClaimedDocMetaRow[];
      const row = rows[0];
      if (!row) break;
      processed++;
      try {
        await processDocument(row, deps);
      } catch (err) {
        // Der Claim bleibt stehen und läuft nach STALE_CLAIM_MS erneut, bis
        // MAX_ATTEMPTS — ein Dokument, das immer scheitert, hält die Queue nicht auf.
        reportBackgroundError(err, { job: 'document-meta', docId: row.id, userId: row.user_id });
      }
    }
  } finally {
    draining = false;
  }
  if (processed > 0) log.info(`${processed} Dokument(e) auf Kopfdaten gelesen`);
  return processed;
}

export function defaultDeps(): DocMetaDeps {
  const db = getPostgresInstance();
  return {
    db: { query: (sql, params) => db.query(sql, params) },
    getChunks: (userId, documentId) =>
      getQdrantDocumentService().getDocumentChunks(userId, documentId),
    setPayload: async ({ documentId, userId }, payload) => {
      const qdrant = getQdrantInstance();
      await qdrant.init();
      if (!qdrant.client) throw new Error('Qdrant nicht verfügbar');
      await qdrant.client.setPayload('documents', {
        payload,
        filter: {
          must: [
            { key: 'user_id', match: { value: userId } },
            { key: 'document_id', match: { value: documentId } },
          ],
        },
        wait: true,
      });
    },
    countPoints: async (documentId, userId) => {
      const qdrant = getQdrantInstance();
      await qdrant.init();
      if (!qdrant.client) throw new Error('Qdrant nicht verfügbar');
      const result = await qdrant.client.count('documents', {
        filter: {
          must: [
            { key: 'user_id', match: { value: userId } },
            { key: 'document_id', match: { value: documentId } },
          ],
        },
        exact: true,
      });
      return result.count;
    },
    hasAiConsent: (userId) => hasAiConsent(userId, { failClosed: true }),
    aiObject,
    backfill: env.DOCUMENT_META_BACKFILL,
  };
}

const worker = createIntervalWorker({
  name: 'DocumentMeta',
  intervalMs: TICK_INTERVAL_MS,
  initialDelayMs: 2 * 60_000,
  tick: async () => {
    await drainDocMetaQueue();
  },
});

export function startDocumentMetaWorker(): void {
  worker.start();
}

export function stopDocumentMetaWorker(): void {
  worker.stop();
}
