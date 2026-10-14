/**
 * Landtag NRW — Drucksachen, Plenar- und Ausschussprotokolle der laufenden
 * Wahlperiode in `landtag_nrw_documents`.
 *
 * Quelle ist die Parlamentsdatenbank (`parlamentsdatenbank-suchergebnis.html`):
 * je Treffer ein Dokument, bei Protokollen ein Tagesordnungspunkt, dessen PDF
 * der Landtag selbst auf die Seiten des Punkts zuschneidet. Kategorien,
 * Schlagworte, Redner*innen und Beschluss kommen aus der Datenbank, nicht aus
 * einem Modell. Kleine Anfragen bleiben draußen (siehe `isExcludedDocType`).
 *
 * Zwei Betriebsarten:
 *   - incremental (Nacht-Sync): je Dokumentart ab Seite 1, bis eine Seite nichts
 *     Neues mehr bringt. Die Liste steht neueste zuerst.
 *   - backfill (Erstbefüllung, lokal): läuft jede Liste ganz durch und schreibt
 *     nach jeder Seite einen Stand in `statePath`. Bricht der Lauf ab, setzt der
 *     nächste an der Seite danach fort und holt die fehlgeschlagenen Dokumente
 *     zuerst nach. Neue Dokumente schieben ältere auf spätere Seiten — dadurch
 *     sieht der Lauf Treffer doppelt, verpasst aber keine.
 *
 * „Schon da" heißt: Chunk 0 des Dokuments liegt in Qdrant. Er wird deshalb als
 * letzter geschrieben — ein abgebrochener Upsert hinterlässt nie ein Dokument,
 * das als fertig gilt.
 *
 * Höflichkeit: alle Anfragen an den Landtag laufen nacheinander durch ein
 * Gatter mit Mindestabstand; parallel sind nur Auslesen, Einbetten und Upsert.
 */

import { BRAND } from '../../../../utils/domainUtils.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';
import {
  downloadPdf,
  extractPdfText,
  loadResumeState,
  ParliamentStore,
  PoliteGate,
  renumberPageMarkers,
  runPool,
  saveResumeState,
  type PdfText,
} from '../../parliament/index.js';

import {
  bezugOf,
  classifyDocType,
  documentIdOf,
  documentPayloadOf,
  headerTextOf,
  isExcludedDocType,
  LANDTAG_NRW_COLLECTION,
  LANDTAG_NRW_SOURCE,
  LANDTAG_PARTS,
  originalPagesOf,
  reachedKnownDocuments,
  WAHLPERIODE,
  type LandtagPart,
  type ProcessOutcome,
} from './builders.js';
import { parseListPage, type LandtagListEntry } from './listParser.js';

import type { ScraperResult } from '../../types.js';

const log = createLogger('LandtagNrwScraper');

const LIST_URL =
  'https://www.landtag.nrw.de/home/dokumente/dokumentensuche/parlamentsdokumente/parlamentsdatenbank-suchergebnis.html';
const PAGE_SIZE = 50;
/** Mindestabstand zwischen zwei Anfragen an den Landtag. */
const REQUEST_GAP_MS = 1000;
const LIST_TIMEOUT_MS = 60_000;
/** Der Landtag legt im Schnitt ~30 Treffer am Tag an; fünf Seiten je Art reichen für Tage Rückstand. */
const INCREMENTAL_MAX_PAGES = 5;
const STATE_VERSION = 1;

export const ALL_LANDTAG_PARTS = Object.keys(LANDTAG_PARTS) as LandtagPart[];

