/**
 * Abgeordnetenhaus Berlin — Drucksachen, Plenar- und Ausschussprotokolle der
 * laufenden Wahlperiode in `landtag_berlin_documents`.
 *
 * Metadaten kommen aus der PARDOK-API (`pardokClient.ts`), Text aus den PDFs
 * über dieselbe Strecke wie im Landtag NRW (`services/scrapers/parliament/`).
 * Was eine Einheit ist, steht in `builders.ts`.
 *
 * Zwei Betriebsarten:
 *   - incremental (Nacht-Sync): nur Einträge, die PARDOK in den letzten
 *     `INCREMENTAL_DAYS` Tagen geändert hat; für ein betroffenes Protokoll
 *     werden dessen übrige Einträge nachgeladen.
 *   - backfill (Erstbefüllung, lokal): alle Einträge der Wahlperiode.
 * Beide überspringen, was schon in Qdrant liegt. Ein Stand muss deshalb nicht
 * gespeichert werden: nach einem Abbruch listet der nächste Lauf neu (rund 250
 * Anfragen) und macht beim ersten fehlenden Dokument weiter; Fehlschläge sind
 * nicht gespeichert und kommen dabei von selbst wieder dran. Ein PARDOK-Cursor
 * überlebte einen Neustart ohnehin nicht verlässlich.
 *
 * „Schon da" heißt: Chunk 0 liegt in Qdrant (er wird zuletzt geschrieben). Ein
 * Protokoll ist fertig, wenn sein letzter Abschnitt da ist — die Abschnitte
 * eines Protokolls werden der Reihe nach geschrieben.
 *
 * Ein Protokoll wird erst geschrieben, wenn sein jüngster PARDOK-Eintrag
 * `SETTLE_DAYS` alt ist: PARDOK erschließt eine Sitzung über mehrere Tage, und
 * ein zu früh geschriebenes Protokoll bekäme die späteren Einträge nie.
 */

import { env } from '../../../../config/env.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';
import {
  downloadPdf,
  extractPdfText,
  joinPages,
  ParliamentStore,
  PoliteGate,
  runPool,
  splitPages,
  type ParliamentDocument,
  type PdfText,
} from '../../parliament/index.js';

import {
  ausschussSessionsOf,
  chooseTops,
  documentPayloadOf,
  drucksacheUnitsOf,
  entriesOfTop,
  fileKeyOf,
  gremienOf,
  headerTextOf,
  isPendingAnfrage,
  LANDTAG_BERLIN_COLLECTION,
  LANDTAG_BERLIN_SOURCE,
  latestDateOf,
  plenarPagesOf,
  plenarUnitsOf,
  printedPageOffsetOf,
  splitTops,
  WAHLPERIODE,
  type AusschussSession,
  type DrucksacheUnit,
  type PlenarUnit,
  type UnitDescription,
} from './builders.js';
import {
  PARDOK_ENDPOINTS,
  PardokClient,
  type PardokEntry,
  type PardokPart,
} from './pardokClient.js';

import type { ScraperResult } from '../../types.js';

const log = createLogger('LandtagBerlinScraper');

/** Mindestabstand zwischen zwei Anfragen an das Abgeordnetenhaus. */
const REQUEST_GAP_MS = 1000;
const INCREMENTAL_DAYS = 14;
const SETTLE_DAYS = 2;
/** Ein Tagesordnungspunkt ohne zugeordneten Eintrag und mit weniger Text ist Verfahren („ohne Aussprache abgeschlossen"). */
const TRIVIAL_TOP_CHARS = 300;

export const ALL_LANDTAG_BERLIN_PARTS = Object.keys(PARDOK_ENDPOINTS) as PardokPart[];

