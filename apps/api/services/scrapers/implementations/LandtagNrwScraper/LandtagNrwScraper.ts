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

import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import {
  batchDelete,
  batchUpsert,
} from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { BRAND } from '../../../../utils/domainUtils.js';
import { createLogger } from '../../../../utils/logger.js';
import { generatePointId } from '../../../../utils/validation/index.js';
import { chunkQualityService } from '../../../ChunkQualityService/index.js';
import {
  buildEmbeddingTextsForChunks,
  embeddingPayload,
  offsetPayload,
  smartChunkDocument,
  structurePayload,
} from '../../../document-services/index.js';
import { pagePayload } from '../../../document-services/pagePayload.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { ocrService } from '../../../OcrService/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';
import { recordExtraction } from '../../extractionRecorder.js';
import { recordSyncEvent, toExcerpt } from '../../syncEventRecorder.js';

import {
  classifyDocType,
  documentIdOf,
  documentPayloadOf,
  headerTextOf,
  isExcludedDocType,
  LANDTAG_NRW_COLLECTION,
  LANDTAG_NRW_SOURCE,
  LANDTAG_PARTS,
  originalPagesOf,
  renumberPageMarkers,
  WAHLPERIODE,
  type LandtagPart,
} from './builders.js';
import { parseListPage, type LandtagListEntry } from './listParser.js';

import type { ScraperResult } from '../../types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

const log = createLogger('LandtagNrwScraper');

const LIST_URL =
  'https://www.landtag.nrw.de/home/dokumente/dokumentensuche/parlamentsdokumente/parlamentsdatenbank-suchergebnis.html';
const PAGE_SIZE = 50;
/** Mindestabstand zwischen zwei Anfragen an den Landtag. */
const REQUEST_GAP_MS = 1000;
const LIST_TIMEOUT_MS = 60_000;
const PDF_TIMEOUT_MS = 120_000;
const UPSERT_BATCH = 10;
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

type Outcome = 'stored' | 'known' | 'excluded' | 'empty';

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

/** Reiht Aufgaben hintereinander und hält zwischen ihnen einen Mindestabstand. */
class PoliteGate {
  #tail: Promise<unknown> = Promise.resolve();
  #last = 0;

  constructor(private readonly gapMs: number) {}

  run<T>(task: () => Promise<T>): Promise<T> {
    const next = this.#tail.then(async () => {
      const wait = this.#last + this.gapMs - Date.now();
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      try {
        return await task();
      } finally {
        this.#last = Date.now();
      }
    });
    this.#tail = next.catch(() => undefined);
    return next;
  }
}

