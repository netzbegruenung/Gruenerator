/**
 * Parteitage — Anträge, Beschlüsse und Änderungsanträge aus Antragsgrün in
 * `parteitage_documents` (Notebook „Parteitage").
 *
 * Je Lauf und Seite (`instances.ts`): Konsultationsliste, dann je Konsultation
 * die Übersicht (ein Abruf mit allen Anträgen und ÄA-Links). Einzeln abgerufen
 * wird ein Dokument nur, wenn
 *   - es noch nicht in Qdrant liegt,
 *   - die Übersicht es anders zeigt als beim letzten Mal (`list_signature`:
 *     Status, Kürzel, Titel), oder
 *   - seine Konsultation aktiv ist (`ACTIVE_DAYS`): das Votum der
 *     Antragskommission steht nur im Einzelabruf, und es ändert sich bis zum
 *     Parteitag.
 * Neu eingebettet wird nur, wenn sich der Text ändert (`content_hash`).
 *
 * Weg muss, was nicht mehr öffentlich ist: ein Dokument, das aus der Übersicht
 * einer öffentlichen Konsultation verschwindet (zurückgezogen und unsichtbar),
 * und alle Dokumente einer Konsultation, die jetzt eine Anmeldung verlangt.
 * Ist die ganze Seite nicht erreichbar, wird nichts gelöscht.
 *
 * Bewerbungen werden abgerufen, um sie zu erkennen, und nie geschrieben
 * (`isCandidacy`). Weil sie dadurch nie „bekannt" sind, holt jeder Lauf sie in
 * aktiven wie inaktiven Konsultationen neu — bei NRW rund ein Abruf je
 * Bewerbung und Nacht. Ein eigener Merkzettel lohnt bei der Menge nicht.
 */

import { batchDelete } from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';
import { isStorageFull, ParliamentStore, PoliteGate, runPool } from '../../parliament/index.js';

import {
  AntragsgruenClient,
  NotPublicError,
  type AmendmentLink,
  type ConsultationRef,
  type MotionLink,
} from './antragsgruenClient.js';
import {
  amendmentDocumentId,
  amendmentSignatureOf,
  amendmentUnitOf,
  isCandidacy,
  motionDocumentId,
  motionSignatureOf,
  motionUnitOf,
  PARTEITAGE_COLLECTION,
  PARTEITAGE_SOURCE,
  type ParteitagContext,
  type ParteitageUnit,
} from './builders.js';
import { ANTRAGSGRUEN_INSTANCES, type AntragsgruenInstance } from './instances.js';

import type { ScraperResult } from '../../types.js';

const log = createLogger('ParteitageScraper');

/** Mindestabstand zwischen zwei Anfragen an eine Antragsgrün-Seite. */
const REQUEST_GAP_MS = 500;
/**
 * Eine Konsultation gilt so lange als aktiv: angelegt wird sie Wochen bis
 * Monate vor dem Parteitag (LDK Essen: 20.08. für den 13.–15.11.2026), danach
 * folgen noch Beschlussfassung und Protokoll.
 */
const ACTIVE_DAYS = 180;

export interface ParteitageRunOptions {
  /** Anträge, die gleichzeitig abgerufen und eingebettet werden (die Abrufe laufen trotzdem nacheinander). */
  concurrency?: number;
  /** Nach so vielen geschriebenen Dokumenten aufhören (Probelauf). */
  limit?: number;
  /** Ab diesem Zeitpunkt (Epoch ms) beginnt kein neues Dokument mehr; der nächste Lauf macht weiter. */
  stopAt?: number;
  /** Abrufen und zerlegen, aber nicht einbetten, schreiben oder löschen. */
  dryRun?: boolean;
  /** Jedes Dokument abrufen und neu schreiben. */
  force?: boolean;
  /** Nur diese Konsultationen (`parteitag_id`, z. B. `nrw/ldk26-02`) — für gezielte Nachläufe. */
  consultations?: readonly string[];
}

export interface ParteitageRunSummary {
  stored: number;
  updated: number;
  /** Bekannt und unverändert — ohne Abruf oder nach Abruf mit gleichem Text. */
  skipped: number;
  /** Bewerbungen und Dokumente ohne Text. */
  excluded: number;
  /** Konsultationen, die eine Anmeldung verlangen. */
  notPublic: number;
  /** Gelöschte Dokumente (nicht mehr öffentlich). */
  removed: number;
  failed: number;
  chunks: number;
  errors: string[];
}

