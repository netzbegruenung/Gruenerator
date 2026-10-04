/**
 * BundestagDipScraper
 *
 * Hält `bundestag_dip_documents` aktuell: Plenarprotokolle (je Rede eine
 * Einheit) und Drucksachen der fünf Typen mit Struktur (je Abschnitt eine
 * Einheit) aus der DIP-API. Den Grundbestand hat der einmalige Import aus
 * Bundestag Wrapped geschrieben (`scripts/import-bundestag-wrapped.ts`).
 *
 * Inkrementell ist der Normalfall, auch im nächtlichen Voll-Lauf: der
 * Content-Sync ruft Einzelquellen ohne `recent` auf, und alle Volltexte dreier
 * Wahlperioden jede Nacht neu zu laden wäre die falsche Größenordnung. Gefragt
 * wird deshalb nur nach Dokumenten, die DIP seit dem letzten Schreiben (minus
 * einem Tag Puffer, mindestens aber drei Tage) als aktualisiert führt — nach
 * einem Ausfall holt der nächste Lauf so die ganze Lücke nach. `forceUpdate`
 * lässt das Fenster weg und schreibt alles neu.
 *
 * Danach entscheidet der Hash des Volltexts. Ein Dokument OHNE gespeicherten
 * Hash (importierter Bestand) gilt als unbekannt und wird genau einmal neu
 * gelesen — dieselbe Regel wie beim PDF-Fingerprint.
 */
import { env } from '../../../../config/env.js';
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import { scrollDocuments } from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';

import {
  buildDrucksacheParent,
  buildProtokollParent,
  drucksacheParentId,
  protokollParentId,
  type DipParent,
} from './builders.js';
import { DipClient, type DipDrucksacheText, type DipPlenarprotokollText } from './dipClient.js';
import { parseDrucksache } from './drucksacheParser.js';
import { parseSpeeches } from './protokollParser.js';
import { DIP_COLLECTION, writeParent } from './store.js';

import type { ScraperResult } from '../../types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

const log = createLogger('BundestagDipScraper');

export const DIP_WAHLPERIODEN = [19, 20, 21] as const;
export const DIP_DRUCKSACHETYPEN = [
  'Gesetzentwurf',
  'Kleine Anfrage',
  'Große Anfrage',
  'Antrag',
  'Beschlussempfehlung und Bericht',
] as const;
const DAY_MS = 86_400_000;
// Mindestfenster: überlappt den täglichen Takt, damit ein Lauf, der nur einen
// Teil der Typen geschafft hat, in den nächsten Nächten nachgeholt wird.
const LOOKBACK_DAYS = 3;

interface StoredState {
  known: boolean;
  /** Volltext-Hash; `null` bei importierten Dokumenten. */
  hash: string | null;
}

export interface DipScrapeOptions {
  forceUpdate?: boolean;
  dryRun?: boolean;
}

export interface DipScrapeSummary {
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
}

export class BundestagDipScraper extends BaseScraper {
  private qdrantClient!: QdrantClient;
  private dip!: DipClient;

  constructor() {
    super({ collectionName: DIP_COLLECTION, baseUrl: 'https://search.dip.bundestag.de' });
  }

  async init(): Promise<void> {
    if (!env.DIP_API_KEY) throw new Error('DIP_API_KEY is not set');
    const qdrant = getQdrantInstance();
    await qdrant.init(); // legt bundestag_dip_documents aus COLLECTION_SCHEMAS an
    await mistralEmbeddingService.init();
    this.qdrantClient = qdrant.client!;
    this.dip = new DipClient(env.DIP_API_KEY);
  }

  async scrape(): Promise<ScraperResult> {
    await this.scrapeAllSources({});
    return this.buildResult();
  }

  async scrapeAllSources(options: DipScrapeOptions): Promise<DipScrapeSummary> {
    const summary: DipScrapeSummary = {
      stored: 0,
      updated: 0,
      skipped: 0,
      fetchErrors: 0,
      errors: 0,
    };
    this.initializeSession();

    const window: Record<string, string> = options.forceUpdate
      ? {}
      : { 'f.aktualisiert.start': await this.windowStart() };
    log.info(`[bundestag-dip] window ${JSON.stringify(window)}`);

    for (const wp of DIP_WAHLPERIODEN) {
      try {
        await this.dip.forEachPage<DipPlenarprotokollText>(
          'plenarprotokoll-text',
          { 'f.wahlperiode': wp, 'f.zuordnung': 'BT', ...window },
          async (docs) => {
            for (const doc of docs) await this.handleProtokoll(doc, options, summary);
          }
        );
      } catch (error: unknown) {
        summary.fetchErrors += 1;
        log.error(`[bundestag-dip] Plenarprotokolle WP${wp}: ${errorMessage(error)}`);
      }

      for (const typ of DIP_DRUCKSACHETYPEN) {
        try {
          await this.dip.forEachPage<DipDrucksacheText>(
            'drucksache-text',
            { 'f.wahlperiode': wp, 'f.drucksachetyp': typ, 'f.zuordnung': 'BT', ...window },
            async (docs) => {
              for (const doc of docs) await this.handleDrucksache(doc, options, summary);
            }
          );
        } catch (error: unknown) {
          summary.fetchErrors += 1;
          log.error(`[bundestag-dip] ${typ} WP${wp}: ${errorMessage(error)}`);
        }
      }
    }

    log.info(
      `[bundestag-dip] done: stored=${summary.stored} updated=${summary.updated} skipped=${summary.skipped} fetchErrors=${summary.fetchErrors} errors=${summary.errors}`
    );
    return summary;
  }

