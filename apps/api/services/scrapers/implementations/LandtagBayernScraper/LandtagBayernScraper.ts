/**
 * Bayerischer Landtag — Drucksachen und Plenarprotokolle der laufenden
 * Wahlperiode in `landtag_bayern_documents`.
 *
 * Quelle ist die Dokumentensuche des Landtags (`/parlament/dokumente/
 * drucksachen`); eine offene API gibt es nicht, und open.bydata.de führt keine
 * Parlamentsdokumente. Je Treffer ein Vorgang mit seinem PDF, bei Protokollen
 * der Auszug zum Tagesordnungspunkt, den der Landtag selbst zuschneidet.
 * Schriftliche Anfragen erscheinen erst mit der Antwort der Staatsregierung und
 * bleiben deshalb drin.
 *
 * Dasselbe PDF steht für jeden Vorgang, den es betrifft, einmal in der Liste —
 * eine Sammel-Beschlussempfehlung zum Haushalt dutzendfach. Gespeichert wird
 * es einmal: Schlüssel ist der PDF-Pfad (`documentIdOf`), die Titel der
 * übrigen Vorgänge derselben Seite stehen im Kopf.
 *
 * Zwei Betriebsarten:
 *   - incremental (Nacht-Sync): je Dokumentart ab Seite 1, bis eine Seite ein
 *     Dokument bringt, das schon vor dem Lauf da war. Die Liste steht neueste
 *     zuerst.
 *   - backfill (Erstbefüllung, lokal): läuft jede Liste ganz durch und schreibt
 *     nach jeder Seite einen Stand in `statePath`; ein Abbruch setzt an der
 *     Seite danach fort und holt Fehlgeschlagenes zuerst nach.
 *
 * „Schon da" heißt: Chunk 0 des Dokuments liegt in Qdrant (`ParliamentStore`).
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
  runPool,
  saveResumeState,
} from '../../parliament/index.js';

import {
  documentIdOf,
  documentPayloadOf,
  groupByDocument,
  headerTextOf,
  LANDTAG_BAYERN_COLLECTION,
  LANDTAG_BAYERN_SOURCE,
  LANDTAG_PARTS,
  WAHLPERIODE,
  type BayernDocument,
  type LandtagPart,
} from './builders.js';
import { parseListPage } from './listParser.js';

import type { ScraperResult } from '../../types.js';

const log = createLogger('LandtagBayernScraper');

const LIST_URL = 'https://www.bayern.landtag.de/parlament/dokumente/drucksachen';
const PAGE_SIZE = 100;
/** Mindestabstand zwischen zwei Anfragen an den Landtag. */
const REQUEST_GAP_MS = 1000;
const LIST_TIMEOUT_MS = 60_000;
/**
 * Der Landtag legt im Schnitt ~20 Drucksachen am Tag an, in Haushaltswochen
 * Hunderte Änderungsanträge — fünf Seiten zu 100 reichen für Tage Rückstand.
 */
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
}

export interface LandtagRunSummary {
  stored: number;
  skipped: number;
  failed: number;
  listPages: number;
  chunks: number;
  extractionMethods: Record<string, number>;
  errors: string[];
}

/**
 * `known`: lag schon vor diesem Lauf in Qdrant. `repeat`: in diesem Lauf
 * schon verarbeitet — ein Sammeldokument, das über eine Seitengrenze reicht.
 * Nur `known` beendet den Nacht-Sync.
 */
type Outcome = 'stored' | 'known' | 'repeat' | 'empty';

interface PartState {
  nextPage: number;
  totalPages: number | null;
  done: boolean;
}

interface RunState {
  version: number;
  parts: Partial<Record<LandtagPart, PartState>>;
  failed: Record<string, { part: LandtagPart; doc: BayernDocument; error: string }>;
}

const emptyState = (): RunState => ({ version: STATE_VERSION, parts: {}, failed: {} });