const isActive = (ref: ConsultationRef): boolean =>
  !ref.date_published ||
  Date.now() - new Date(ref.date_published).getTime() < ACTIVE_DAYS * 86_400_000;

export class ParteitageScraper extends BaseScraper {
  readonly #store = new ParliamentStore(PARTEITAGE_COLLECTION, PARTEITAGE_SOURCE, 'Parteitage');
  /** document_id → Payload-Felder von Chunk 0. */
  #known = new Map<string, Record<string, unknown>>();

  constructor() {
    super({ collectionName: PARTEITAGE_COLLECTION, delayMs: REQUEST_GAP_MS });
  }

  async init(): Promise<void> {
    await mistralEmbeddingService.init();
  }

  /** BaseScraper-Vertrag — der Nacht-Sync. */
  async scrape(): Promise<ScraperResult> {
    this.initializeSession();
    const summary = await this.run({});
    return { ...this.buildResult(), documentsProcessed: summary.stored, errors: summary.errors };
  }

  async run(options: ParteitageRunOptions): Promise<ParteitageRunSummary> {
    const summary: ParteitageRunSummary = {
      stored: 0,
      updated: 0,
      skipped: 0,
      excluded: 0,
      notPublic: 0,
      removed: 0,
      failed: 0,
      chunks: 0,
      errors: [],
    };
    this.#known = options.dryRun
      ? new Map<string, Record<string, unknown>>()
      : await this.#store.loadKnown(['parteitag_id', 'list_signature', 'content_hash']);
    log.info(`[parteitage] ${this.#known.size} documents already in ${PARTEITAGE_COLLECTION}`);

    for (const instance of ANTRAGSGRUEN_INSTANCES) {
      if (this.#limitReached(options, summary)) break;
      const client = new AntragsgruenClient(instance, new PoliteGate(REQUEST_GAP_MS), (url, opts) =>
        this.fetchWithRetry(url, opts)
      );
      let refs: ConsultationRef[];
      try {
        refs = await client.listConsultations();
      } catch (error: unknown) {
        // Ganze Seite weg oder API aus: nichts löschen, nur melden.
        this.#fail(`${instance.host}`, error, summary);
        continue;
      }
      for (const ref of refs) {
        if (this.#limitReached(options, summary)) break;
        if (
          options.consultations &&
          !options.consultations.includes(`${instance.id}/${ref.url_path}`)
        ) {
          continue;
        }
        await this.#consultation(client, { instance, consultation: ref }, options, summary);
      }
    }

    log.info(
      `[parteitage] done: stored=${summary.stored} updated=${summary.updated} skipped=${summary.skipped} excluded=${summary.excluded} notPublic=${summary.notPublic} removed=${summary.removed} failed=${summary.failed} chunks=${summary.chunks}`
    );
    return summary;
  }

  #limitReached(options: ParteitageRunOptions, summary: ParteitageRunSummary): boolean {
    return (
      (options.limit !== undefined && summary.stored + summary.updated >= options.limit) ||
      (options.stopAt !== undefined && Date.now() >= options.stopAt)
    );
  }

  #fail(label: string, error: unknown, summary: ParteitageRunSummary): void {
    if (isStorageFull(error)) throw error;
    const message = error instanceof Error ? error.message : String(error);
    summary.failed += 1;
    summary.errors.push(`${label}: ${message}`);
    log.warn(`[parteitage] ${label} failed: ${message}`);
  }

  async #consultation(
    client: AntragsgruenClient,
    ctx: ParteitagContext,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    const parteitagId = `${ctx.instance.id}/${ctx.consultation.url_path}`;
    let overview;
    try {
      overview = await client.consultation(ctx.consultation);
    } catch (error: unknown) {
      if (error instanceof NotPublicError) {
        summary.notPublic += 1;
        await this.#removeVanished(parteitagId, new Set(), options, summary);
        return;
      }
      this.#fail(parteitagId, error, summary);
      return;
    }

