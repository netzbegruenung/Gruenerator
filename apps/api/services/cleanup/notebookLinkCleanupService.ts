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
 * Reports, does not delete. The scheduled run calls this with `apply` at its
 * default of false: it walks every link, compares against Postgres and writes
 * down what it would have unlinked, and touches nothing. Switching it back on
 * is one word at the call site below — a code change someone signs off on, not
 * a setting that can quietly stand differently on one host than another. That
 * is the posture a destructive housekeeping job earns after it has been wrong
 * once; see the note on `MIN_KNOWN_RATIO`.
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

/**
 * A page whose documents Postgres almost entirely does not know is not a page of
 * orphans — it is the wrong database being asked.
 *
 * That is not hypothetical. On 2026-08-27 this sweep ran on `gruenerator-test`,
 * which points `QDRANT_URL` at the production Qdrant but carries its own
 * 56-document Postgres. It asked the test database about production document ids,
 * was told none of them exist, and unlinked 589 production links in two pages
 * (`500 verwaiste …`, `89 verwaiste …`). The `catch` below covers a lookup that
 * throws; it cannot cover one that answers correctly out of a store that does not
 * belong to the Qdrant being swept.
 *
 * Real orphan rates are a rounding error — a document is deleted, its handful of
 * links go stale. Half a page of them means the premise is broken, not the data.
 */
const MIN_KNOWN_RATIO = 0.5;

/**
 * Below this many documents a ratio says nothing, so the check stays out of the
 * way: a two-link page with both documents deleted is 0 % known and perfectly
 * ordinary. The incident pages held 500.
 */
const MIN_SAMPLE_FOR_RATIO = 20;

/**
 * Backstop for premises this file has not thought of. A sweep that wants to
 * remove more than this in one run has stopped tidying and started deleting;
 * it says so and leaves the rest to a person.
 */
const MAX_REMOVALS_PER_RUN = 100;

const notebookHelper = new NotebookQdrantHelper();

/** Which of these ids Postgres still has a document row for. */
async function existingDocumentIds(ids: string[]): Promise<Set<string>> {
  const rows = (await getPostgresInstance().query('SELECT id FROM documents WHERE id = ANY($1)', [
    ids,
  ])) as Array<{ id: string }>;
  return new Set(rows.map((r) => r.id));
}

/** What a sweep saw, and what it did about it. */
export interface SweepReport {
  /** Distinct documents behind the links, across all pages. */
  scanned: number;
  /** How many of those Postgres still has a row for. */
  known: number;
  /** How many have no Postgres row — the removal candidates. */
  orphans: number;
  /** How many links were actually unlinked. Zero unless `apply`. */
  removed: number;
  /** Why the run stopped short of acting, if it did. */
  blocked: string | null;
}

/**
 * Compare every link against Postgres and report. Removes nothing unless
 * `apply` is passed — a dry run still walks every page, so the report is
 * complete even when a guard has already decided that acting would be wrong.
 */
export async function sweepOrphanedNotebookLinks(apply = false): Promise<SweepReport> {
  const report: SweepReport = { scanned: 0, known: 0, orphans: 0, removed: 0, blocked: null };
  let after: string | number | null = null;
  let pages = 0;

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
    report.scanned += unique.length;
    report.known += alive.size;
    report.orphans += orphans.length;

    if (report.blocked === null) {
      if (unique.length >= MIN_SAMPLE_FOR_RATIO && alive.size / unique.length < MIN_KNOWN_RATIO) {
        report.blocked = `Postgres kennt nur ${alive.size} von ${unique.length} Dokumenten einer Seite`;
      } else if (report.removed + orphans.length > MAX_REMOVALS_PER_RUN) {
        report.blocked = `mehr als ${MAX_REMOVALS_PER_RUN} Entfernungen in einem Lauf`;
      }
    }

    if (apply && report.blocked === null && orphans.length > 0) {
      await notebookHelper.removeDocumentsFromAllCollections(orphans);
      report.removed += orphans.length;
    }

    // A dry run keeps counting so the report covers everything; an applying run
    // has nothing left to do once a guard has spoken.
    if (apply && report.blocked !== null) break;
    if (page.last === null) break;
  }

  if (pages >= MAX_PAGES) {
    // Say what was left rather than looking like a completed sweep.
    log.info(`Seitenlimit (${MAX_PAGES}) erreicht — Rest folgt beim nächsten Lauf`);
  }

  log.info(
    `[${apply ? 'ANGEWENDET' : 'PROBELAUF'}] ${report.scanned} Dokumente geprüft, ` +
      `${report.known} in Postgres bekannt, ${report.orphans} ohne Postgres-Zeile, ` +
      `${report.removed} entfernt`
  );
  if (report.blocked !== null) {
    log.error(`Sweep hat nicht gelöscht: ${report.blocked}`);
  }
  return report;
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