export interface LandtagRunOptions {
  mode: 'incremental' | 'backfill';
  parts?: LandtagPart[];
  /** Nur backfill: Datei für den Fortsetzungsstand. */
  statePath?: string;
  /** Dokumente, die gleichzeitig ausgelesen und eingebettet werden. */
  concurrency?: number;
  /** Nach so vielen verarbeiteten Dokumenten aufhören (Probelauf). */
  limit?: number;
  /** Herunterladen, auslesen und zerlegen, aber nicht einbetten und nicht schreiben. */
  dryRun?: boolean;
  /** Auch Dokumente neu schreiben, die schon da sind. */
  force?: boolean;
  /**
   * Nur Treffer dieses Dokumenttyps (Feld `doktyp` der Parlamentsdatenbank, z. B.
   * `ENTSCHLIEßUNGSANTRAG`) — für gezielte Nachläufe mit `force`.
   */
  doktyp?: string;
}

export interface LandtagRunSummary {
  stored: number;
  skipped: number;
  excluded: number;
  failed: number;
  listPages: number;
  chunks: number;
  extractionMethods: Record<string, number>;
  errors: string[];
}

type Outcome = ProcessOutcome;

interface PartState {
  nextPage: number;
  totalPages: number | null;
  done: boolean;
}

interface RunState {
  version: number;
  parts: Partial<Record<LandtagPart, PartState>>;
  failed: Record<string, { part: LandtagPart; entry: LandtagListEntry; error: string }>;
}

const emptyState = (): RunState => ({ version: STATE_VERSION, parts: {}, failed: {} });

export class LandtagNrwScraper extends BaseScraper {
  readonly #gate = new PoliteGate(REQUEST_GAP_MS);
  readonly #store = new ParliamentStore(LANDTAG_NRW_COLLECTION, LANDTAG_NRW_SOURCE, 'Landtag NRW');
  #known = new Set<string>();
  /** Drucksachennummer → Titel, für die „Zu:"-Zeile im Kopf (`headerTextOf`). */
  #drucksacheTitles = new Map<string, string>();

  constructor() {
    super({ collectionName: LANDTAG_NRW_COLLECTION, delayMs: REQUEST_GAP_MS });
  }

  async init(): Promise<void> {
    await mistralEmbeddingService.init();
  }

  /** BaseScraper-Vertrag — der Nacht-Sync. */
  async scrape(): Promise<ScraperResult> {
    this.initializeSession();
    const summary = await this.run({ mode: 'incremental' });
    return { ...this.buildResult(), documentsProcessed: summary.stored, errors: summary.errors };
  }