export class LandtagBayernScraper extends BaseScraper {
  readonly #gate = new PoliteGate(REQUEST_GAP_MS);
  readonly #store = new ParliamentStore(
    LANDTAG_BAYERN_COLLECTION,
    LANDTAG_BAYERN_SOURCE,
    'Bayerischer Landtag'
  );
  #known = new Set<string>();
  #seen = new Set<string>();

  constructor() {
    super({ collectionName: LANDTAG_BAYERN_COLLECTION, delayMs: REQUEST_GAP_MS });
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
      failed: 0,
      listPages: 0,
      chunks: 0,
      extractionMethods: {},
      errors: [],
    };

    this.#known = options.dryRun ? new Set() : await this.#store.loadKnownIds();
    this.#seen = new Set();
    log.info(
      `[landtag-bayern] ${this.#known.size} documents already in ${LANDTAG_BAYERN_COLLECTION}`
    );

    if (options.mode === 'backfill') {
      if (!options.statePath) throw new Error('backfill needs a statePath');
      await this.#backfill(parts, options, options.statePath, summary);
    } else if (this.#known.size === 0 && !options.dryRun) {
      // Vor der Erstbefüllung wäre jede Seite neu, und der Nacht-Sync arbeitete
      // sich in seinem Zeitfenster durch Tausende Dokumente.
      log.warn(
        '[landtag-bayern] collection is empty — run scripts/backfill-landtag-bayern.ts first'
      );
    } else {
      for (const part of parts) {
        if (this.#limitReached(options, summary)) break;
        await this.#incremental(part, options, summary);
      }
    }

    log.info(
      `[landtag-bayern] done: stored=${summary.stored} skipped=${summary.skipped} failed=${summary.failed} listPages=${summary.listPages} chunks=${summary.chunks} methods=${JSON.stringify(summary.extractionMethods)}`
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
      const { docs } = await this.#fetchList(part, page, summary);
      if (docs.length === 0) return;
      const outcomes = await this.#processDocs(docs, part, options, summary);
      if (outcomes.includes('known')) return;
      if (this.#limitReached(options, summary)) return;
    }
    log.warn(
      `[landtag-bayern] ${part}: still new documents after ${INCREMENTAL_MAX_PAGES} pages — run a backfill`
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
      log.info(
        `[landtag-bayern] retrying ${retries.length} documents that failed in an earlier run`
      );
      for (const [documentId, failure] of retries) {
        delete state.failed[documentId];
        await this.#processDocs([failure.doc], failure.part, options, summary, state);
      }
      persist();
    }

    for (const part of parts) {
      const partState = (state.parts[part] ??= { nextPage: 1, totalPages: null, done: false });
      if (partState.done && !options.force) {
        log.info(`[landtag-bayern] ${part}: backfill already complete`);
        continue;
      }
      while (!this.#limitReached(options, summary)) {
        const { total, docs } = await this.#fetchList(part, partState.nextPage, summary);
        if (total !== null) partState.totalPages = Math.ceil(total / PAGE_SIZE);
        if (docs.length === 0) {
          partState.done = true;
          persist();
          break;
        }
        log.info(
          `[landtag-bayern] ${part}: page ${partState.nextPage}/${partState.totalPages ?? '?'}`
        );
        await this.#processDocs(docs, part, options, summary, state);
        // Mit --limit kann der Lauf mitten auf der Seite enden; dann bleibt die
        // Seite stehen, sonst fehlte ihr Rest beim Fortsetzen für immer.
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

  async #fetchList(part: LandtagPart, page: number, summary: LandtagRunSummary) {
    const params = new URLSearchParams({
      dokumentenart: LANDTAG_PARTS[part],
      'wahlperiodeid[]': String(WAHLPERIODE),
      sort: 'date',
      anzahl_treffer: String(PAGE_SIZE),
      page: String(page),
    });
    const html = await this.#gate.run(async () => {
      const res = await this.fetchWithRetry(`${LIST_URL}?${params.toString()}`, {
        timeout: LIST_TIMEOUT_MS,
        userAgent: BRAND.botUserAgent,
      });
      return res.text();
    });
    summary.listPages += 1;
    const { total, entries } = parseListPage(html);
    return { total, docs: groupByDocument(entries) };
  }

  // ── Verarbeitung ───────────────────────────────────────────────────────────

  async #processDocs(
    docs: BayernDocument[],
    part: LandtagPart,
    options: LandtagRunOptions,
    summary: LandtagRunSummary,
    state?: RunState
  ): Promise<(Outcome | undefined)[]> {
    const outcomes: (Outcome | undefined)[] = docs.map(() => undefined);
    const indexed = docs.map((doc, i) => ({ doc, i }));
    await runPool(indexed, options.concurrency ?? 3, async ({ doc, i }) => {
      if (this.#limitReached(options, summary)) return;
      const documentId = documentIdOf(doc.entry.pdfUrl);
      try {
        const outcome = await this.#processDoc(doc, options, summary);
        outcomes[i] = outcome;
        if (outcome === 'stored') summary.stored += 1;
        else summary.skipped += 1;
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        summary.failed += 1;
        summary.errors.push(`${documentId} (${doc.entry.pdfUrl}): ${message}`);
        log.warn(`[landtag-bayern] ${documentId} failed: ${message}`);
        if (state) state.failed[documentId] = { part, doc, error: message };
      }
    });
    return outcomes;
  }

  async #processDoc(
    doc: BayernDocument,
    options: LandtagRunOptions,
    summary: LandtagRunSummary
  ): Promise<Outcome> {
    const documentId = documentIdOf(doc.entry.pdfUrl);
    if (this.#seen.has(documentId)) return 'repeat';
    this.#seen.add(documentId);
    const known = this.#known.has(documentId);
    if (known && !options.force) return 'known';

    const buffer = await downloadPdf(
      this.#gate,
      (url, opts) => this.fetchWithRetry(url, opts),
      doc.entry.pdfUrl
    );
    const extraction = await extractPdfText(buffer, `[landtag-bayern] ${documentId}`);
    summary.extractionMethods[extraction.method] =
      (summary.extractionMethods[extraction.method] ?? 0) + 1;
    const body = extraction.text;
    if (!body.trim()) return 'empty';

    const text = `${headerTextOf(doc)}\n\n${body}`;
    const parliamentDoc = {
      documentId,
      title: doc.entry.title,
      sourceUrl: doc.entry.pdfUrl,
      text,
      payload: documentPayloadOf(doc, body),
      extraction: { method: extraction.method, pageCount: extraction.pageCount },
      excerpt: doc.entry.abstract ?? body,
      publishedAt: doc.entry.publishedAt,
    };
    if (options.dryRun) {
      const chunks = await this.#store.chunk(parliamentDoc);
      if (chunks.length === 0) return 'empty';
      summary.chunks += chunks.length;
      return 'stored';
    }
    const written = await this.#store.store(parliamentDoc, known);
    if (written === 0) return 'empty';
    summary.chunks += written;
    this.#known.add(documentId);
    this.stats.vectorsStored += written;
    return 'stored';
  }
}

let instance: LandtagBayernScraper | null = null;

export function getLandtagBayernScraper(): LandtagBayernScraper {
  if (!instance) instance = new LandtagBayernScraper();
  return instance;
}