/** `fn` über `items`, höchstens `limit` gleichzeitig. */
async function runPool<T>(
  items: readonly T[],
  limit: number,
  fn: (item: T) => Promise<void>
): Promise<void> {
  let index = 0;
  const worker = async (): Promise<void> => {
    while (index < items.length) {
      const item = items[index++];
      await fn(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}

function emptyState(): RunState {
  return { version: STATE_VERSION, parts: {}, failed: {} };
}

function loadState(statePath: string): RunState {
  if (!fs.existsSync(statePath)) return emptyState();
  const parsed = JSON.parse(fs.readFileSync(statePath, 'utf8')) as RunState;
  if (parsed.version !== STATE_VERSION) {
    throw new Error(
      `State file ${statePath} has version ${parsed.version}, expected ${STATE_VERSION}`
    );
  }
  return parsed;
}

/** Erst in eine Nachbardatei, dann umbenennen — ein Abbruch mitten im Schreiben lässt den alten Stand stehen. */
function saveState(statePath: string, state: RunState): void {
  const tmp = `${statePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(state, null, 2));
  fs.renameSync(tmp, statePath);
}

export class LandtagNrwScraper extends BaseScraper {
  #qdrantClient: QdrantClient | null = null;
  readonly #gate = new PoliteGate(REQUEST_GAP_MS);
  #known = new Set<string>();

  constructor() {
    super({ collectionName: LANDTAG_NRW_COLLECTION, delayMs: REQUEST_GAP_MS });
  }

  async init(): Promise<void> {
    await mistralEmbeddingService.init();
  }

  /**
   * Erst beim ersten echten Lauf: ein Probelauf soll Qdrant nicht berühren —
   * `init()` legte dort sonst schon die Collection an.
   */
  async #qdrant(): Promise<QdrantClient> {
    if (!this.#qdrantClient) {
      const qdrant = getQdrantInstance();
      await qdrant.init(); // legt landtag_nrw_documents aus COLLECTION_SCHEMAS an, falls sie fehlt
      this.#qdrantClient = qdrant.client!;
    }
    return this.#qdrantClient;
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

    this.#known = options.dryRun ? new Set() : await this.#loadKnownIds();
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
      const { entries } = await this.#fetchList(part, page, summary);
      if (entries.length === 0) return;
      const outcomes = await this.#processEntries(entries, part, options, summary);
      if (!outcomes.includes('stored')) return;
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
    const state = loadState(statePath);
    const persist = () => {
      if (!options.dryRun) saveState(statePath, state);
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
        const { total, entries } = await this.#fetchList(part, partState.nextPage, summary);
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
    const url = `${LIST_URL}?wp=${WAHLPERIODE}&view=detail&dokart=${LANDTAG_PARTS[part]}&page=${page}`;
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

  async #downloadPdf(url: string): Promise<Buffer> {
    const buffer = await this.#gate.run(async () => {
      const res = await this.fetchWithRetry(url, {
        timeout: PDF_TIMEOUT_MS,
        userAgent: BRAND.botUserAgent,
        headers: { Accept: 'application/pdf' },
      });
      return Buffer.from(await res.arrayBuffer());
    });
    if (buffer.subarray(0, 5).toString('latin1') !== '%PDF-') {
      throw new Error(`not a PDF (${buffer.length} bytes)`);
    }
    return buffer;
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

    const body = await this.#extractText(entry, summary);
    if (!body.trim()) return 'empty';

    const text = `${headerTextOf(entry, part)}\n\n${body}`;
    const chunks = await smartChunkDocument(text, {
      baseMetadata: { title: entry.title, source: LANDTAG_NRW_SOURCE, source_url: entry.pdfUrl },
    });
    if (chunks.length === 0) return 'empty';
    summary.chunks += chunks.length;
    if (options.dryRun) return 'stored';

    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      buildEmbeddingTextsForChunks(chunks, entry.title)
    );
    const client = await this.#qdrant();
    if (known) {
      await batchDelete(client, LANDTAG_NRW_COLLECTION, {
        must: [{ key: 'document_id', match: { value: documentId } }],
      });
    }

    const base = documentPayloadOf(entry, part);
    const indexedAt = new Date().toISOString();
    const points = chunks.map((chunk, index) => ({
      id: generatePointId(LANDTAG_NRW_SOURCE, documentId, index),
      vector: embeddings[index],
      payload: {
        ...base,
        chunk_index: index,
        chunk_text: chunk.text,
        ...structurePayload(chunk),
        ...embeddingPayload(),
        ...offsetPayload(chunk),
        ...pagePayload(chunk),
        quality_score: chunkQualityService.calculateQualityScore(chunk.text),
        indexed_at: indexedAt,
        ...(index === 0 ? { full_text: text } : {}),
      },
    }));

    // Chunk 0 zuletzt: er ist das „fertig"-Zeichen für den nächsten Lauf.
    const ordered = [...points.slice(1), points[0]];
    for (let i = 0; i < ordered.length; i += UPSERT_BATCH) {
      await batchUpsert(client, LANDTAG_NRW_COLLECTION, ordered.slice(i, i + UPSERT_BATCH));
    }
    this.#known.add(documentId);
    this.stats.vectorsStored += points.length;

    recordSyncEvent({
      title: entry.title,
      sourceUrl: entry.pdfUrl,
      sourceGroupId: LANDTAG_NRW_SOURCE,
      sourceName: 'Landtag NRW',
      excerpt: toExcerpt(entry.abstract ?? body),
      landesverband: null,
      collection: LANDTAG_NRW_COLLECTION,
      eventType: known ? 'updated' : 'stored',
      publishedAt: entry.publishedAt,
    });
    return 'stored';
  }

  /**
   * PDF.js liest jede Seite; nur Tabellenseiten und Scans gehen an Mistral OCR
   * (`OcrService.applyTablePages`). Die Seitenmarken braucht es dafür und für
   * `page_number` je Chunk.
   */
  async #extractText(entry: LandtagListEntry, summary: LandtagRunSummary): Promise<string> {
    const buffer = await this.#downloadPdf(entry.pdfUrl);
    const tempPath = path.join(
      os.tmpdir(),
      `landtag_nrw_${crypto.randomBytes(8).toString('hex')}.pdf`
    );
    fs.writeFileSync(tempPath, buffer);
    try {
      const result = await ocrService.extractTextFromDocument(tempPath, undefined, {
        pageMarkers: true,
      });
      recordExtraction({ method: result.extractionMethod, pages: result.pageCount });
      summary.extractionMethods[result.extractionMethod] =
        (summary.extractionMethods[result.extractionMethod] ?? 0) + 1;
      return renumberPageMarkers(result.text ?? '', originalPagesOf(entry.pageRanges));
    } finally {
      fs.rmSync(tempPath, { force: true });
    }
  }

  /** document_id aller fertigen Dokumente — fertig heißt: Chunk 0 liegt da. */
  async #loadKnownIds(): Promise<Set<string>> {
    const client = await this.#qdrant();
    const ids = new Set<string>();
    let offset: string | number | null | undefined = undefined;
    do {
      const page = await client.scroll(LANDTAG_NRW_COLLECTION, {
        filter: { must: [{ key: 'chunk_index', match: { value: 0 } }] },
        with_payload: ['document_id'],
        with_vector: false,
        limit: 1000,
        ...(offset !== undefined && offset !== null ? { offset } : {}),
      });
      for (const p of page.points) {
        const id = p.payload?.document_id;
        if (typeof id === 'string') ids.add(id);
      }
      offset = page.next_page_offset as string | number | null | undefined;
    } while (offset !== undefined && offset !== null);
    return ids;
  }
}

let instance: LandtagNrwScraper | null = null;

export function getLandtagNrwScraper(): LandtagNrwScraper {
  if (!instance) instance = new LandtagNrwScraper();
  return instance;
}