  async run(options: LandtagRunOptions): Promise<LandtagRunSummary> {
    const parts = options.parts ?? ALL_LANDTAG_PARTS;
    const summary: LandtagRunSummary = {
      stored: 0,
      skipped: 0,
      excluded: 0,
      failed: 0,
      listPages: 0,
      chunks: 0,
      extractionMethods: {},
      errors: [],
    };

    const known = options.dryRun
      ? new Map<string, Record<string, unknown>>()
      : await this.#store.loadKnown(['content_type', 'document_number', 'title']);
    this.#known = new Set(known.keys());
    this.#drucksacheTitles = new Map();
    for (const payload of known.values()) {
      const { content_type, document_number, title } = payload;
      if (
        content_type === 'drucksache' &&
        typeof document_number === 'string' &&
        typeof title === 'string'
      ) {
        this.#drucksacheTitles.set(document_number, title);
      }
    }
    log.info(`[landtag-nrw] ${this.#known.size} documents already in ${LANDTAG_NRW_COLLECTION}`);

    if (options.mode === 'backfill') {
      if (!options.statePath) throw new Error('backfill needs a statePath');
      await this.#backfill(parts, options, options.statePath, summary);
    } else if (this.#known.size === 0 && !options.dryRun) {
      // Vor der Erstbefüllung wäre jede Seite neu, und der Nacht-Sync arbeitete
      // sich in seinem Zeitfenster durch Tausende Dokumente.
      log.warn('[landtag-nrw] collection is empty — run scripts/backfill-landtag-nrw.ts first');
    } else {
      for (const part of parts) {
        if (this.#limitReached(options, summary)) break;
        await this.#incremental(part, options, summary);
      }
    }

    log.info(
      `[landtag-nrw] done: stored=${summary.stored} skipped=${summary.skipped} excluded=${summary.excluded} failed=${summary.failed} listPages=${summary.listPages} chunks=${summary.chunks} methods=${JSON.stringify(summary.extractionMethods)}`
    );
    return summary;
  }

  // ── Betriebsarten ──────────────────────────────────────────────────────────

  async #incremental(
    part: LandtagPart,
    options: LandtagRunOptions,
    summary: LandtagRunSummary
  ): Promise<void> {
    for (let page = 1; page <= INCREMENTAL_MAX_PAGES; page++) {
      const { entries } = await this.#fetchList(part, page, options, summary);
      if (entries.length === 0) return;
      const outcomes = await this.#processEntries(entries, part, options, summary);
      if (reachedKnownDocuments(outcomes)) return;
      if (this.#limitReached(options, summary)) return;
    }
    log.warn(
      `[landtag-nrw] ${part}: still new documents after ${INCREMENTAL_MAX_PAGES} pages — run a backfill`
    );
  }

  async #backfill(
    parts: LandtagPart[],
    options: LandtagRunOptions,
    statePath: string,
    summary: LandtagRunSummary
  ): Promise<void> {
    const state = loadResumeState(statePath, emptyState());
    const persist = () => {
      if (!options.dryRun) saveResumeState(statePath, state);
    };

    const retries = Object.entries(state.failed).filter(([, f]) => parts.includes(f.part));
    if (retries.length > 0) {
      log.info(`[landtag-nrw] retrying ${retries.length} documents that failed in an earlier run`);
      for (const [documentId, failure] of retries) {
        delete state.failed[documentId];
        await this.#processEntries([failure.entry], failure.part, options, summary, state);
      }
      persist();
    }

    for (const part of parts) {
      const partState = (state.parts[part] ??= { nextPage: 1, totalPages: null, done: false });
      if (partState.done && !options.force) {
        log.info(`[landtag-nrw] ${part}: backfill already complete`);
        continue;
      }
      while (!this.#limitReached(options, summary)) {
        const { total, entries } = await this.#fetchList(
          part,
          partState.nextPage,
          options,
          summary
        );
        if (total !== null) partState.totalPages = Math.ceil(total / PAGE_SIZE);
        if (entries.length === 0) {
          partState.done = true;
          persist();
          break;
        }
        log.info(
          `[landtag-nrw] ${part}: page ${partState.nextPage}/${partState.totalPages ?? '?'}`
        );
        await this.#processEntries(entries, part, options, summary, state);
        // Mit --limit kann der Lauf mitten auf der Seite enden; dann bleibt die
        // Seite stehen, sonst fehlte ihr Rest beim Fortsetzen für immer. Was
        // schon gespeichert ist, überspringt der nächste Lauf ohnehin.
        if (this.#limitReached(options, summary)) {
          persist();
          break;
        }
        partState.nextPage += 1;
        if (partState.totalPages !== null && partState.nextPage > partState.totalPages) {
          partState.done = true;
        }
        persist();
        if (partState.done) break;
      }
    }
  }

  #limitReached(options: LandtagRunOptions, summary: LandtagRunSummary): boolean {
    return options.limit !== undefined && summary.stored >= options.limit;
  }

  // ── Landtag ────────────────────────────────────────────────────────────────

  async #fetchList(
    part: LandtagPart,
    page: number,
    options: LandtagRunOptions,
    summary: LandtagRunSummary
  ) {
    const doktyp = options.doktyp ? `&doktyp=${encodeURIComponent(options.doktyp)}` : '';
    const url = `${LIST_URL}?wp=${WAHLPERIODE}&view=detail&dokart=${LANDTAG_PARTS[part]}${doktyp}&page=${page}`;
    const html = await this.#gate.run(async () => {
      const res = await this.fetchWithRetry(url, {
        timeout: LIST_TIMEOUT_MS,
        userAgent: BRAND.botUserAgent,
      });
      return res.text();
    });
    summary.listPages += 1;
    return parseListPage(html);
  }

  // ── Verarbeitung ───────────────────────────────────────────────────────────

  async #processEntries(
    entries: LandtagListEntry[],
    part: LandtagPart,
    options: LandtagRunOptions,
    summary: LandtagRunSummary,
    state?: RunState
  ): Promise<(Outcome | undefined)[]> {
    const outcomes: (Outcome | undefined)[] = entries.map(() => undefined);
    const indexed = entries.map((entry, i) => ({ entry, i }));
    await runPool(indexed, options.concurrency ?? 3, async ({ entry, i }) => {
      if (this.#limitReached(options, summary)) return;
      const documentId = documentIdOf(entry);
      try {
        const outcome = await this.#processEntry(entry, part, options, summary);
        outcomes[i] = outcome;
        if (outcome === 'stored') summary.stored += 1;
        else if (outcome === 'excluded') summary.excluded += 1;
        else summary.skipped += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failed += 1;
        summary.errors.push(`${documentId} (${entry.pdfUrl}): ${message}`);
        log.warn(`[landtag-nrw] ${documentId} failed: ${message}`);
        if (state) state.failed[documentId] = { part, entry, error: message };
      }
    });
    return outcomes;
  }

  async #processEntry(
    entry: LandtagListEntry,
    part: LandtagPart,
    options: LandtagRunOptions,
    summary: LandtagRunSummary
  ): Promise<Outcome> {
    const documentId = documentIdOf(entry);
    if (part === 'drucksache' && isExcludedDocType(classifyDocType(entry.descriptor))) {
      return 'excluded';
    }
    const known = this.#known.has(documentId);
    if (known && !options.force) return 'known';

    const extraction = await this.#extractText(entry, summary);
    const body = extraction.text;
    if (!body.trim()) return 'empty';

    const bezug = bezugOf(entry.descriptor);
    const bezugTitel = bezug ? (this.#drucksacheTitles.get(bezug) ?? null) : null;
    const text = `${headerTextOf(entry, part, bezugTitel)}\n\n${body}`;
    const doc = {
      documentId,
      title: entry.title,
      sourceUrl: entry.pdfUrl,
      text,
      payload: documentPayloadOf(entry, part, text),
      extraction: { method: extraction.method, pageCount: extraction.pageCount },
      excerpt: entry.abstract ?? body,
      publishedAt: entry.publishedAt,
    };
    if (options.dryRun) {
      const chunks = await this.#store.chunk(doc);
      if (chunks.length === 0) return 'empty';
      summary.chunks += chunks.length;
      return 'stored';
    }
    const written = await this.#store.store(doc, known);
    if (written === 0) return 'empty';
    summary.chunks += written;
    this.#known.add(documentId);
    if (part === 'drucksache') this.#drucksacheTitles.set(entry.documentNumber, entry.title);
    this.stats.vectorsStored += written;
    return 'stored';
  }

  /** Seitenmarken eines Protokollauszugs zeigen danach auf die Seiten des Originals. */
  async #extractText(entry: LandtagListEntry, summary: LandtagRunSummary): Promise<PdfText> {
    const buffer = await downloadPdf(
      this.#gate,
      (url, opts) => this.fetchWithRetry(url, opts),
      entry.pdfUrl
    );
    const result = await extractPdfText(buffer, `[landtag-nrw] ${documentIdOf(entry)}`);
    summary.extractionMethods[result.method] = (summary.extractionMethods[result.method] ?? 0) + 1;
    return {
      ...result,
      text: renumberPageMarkers(result.text, originalPagesOf(entry.pageRanges)),
    };
  }
}

let instance: LandtagNrwScraper | null = null;

export function getLandtagNrwScraper(): LandtagNrwScraper {
  if (!instance) instance = new LandtagNrwScraper();
  return instance;
}
