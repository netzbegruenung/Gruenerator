/**
 * Liest Datum, Datumsart und Gremium aus dem Kopf fertig verarbeiteter
 * Dokumente und legt sie in `documents.metadata.doc_meta` ab.
 *
 * Die `documents`-Tabelle ist die Queue, wie beim Ingest-Worker: geclaimt wird
 * mit `FOR UPDATE SKIP LOCKED`, also darf jeder Cluster-Prozess mitlaufen.
 *
 * WELCHE Dokumente: neue immer (`doc_meta_auto` ist für jede Zeile gesetzt,
 * die nach der Migration angelegt wurde, und für keine davor). Bestand und
 * Dokumente einer älteren `DOC_META_VERSION` nur mit `DOCUMENT_META_BACKFILL`
 * — erst nach einem Trockenlauf (`scripts/document-meta-backfill.ts`).
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
}

export interface DocMetaDeps {
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> };
  getChunks: (
    userId: string,
    documentId: string
  ) => Promise<{ success: boolean; chunks: Array<{ index: number; text: string }> }>;
  setPayload: (
    target: { documentId: string; userId: string },
    payload: Record<string, string>
  ) => Promise<void>;
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
             (doc_meta_auto AND NOT (COALESCE(metadata, '{}'::jsonb) ? 'doc_meta'))
             OR ($2::boolean AND COALESCE((metadata->'doc_meta'->>'version')::int, 0) <> $1)
           )
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
            d.metadata->'doc_meta'->>'publishedAt' AS previous_mirror`;

/**
 * Atomarer jsonb-Merge — nie Lesen-Ändern-Schreiben: der Tag-Schreiber und der
 * Ingest schreiben dieselbe Spalte. `published_at` nur, wo keines steht oder
 * das stehende unser eigener früherer Spiegel ist.
 */
export const STORE_SQL = `UPDATE documents
    SET metadata = (COALESCE(metadata, '{}'::jsonb) - 'doc_meta_claim')
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
): Promise<{ record: DocMetaRecord; mirror: string | null }> {
  const now = deps.now?.() ?? new Date();
  const [{ text, origin }, profile, aiAllowed] = await Promise.all([
    loadHead(row, deps),
    deps.db.query('SELECT locale FROM profiles WHERE id = $1', [row.user_id]) as Promise<
      Array<{ locale: string | null }>
    >,
    deps.hasAiConsent(row.user_id),
  ]);
  const meta = await extractDocumentMeta(
    { text, filename: row.filename, locale: profile[0]?.locale ?? null, aiAllowed, now },
    deps
  );
  const candidate =
    meta.date && meta.dateKind && MIRRORED_KINDS.has(meta.dateKind) ? meta.date : null;
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
  return { record, mirror: record.publishedAt };
}

async function processDocument(row: ClaimedDocMetaRow, deps: DocMetaDeps): Promise<void> {
  const { record, mirror } = await computeDocMeta(row, deps);

  const payload: Record<string, string> = {};
  if (mirror) payload.published_at = mirror;
  if (record.gremium) payload.gremium = record.gremium;
  if (Object.keys(payload).length > 0) {
    await deps.setPayload({ documentId: row.id, userId: row.user_id }, payload);
  }

  await deps.db.query(STORE_SQL, [row.id, JSON.stringify(record), record.publishedAt]);
}

let draining = false;

export async function drainDocMetaQueue(deps: DocMetaDeps = defaultDeps()): Promise<number> {
  if (draining) return 0;
  draining = true;
  let processed = 0;
  try {
    while (processed < MAX_PER_TICK) {
      const rows = (await deps.db.query(CLAIM_SQL, [
        DOC_META_VERSION,
        deps.backfill,
        MAX_ATTEMPTS,
        String(STALE_CLAIM_MS),
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
    hasAiConsent,
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
