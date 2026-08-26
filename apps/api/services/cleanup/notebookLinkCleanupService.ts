/**
 * Sweeps notebook↔document links whose document no longer exists.
 *
 * Notebook membership lives in the Qdrant collection
 * `notebook_collection_documents`, not in the Postgres table of the same name —
 * that table exists, carries the right `ON DELETE CASCADE`, and is read and
 * written by nothing. So when a document row is deleted, no cascade fires and
 * the join point survives it. A surviving point is not inert: notebooks keep
 * listing the id, QA filters on an id that can never match, and
 * `findReferencedDocumentIds` reports a long-deleted document as still in use,
 * which is what stops the WordPress importer from cleaning up after itself.
 *
 * The three delete paths now remove their own links
 * (`NotebookQdrantHelper.removeDocumentsFromAllCollections`), so this sweep is
 * for what they left behind before that, plus anything a Qdrant outage causes
 * them to miss — those deletions are deliberately best-effort, because the
 * Postgres row is already gone by the time they run and failing the request
 * afterwards would report a deletion that did happen as an error.
 *
 * Deliberately conservative:
 *   - It only ever deletes a link whose `document_id` Postgres does NOT know.
 *     Documents themselves are never touched.
 *   - A page whose Postgres lookup throws is skipped, not treated as "none of
 *     these exist". Reading a database outage as "everything is orphaned" would
 *     empty every notebook in the installation.
 *   - Bounded per run. A backlog is drained over several ticks rather than in
 *     one long scroll holding an interval open.
 */
import { NotebookQdrantHelper } from '../../database/services/NotebookQdrantHelper.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('NotebookLinkCleanup');

const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** Staggered past boot so the first sweep does not contend with startup. */
const INITIAL_DELAY_MS = 5 * 60 * 1000;
const PAGE_SIZE = 500;
/** ~50k links per run at PAGE_SIZE, drained further on the next tick. */
const MAX_PAGES = 100;

const notebookHelper = new NotebookQdrantHelper();

/** Which of these ids Postgres still has a document row for. */
async function existingDocumentIds(ids: string[]): Promise<Set<string>> {
  const rows = (await getPostgresInstance().query('SELECT id FROM documents WHERE id = ANY($1)', [
    ids,
  ])) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

/** Returns how many orphaned document ids were unlinked. */
export async function sweepOrphanedNotebookLinks(): Promise<number> {
  let after: string | number | null = null;
  let pages = 0;
  let removed = 0;

  while (pages < MAX_PAGES) {
    const page = await notebookHelper.listDocumentLinksPage(PAGE_SIZE, after);
    if (page.documentIds.length === 0) break;
    pages++;
    after = page.last;

    const unique = [...new Set(page.documentIds)];
    let alive: Set<string>;
    try {
      alive = await existingDocumentIds(unique);
    } catch (error) {
      // Skip, do not assume. See the conservatism note in the file header.
      log.warn(`Postgres-Abgleich fehlgeschlagen, Seite übersprungen: ${(error as Error).message}`);
      continue;
    }

    const orphans = unique.filter((id) => !alive.has(id));
    if (orphans.length === 0) continue;

    await notebookHelper.removeDocumentsFromAllCollections(orphans);
    removed += orphans.length;
    log.info(`${orphans.length} verwaiste Notizbuch-Verknüpfung(en) entfernt`);

    if (page.last === null) break;
  }

  if (pages >= MAX_PAGES) {
    // Say what was left rather than looking like a completed sweep.
    log.info(`Seitenlimit (${MAX_PAGES}) erreicht — Rest folgt beim nächsten Lauf`);
  }
  return removed;
}

const worker = createIntervalWorker({
  name: 'NotebookLinkCleanup',
  intervalMs: SWEEP_INTERVAL_MS,
  initialDelayMs: INITIAL_DELAY_MS,
  tick: async () => {
    await sweepOrphanedNotebookLinks();
  },
});

export function startNotebookLinkCleanup(): void {
  worker.start();
}

export function stopNotebookLinkCleanup(): void {
  worker.stop();
}