    const active = isActive(ctx.consultation);
    const seen = new Set<string>();
    const tasks: Array<() => Promise<void>> = [];
    for (const link of overview.motion_links) {
      if (link.type === 'amendment') {
        seen.add(amendmentDocumentId(ctx.instance, link.id));
        tasks.push(() => this.#amendment(client, link, ctx, active, options, summary));
        continue;
      }
      const motionId = motionDocumentId(ctx.instance, link.id);
      seen.add(motionId);
      tasks.push(() => this.#motion(client, link, ctx, active, options, summary));
      for (const amendment of link.amendment_links) {
        seen.add(amendmentDocumentId(ctx.instance, amendment.id));
        tasks.push(() => this.#amendment(client, amendment, ctx, active, options, summary));
      }
    }
    await runPool(tasks, options.concurrency ?? 3, (task) => task());
    // Nur nach einem vollständigen Durchgang: ein abgebrochener Lauf hätte
    // sonst die nicht mehr erreichten Dokumente als verschwunden gezählt.
    if (!this.#limitReached(options, summary)) {
      await this.#removeVanished(parteitagId, seen, options, summary);
    }
  }

  #needsFetch(
    documentId: string,
    signature: string,
    active: boolean,
    options: ParteitageRunOptions
  ): boolean {
    const known = this.#known.get(documentId);
    return Boolean(options.force) || !known || known.list_signature !== signature || active;
  }

  async #motion(
    client: AntragsgruenClient,
    link: MotionLink,
    ctx: ParteitagContext,
    active: boolean,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    if (this.#limitReached(options, summary)) return;
    const documentId = motionDocumentId(ctx.instance, link.id);
    if (!this.#needsFetch(documentId, motionSignatureOf(link), active, options)) {
      summary.skipped += 1;
      return;
    }
    try {
      const motion = await client.motion(link);
      if (isCandidacy(motion)) {
        summary.excluded += 1;
        return;
      }
      await this.#write(motionUnitOf(motion, link, ctx), options, summary);
    } catch (error: unknown) {
      this.#fail(documentId, error, summary);
    }
  }

  async #amendment(
    client: AntragsgruenClient,
    link: AmendmentLink,
    ctx: ParteitagContext,
    active: boolean,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    if (this.#limitReached(options, summary)) return;
    const documentId = amendmentDocumentId(ctx.instance, link.id);
    if (!this.#needsFetch(documentId, amendmentSignatureOf(link), active, options)) {
      summary.skipped += 1;
      return;
    }
    try {
      const amendment = await client.amendment(link);
      await this.#write(amendmentUnitOf(amendment, link, ctx), options, summary);
    } catch (error: unknown) {
      this.#fail(documentId, error, summary);
    }
  }

  async #write(
    unit: ParteitageUnit,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    const known = this.#known.get(unit.documentId);
    if (known && known.content_hash === unit.payload.content_hash && !options.force) {
      summary.skipped += 1;
      return;
    }
    if (!unit.body.trim()) {
      summary.excluded += 1;
      return;
    }
    const doc = {
      documentId: unit.documentId,
      title: unit.title,
      sourceUrl: unit.sourceUrl,
      text: unit.text,
      payload: unit.payload,
      extraction: { method: 'antragsgruen-rest', pageCount: 0 },
      excerpt: unit.body,
      publishedAt: unit.publishedAt,
    };
    if (options.dryRun) {
      summary.chunks += (await this.#store.chunk(doc)).length;
      summary.stored += 1;
      return;
    }
    const written = await this.#store.store(doc, Boolean(known));
    if (written === 0) {
      summary.excluded += 1;
      return;
    }
    this.#known.set(unit.documentId, unit.payload);
    summary.chunks += written;
    this.stats.vectorsStored += written;
    if (known) summary.updated += 1;
    else summary.stored += 1;
  }

  /** Löscht die bekannten Dokumente dieser Konsultation, die nicht in `seen` stehen. */
  async #removeVanished(
    parteitagId: string,
    seen: ReadonlySet<string>,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    const vanished = [...this.#known]
      .filter(([id, payload]) => payload.parteitag_id === parteitagId && !seen.has(id))
      .map(([id]) => id);
    if (vanished.length === 0 || options.dryRun) return;
    const client = (await this.#store.qdrant()).writeClient(PARTEITAGE_COLLECTION);
    for (const documentId of vanished) {
      await batchDelete(client, PARTEITAGE_COLLECTION, {
        must: [{ key: 'document_id', match: { value: documentId } }],
      });
      this.#known.delete(documentId);
      summary.removed += 1;
    }
    log.info(`[parteitage] ${parteitagId}: removed ${vanished.length} documents no longer public`);
  }
}

let instance: ParteitageScraper | null = null;

export function getParteitageScraper(): ParteitageScraper {
  if (!instance) instance = new ParteitageScraper();
  return instance;
}

export type { AntragsgruenInstance };