  private async handleProtokoll(
    doc: DipPlenarprotokollText,
    options: DipScrapeOptions,
    summary: DipScrapeSummary
  ): Promise<void> {
    if (doc.herausgeber && doc.herausgeber !== 'BT') return;
    if (!doc.text) return; // DIP führt das Protokoll, der Volltext folgt später
    const parentId = protokollParentId(doc.id);
    const hash = this.generateHash(doc.text);
    const stored = await this.storedState(parentId);
    if (!options.forceUpdate && stored.hash === hash) {
      summary.skipped += 1;
      return;
    }

    const parent = buildProtokollParent(
      {
        id: doc.id,
        dokumentnummer: doc.dokumentnummer,
        wahlperiode: doc.wahlperiode ?? null,
        datum: doc.datum ?? doc.fundstelle?.datum ?? null,
        pdfUrl: doc.fundstelle?.pdf_url ?? null,
      },
      parseSpeeches(doc.text),
      hash
    );
    await this.write(parent, stored.known, options, summary);
  }

  private async handleDrucksache(
    doc: DipDrucksacheText,
    options: DipScrapeOptions,
    summary: DipScrapeSummary
  ): Promise<void> {
    if (doc.herausgeber && doc.herausgeber !== 'BT') return;
    if (!doc.text || !doc.drucksachetyp) return;
    const parentId = drucksacheParentId(doc.id);
    const urheber = (doc.urheber ?? []).map((u) => u.titel ?? '').filter(Boolean);
    // Mit Urhebern gehasht: DIP trägt sie bei frischen Drucksachen erst später
    // nach, der Volltext bleibt dabei gleich.
    const hash = this.generateHash(`${doc.text}\n${urheber.join('|')}`);
    const stored = await this.storedState(parentId);
    if (!options.forceUpdate && stored.hash === hash) {
      summary.skipped += 1;
      return;
    }

    const parent = buildDrucksacheParent(
      {
        id: doc.id,
        dokumentnummer: doc.dokumentnummer,
        drucksachetyp: doc.drucksachetyp,
        wahlperiode: doc.wahlperiode ?? null,
        datum: doc.datum ?? null,
        titel: doc.titel ?? doc.dokumentnummer,
        urheber,
        headerText: doc.text,
        pdfUrl: doc.fundstelle?.pdf_url ?? null,
      },
      parseDrucksache(doc.text, doc.drucksachetyp),
      hash
    );
    await this.write(parent, stored.known, options, summary);
  }

  private async write(
    parent: DipParent,
    known: boolean,
    options: DipScrapeOptions,
    summary: DipScrapeSummary
  ): Promise<void> {
    if (parent.units.length === 0) {
      summary.skipped += 1;
      return;
    }
    if (!options.dryRun) {
      try {
        this.stats.vectorsStored += await writeParent(this.qdrantClient, parent);
      } catch (error: unknown) {
        summary.errors += 1;
        log.warn(`[bundestag-dip] ${parent.parentId} failed: ${errorMessage(error)}`);
        return;
      }
    }
    if (known) summary.updated += 1;
    else summary.stored += 1;
  }

  /** Kopf-Chunk des Dokuments, über den indizierten `parent_id`. */
  private async storedState(parentId: string): Promise<StoredState> {
    const [head] = await scrollDocuments(
      this.qdrantClient,
      DIP_COLLECTION,
      {
        must: [
          { key: 'parent_id', match: { value: parentId } },
          { key: 'chunk_index', match: { value: 0 } },
        ],
      },
      { limit: 1, withPayload: true, withVector: false }
    );
    if (!head) return { known: false, hash: null };
    const hash = head.payload.content_hash;
    return { known: true, hash: typeof hash === 'string' ? hash : null };
  }

  /** Beginn des Aktualisierungsfensters (ISO). */
  private async windowStart(): Promise<string> {
    const page = await this.qdrantClient.scroll(DIP_COLLECTION, {
      limit: 1,
      order_by: { key: 'indexed_at', direction: 'desc' },
      with_payload: ['indexed_at'],
      with_vector: false,
    });
    const latest = Date.parse(String(page.points[0]?.payload?.indexed_at ?? ''));
    const floor = Date.now() - LOOKBACK_DAYS * DAY_MS;
    const start = Number.isNaN(latest) ? floor : Math.min(floor, latest - DAY_MS);
    return new Date(start).toISOString();
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

let instance: BundestagDipScraper | null = null;

export function getBundestagDipScraperService(): BundestagDipScraper {
  if (!instance) instance = new BundestagDipScraper();
  return instance;
}