export interface LandtagBerlinRunOptions {
  mode: 'incremental' | 'backfill';
  parts?: PardokPart[];
  /** Einheiten, die gleichzeitig ausgelesen und eingebettet werden. */
  concurrency?: number;
  /** Nach so vielen gespeicherten Dokumenten aufhören (Probelauf). */
  limit?: number;
  /** Herunterladen, auslesen und zerlegen, aber nicht einbetten und nicht schreiben. */
  dryRun?: boolean;
  /** Auch Dokumente neu schreiben, die schon da sind. */
  force?: boolean;
}

export interface LandtagBerlinRunSummary {
  stored: number;
  skipped: number;
  excluded: number;
  /** Protokolle, deren Einträge PARDOK noch erschließt. */
  waiting: number;
  failed: number;
  listPages: number;
  chunks: number;
  extractionMethods: Record<string, number>;
  errors: string[];
}

const daysAgo = (days: number): string =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

export class LandtagBerlinScraper extends BaseScraper {
  readonly #gate = new PoliteGate(REQUEST_GAP_MS);
  readonly #store = new ParliamentStore(
    LANDTAG_BERLIN_COLLECTION,
    LANDTAG_BERLIN_SOURCE,
    'Abgeordnetenhaus Berlin'
  );
  #pardokClient: PardokClient | null = null;
  /** document_id → protocol_id/segment_index/segment_count von Chunk 0. */
  #known = new Map<string, Record<string, unknown>>();
  #completeProtocols = new Set<string>();

  constructor() {
    super({ collectionName: LANDTAG_BERLIN_COLLECTION, delayMs: REQUEST_GAP_MS });
  }

  async init(): Promise<void> {
    this.#pardok();
    await mistralEmbeddingService.init();
  }

  /** Ohne Schlüssel lieferte PARDOK nur 401 — besser gleich laut scheitern. */
  #pardok(): PardokClient {
    if (!env.PARDOK_API_KEY) throw new Error('PARDOK_API_KEY is not set');
    this.#pardokClient ??= new PardokClient(
      this.#gate,
      (url, opts) => this.fetchWithRetry(url, opts),
      env.PARDOK_API_KEY
    );
    return this.#pardokClient;
  }

  /** BaseScraper-Vertrag — der Nacht-Sync. */
  async scrape(): Promise<ScraperResult> {
    this.initializeSession();
    const summary = await this.run({ mode: 'incremental' });
    return { ...this.buildResult(), documentsProcessed: summary.stored, errors: summary.errors };
  }

  async run(options: LandtagBerlinRunOptions): Promise<LandtagBerlinRunSummary> {
    const parts = options.parts ?? ALL_LANDTAG_BERLIN_PARTS;
    const summary: LandtagBerlinRunSummary = {
      stored: 0,
      skipped: 0,
      excluded: 0,
      waiting: 0,
      failed: 0,
      listPages: 0,
      chunks: 0,
      extractionMethods: {},
      errors: [],
    };

    this.#known = options.dryRun
      ? new Map<string, Record<string, unknown>>()
      : await this.#store.loadKnown(['protocol_id', 'segment_index', 'segment_count']);
    this.#completeProtocols = new Set(
      [...this.#known.values()]
        .filter(
          (p) =>
            typeof p.segment_index === 'number' && p.segment_index === Number(p.segment_count) - 1
        )
        .map((p) => String(p.protocol_id))
    );
    log.info(
      `[landtag-berlin] ${this.#known.size} documents already in ${LANDTAG_BERLIN_COLLECTION}`
    );

    if (options.mode === 'incremental' && this.#known.size === 0 && !options.dryRun) {
      // Vor der Erstbefüllung arbeitete sich der Nacht-Sync sonst nur durch die
      // letzten zwei Wochen und ließe den Rest der Wahlperiode liegen.
      log.warn(
        '[landtag-berlin] collection is empty — run scripts/backfill-landtag-berlin.ts first'
      );
      return summary;
    }

    const base: Record<string, string> = { 'f.wahlperiode': String(WAHLPERIODE) };
    const filters =
      options.mode === 'incremental'
        ? { ...base, 'f.aktualisiert.start': daysAgo(INCREMENTAL_DAYS) }
        : base;

    for (const part of parts) {
      if (this.#limitReached(options, summary)) break;
      const entries = await this.#listAll(part, filters, summary);
      log.info(`[landtag-berlin] ${part}: ${entries.length} entries`);
      if (part === 'drucksache') {
        await this.#drucksachen(entries, options, summary);
      } else if (part === 'plenarprotokoll') {
        await this.#plenar(entries, base, options, summary);
      } else {
        await this.#ausschuss(entries, base, options, summary);
      }
    }

    log.info(
      `[landtag-berlin] done: stored=${summary.stored} skipped=${summary.skipped} excluded=${summary.excluded} waiting=${summary.waiting} failed=${summary.failed} listPages=${summary.listPages} chunks=${summary.chunks} methods=${JSON.stringify(summary.extractionMethods)}`
    );
    return summary;
  }

  #limitReached(options: LandtagBerlinRunOptions, summary: LandtagBerlinRunSummary): boolean {
    return options.limit !== undefined && summary.stored >= options.limit;
  }

  async #listAll(
    part: PardokPart,
    filters: Record<string, string>,
    summary: LandtagBerlinRunSummary
  ): Promise<PardokEntry[]> {
    const entries: PardokEntry[] = [];
    summary.listPages += await this.#pardok().list(part, filters, (page) => {
      entries.push(...page);
    });
    return entries;
  }

  /** Fehler einer Einheit zählen, ohne den Lauf abzubrechen. */
  async #guard(
    label: string,
    summary: LandtagBerlinRunSummary,
    task: () => Promise<void>
  ): Promise<void> {
    try {
      await task();
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      summary.failed += 1;
      summary.errors.push(`${label}: ${message}`);
      log.warn(`[landtag-berlin] ${label} failed: ${message}`);
    }
  }

  // ── Drucksachen ────────────────────────────────────────────────────────────

  async #drucksachen(
    entries: PardokEntry[],
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    const units = drucksacheUnitsOf(entries);
    await runPool(units, options.concurrency ?? 3, (unit) =>
      this.#guard(unit.pdfUrl, summary, () => this.#drucksache(unit, options, summary))
    );
  }

  async #drucksache(
    unit: DrucksacheUnit,
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    if (this.#limitReached(options, summary)) return;
    if (isPendingAnfrage(unit)) {
      summary.excluded += 1;
      return;
    }
    const documentId = `agh-${fileKeyOf(unit.pdfUrl)}`;
    const known = this.#known.has(documentId);
    if (known && !options.force) {
      summary.skipped += 1;
      return;
    }
    const main = unit.entries.find((e) => e.docType !== 'Antwort') ?? unit.entries[0];
    const extraction = await this.#extract(unit.pdfUrl, documentId, summary);
    await this.#write(
      {
        documentId,
        part: 'drucksache',
        title: main.title,
        sourceUrl: unit.pdfUrl,
        documentNumber: main.documentNumber,
        publishedAt: latestDateOf(unit.entries),
        entries: unit.entries,
      },
      extraction.text,
      extraction,
      known,
      options,
      summary
    );
  }

  // ── Plenarprotokolle ───────────────────────────────────────────────────────

  async #plenar(
    changed: PardokEntry[],
    base: Record<string, string>,
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    const numbers = [...new Set(changed.map((e) => e.documentNumber).filter(Boolean))];
    const protocols = new Map<string, PlenarUnit[]>();
    for (const number of numbers) {
      // Im Nacht-Sync fehlen die unveränderten Einträge desselben Protokolls.
      const entries =
        options.mode === 'incremental'
          ? await this.#listAll('plenarprotokoll', { ...base, 'f.dokumentnummer': number }, summary)
          : changed.filter((e) => e.documentNumber === number);
      const units = plenarUnitsOf(entries);
      // Einträge ohne Wortprotokoll oder ohne lesbare Seitenangabe.
      summary.excluded += entries.length - units.reduce((n, u) => n + u.entries.length, 0);
      for (const unit of units) {
        protocols.set(unit.protocolUrl, [...(protocols.get(unit.protocolUrl) ?? []), unit]);
      }
    }
    await runPool([...protocols], options.concurrency ?? 3, ([protocolUrl, units]) =>
      this.#guard(protocolUrl, summary, () =>
        this.#plenarProtocol(protocolUrl, units, options, summary)
      )
    );
  }

  async #plenarProtocol(
    protocolUrl: string,
    units: PlenarUnit[],
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    if (this.#limitReached(options, summary)) return;
    const protocolId = `agh-${fileKeyOf(protocolUrl)}`;
    if (this.#completeProtocols.has(protocolId) && !options.force) {
      summary.skipped += units.length;
      return;
    }
    if (!this.#settled(units.flatMap((u) => u.entries))) {
      summary.waiting += 1;
      return;
    }
    const extraction = await this.#extract(protocolUrl, protocolId, summary);
    const pages = splitPages(extraction.text);
    const offset = printedPageOffsetOf(pages);
    if (offset === null) throw new Error('no printed page numbers in the protocol');

    const segments = units
      .map((unit) => ({ unit, pages: plenarPagesOf(pages, offset, unit.printedPages) }))
      .filter((s) => s.pages.length > 0);
    for (const [index, { unit, pages: unitPages }] of segments.entries()) {
      const first = unit.entries[0];
      const documentId = `${protocolId}-${unit.printedPages[0]}-${unit.printedPages.at(-1)}`;
      await this.#write(
        {
          documentId,
          part: 'plenarprotokoll',
          title: first.title,
          sourceUrl: protocolUrl,
          documentNumber: first.documentNumber,
          publishedAt: latestDateOf(unit.entries),
          entries: unit.entries,
          segment: { protocolId, index, count: segments.length },
        },
        joinPages(unitPages),
        extraction,
        this.#known.has(documentId),
        options,
        summary
      );
    }
  }

  // ── Ausschussprotokolle ────────────────────────────────────────────────────

  async #ausschuss(
    changed: PardokEntry[],
    base: Record<string, string>,
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    let sessions = ausschussSessionsOf(changed);
    if (options.mode === 'incremental') {
      // Die unveränderten Einträge derselben Sitzung nachladen: gleiche
      // Nummer, gleicher Tag, danach über das Protokoll-PDF zugeordnet.
      const complete: AusschussSession[] = [];
      for (const session of sessions) {
        const sample = session.entries[0];
        if (!sample.publishedAt) continue;
        const entries = await this.#listAll(
          'ausschussprotokoll',
          {
            ...base,
            'f.dokumentnummer': sample.documentNumber,
            'f.datum.start': sample.publishedAt,
            'f.datum.end': sample.publishedAt,
          },
          summary
        );
        complete.push(...ausschussSessionsOf(entries).filter((s) => s.key === session.key));
      }
      sessions = complete;
    }
    await runPool(sessions, options.concurrency ?? 3, (session) =>
      this.#guard(session.key, summary, () => this.#ausschussSession(session, options, summary))
    );
  }

  async #ausschussSession(
    session: AusschussSession,
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    if (this.#limitReached(options, summary)) return;
    const protocolId = `agh-${fileKeyOf(`${session.key}.pdf`)}`;
    if (this.#completeProtocols.has(protocolId) && !options.force) {
      summary.skipped += 1;
      return;
    }
    if (!this.#settled(session.entries)) {
      summary.waiting += 1;
      return;
    }

    const read = async (url: string | null) => {
      if (!url) return null;
      const extraction = await this.#extract(url, protocolId, summary);
      return { url, extraction, tops: splitTops(extraction.text) };
    };
    const wort = await read(session.wortprotokoll);
    const inhalt = await read(session.inhaltsprotokoll);
    const sessionGremien = gremienOf(session.entries);
    const first = session.entries[0];

    const tops = chooseTops(wort, inhalt)
      .map((top) => ({ top, entries: entriesOfTop(top, session.entries) }))
      .filter(({ top, entries }) => entries.length > 0 || top.text.length >= TRIVIAL_TOP_CHARS);
    // Gezählt gegen alle Punkte beider Protokolle: auch einer, der nur als
    // Verweis („Siehe Inhaltsprotokoll.") vorkommt, fehlt sonst spurlos.
    const topNumbers = new Set(
      [...(wort?.tops ?? []), ...(inhalt?.tops ?? [])].map((t) => t.number)
    );
    summary.excluded += topNumbers.size - tops.length;

    for (const [index, { top, entries }] of tops.entries()) {
      const extraction = top.sourceUrl === wort?.url ? wort.extraction : inhalt!.extraction;
      const documentId = `${protocolId}-top${top.number}`;
      const sessionLabel = `${sessionGremien[0] ?? 'Ausschuss'}, ${first.documentNumber}. Sitzung`;
      await this.#write(
        {
          documentId,
          part: 'ausschussprotokoll',
          title: entries[0]?.title ?? `${sessionLabel}: ${top.heading}`,
          sourceUrl: top.sourceUrl,
          documentNumber: first.documentNumber,
          publishedAt: first.publishedAt,
          entries,
          gremien: sessionGremien,
          segment: { protocolId, index, count: tops.length },
        },
        `${sessionLabel}, Punkt ${top.number} der Tagesordnung\n\n${top.text}`,
        extraction,
        this.#known.has(documentId),
        options,
        summary
      );
    }
  }

  // ── Gemeinsam ──────────────────────────────────────────────────────────────

  #settled(entries: readonly PardokEntry[]): boolean {
    const latest = entries
      .map((e) => e.updatedAt)
      .filter((d): d is string => d !== null)
      .sort()
      .at(-1);
    return !latest || latest <= daysAgo(SETTLE_DAYS);
  }

  async #extract(url: string, label: string, summary: LandtagBerlinRunSummary): Promise<PdfText> {
    const buffer = await downloadPdf(this.#gate, (u, o) => this.fetchWithRetry(u, o), url);
    const result = await extractPdfText(buffer, `[landtag-berlin] ${label}`);
    summary.extractionMethods[result.method] = (summary.extractionMethods[result.method] ?? 0) + 1;
    return result;
  }

  async #write(
    unit: UnitDescription,
    body: string,
    extraction: PdfText,
    known: boolean,
    options: LandtagBerlinRunOptions,
    summary: LandtagBerlinRunSummary
  ): Promise<void> {
    if (known && !options.force) {
      summary.skipped += 1;
      return;
    }
    if (!body.trim()) {
      summary.excluded += 1;
      return;
    }
    const text = `${headerTextOf(unit)}\n\n${body}`;
    const payload = documentPayloadOf(unit, text);
    const doc: ParliamentDocument = {
      documentId: unit.documentId,
      title: unit.title,
      sourceUrl: unit.sourceUrl,
      text,
      payload,
      extraction: { method: extraction.method, pageCount: extraction.pageCount },
      excerpt: body,
      publishedAt: unit.publishedAt,
    };
    if (options.dryRun) {
      summary.chunks += (await this.#store.chunk(doc)).length;
      summary.stored += 1;
      return;
    }
    const written = await this.#store.store(doc, known);
    if (written === 0) {
      summary.excluded += 1;
      return;
    }
    this.#known.set(unit.documentId, payload);
    summary.chunks += written;
    summary.stored += 1;
    this.stats.vectorsStored += written;
  }
}

let instance: LandtagBerlinScraper | null = null;

export function getLandtagBerlinScraper(): LandtagBerlinScraper {
  if (!instance) instance = new LandtagBerlinScraper();
  return instance;
}
