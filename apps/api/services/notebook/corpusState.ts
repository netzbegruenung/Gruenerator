/**
 * Readiness of a set of documents — "is this notebook actually answerable?".
 *
 * Lives apart from NotebookQAService because two callers need it for opposite
 * reasons: QA asks after an empty result (to explain *why* nothing was found)
 * and pays for a Qdrant probe; the collection list asks for every notebook on
 * every page load and must not. Hence the split between the pure classification
 * and the probing inspection.
 */
import { deriveIndexingState } from '@gruenerator/contracts';

import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createLogger } from '../../utils/logger.js';
import { DocumentSearchService } from '../document-services/index.js';

const log = createLogger('notebook:corpusState');

/**
 * Built on first use, not at import time. The collection list imports this
 * module only for the pure `summarizeDocumentRows` and must not drag a Qdrant
 * client in behind it — constructing one up here made merely importing the
 * module fail wherever the search service is stubbed.
 */
let searchService: DocumentSearchService | null = null;
function getSearchService(): DocumentSearchService {
  searchService ??= new DocumentSearchService();
  return searchService;
}

export interface CorpusDocSummary {
  id: string;
  title: string | null;
}

export interface CorpusStateInspection {
  state: 'indexing' | 'stale' | 'failed' | 'ready';
  indexing: CorpusDocSummary[];
  failed: CorpusDocSummary[];
  /**
   * Postgres calls them finished, Qdrant has no points for them. Kept apart
   * from `failed` because the cause and the remedy differ: these documents
   * never reported an error, so nothing in the UI ever hinted at a problem.
   */
  stale: CorpusDocSummary[];
  ready: CorpusDocSummary[];
  total: number;
}

export interface DocumentStatusRow {
  id: string;
  title: string | null;
  status: string;
  vector_count: number | null;
}

export interface DocumentClassification {
  indexing: CorpusDocSummary[];
  failed: CorpusDocSummary[];
  /** Postgres says done with vectors — still unproven until Qdrant confirms. */
  claimedReady: CorpusDocSummary[];
}

/**
 * Split document rows by what Postgres claims about them. Pure — the Qdrant
 * probe that turns `claimedReady` into ready/stale happens in
 * `inspectCorpusState`.
 */
export function classifyDocumentRows(rows: readonly DocumentStatusRow[]): DocumentClassification {
  const indexing: CorpusDocSummary[] = [];
  const failed: CorpusDocSummary[] = [];
  const claimedReady: CorpusDocSummary[] = [];

  for (const row of rows) {
    const summary: CorpusDocSummary = { id: row.id, title: row.title };
    if (row.status === 'uploaded' || row.status === 'processing' || row.status === 'pending') {
      indexing.push(summary);
    } else if (row.status === 'failed') {
      failed.push(summary);
    } else if (row.status === 'completed' && (row.vector_count ?? 0) > 0) {
      claimedReady.push(summary);
    } else {
      // status='completed' but vector_count=0 — treat as failed for UX purposes
      failed.push(summary);
    }
  }

  return { indexing, failed, claimedReady };
}

/** Counts for the collection list, without touching Qdrant. */
export function summarizeDocumentRows(rows: readonly DocumentStatusRow[]) {
  const { indexing, failed, claimedReady } = classifyDocumentRows(rows);
  return {
    state: deriveIndexingState(rows),
    counts: {
      ready: claimedReady.length,
      indexing: indexing.length,
      failed: failed.length,
      total: rows.length,
    },
  };
}

/**
 * Inspect the Postgres state of the requested documents so we can tell the
 * user *why* a search came back empty (still indexing / failed / genuine miss).
 */
export async function inspectCorpusState(
  documentIds: readonly string[],
  userId: string
): Promise<CorpusStateInspection> {
  if (documentIds.length === 0) {
    return { state: 'ready', indexing: [], failed: [], stale: [], ready: [], total: 0 };
  }

  try {
    const postgres = getPostgresInstance();
    const rows = (await postgres.query(
      `SELECT id, title, status, vector_count
         FROM documents
         WHERE id = ANY($1) AND user_id = $2`,
      [documentIds, userId]
    )) as DocumentStatusRow[];

    const { indexing, failed, claimedReady } = classifyDocumentRows(rows);

    // `vector_count` only records what indexing reported once; nothing rewrites
    // it when the points later disappear. Believing it turned a wiped index
    // into "leider nichts gefunden" — a wrong answer the user could not tell
    // apart from a genuine miss. We are already on the empty-result path here,
    // so the probe costs nothing on a normal search.
    const stale: CorpusDocSummary[] = [];
    const ready: CorpusDocSummary[] = [];
    // Own try/catch: if Qdrant is unreachable the whole inspection used to
    // collapse to an empty 'ready', throwing away the Postgres findings we
    // already have. Falling back to "trust Postgres" keeps the indexing /
    // failed messages working during a Qdrant outage.
    let counts = new Map<string, number>();
    try {
      counts = await getSearchService().countVectorsByDocument(claimedReady.map((d) => d.id));
    } catch (probeError) {
      log.warn(`Vektor-Probe übersprungen: ${(probeError as Error).message}`);
    }
    for (const doc of claimedReady) {
      const stored = counts.get(doc.id);
      // Probe failed (id absent) → keep trusting Postgres rather than
      // reporting a Qdrant hiccup as missing data.
      if (stored === 0) stale.push(doc);
      else ready.push(doc);
    }

    if (stale.length > 0) {
      log.error(
        `${stale.length}/${rows.length} Dokument(e) haben keine Vektoren in Qdrant, ` +
          `obwohl Postgres sie als fertig führt: ${stale.map((d) => d.id).join(', ')}`
      );
    }

    const state: CorpusStateInspection['state'] =
      indexing.length > 0
        ? 'indexing'
        : stale.length > 0
          ? 'stale'
          : failed.length > 0
            ? 'failed'
            : 'ready';

    return { state, indexing, failed, stale, ready, total: rows.length };
  } catch (error) {
    log.warn(`inspectCorpusState failed: ${(error as Error).message}`);
    return { state: 'ready', indexing: [], failed: [], stale: [], ready: [], total: 0 };
  }
}
