/**
 * Parteitage — Anträge, Beschlüsse und Änderungsanträge aus Antragsgrün in
 * `landesverbaende_documents`, je Seite unter eigener `source_id`
 * (`config/antragsgruenInstances.ts`). Sichtbar im Notebook des Landesverbands
 * und im Notebook „Parteitage", das nur diese `source_id`s zeigt.
 *
 * Je Lauf und Seite: Konsultationsliste, dann je Konsultation die Übersicht
 * (ein Abruf mit allen Anträgen und ÄA-Links). Einzeln abgerufen wird ein
 * Dokument nur, wenn
 *   - es noch nicht in Qdrant liegt,
 *   - die Übersicht es anders zeigt als beim letzten Mal (`list_signature`:
 *     Status, Kürzel, Titel), oder
 *   - seine Konsultation aktiv ist (`ACTIVE_DAYS`): der Verfahrensvorschlag
 *     der Antragskommission steht nur im Einzelabruf und ändert sich bis zum
 *     Parteitag.
 * Zu einem Antrag gehört immer auch seine HTML-Seite (`pageFacts.ts`): nur dort
 * stehen Beschlussdatum, beschließendes Gremium und die Versionskette. Ein ÄA
 * braucht sie nur, wenn die API kein Datum hat. Schlägt der Seitenabruf fehl,
 * scheitert das Dokument und kommt im nächsten Lauf wieder — ohne Seite wäre
 * nicht zu erkennen, ob es eine überholte Fassung ist.
 * Neu eingebettet wird nur, wenn sich der Text ändert (`content_hash`).
 *
 * Versionen: geschrieben wird die neueste Fassung einer Kette und der
 * eingereichte Antrag (Version 1, mit Verweis auf die neueste). Zwischenstände
 * werden nicht geschrieben und, falls schon vorhanden, gelöscht.
 *
 * Weg muss, was nicht mehr öffentlich ist: ein Dokument, das aus der Übersicht
 * einer öffentlichen Konsultation verschwindet, und alle Dokumente einer
 * Konsultation, die jetzt eine Anmeldung verlangt. Ist die ganze Seite nicht
 * erreichbar, wird nichts gelöscht.
 *
 * Bewerbungen werden abgerufen, um sie zu erkennen, und nie geschrieben
 * (`isCandidacy`). Weil sie dadurch nie „bekannt" sind, holt jeder Lauf sie
 * neu — bei NRW rund ein Abruf je Bewerbung und Nacht.
 *
 * Am Ende jeder Seite gleicht `websiteDuplicates.ts` die Beschlüsse mit den
 * Website-Beiträgen des Landesverbands ab und markiert deren Abschriften.
 *
 * Alle Lese- und Löschzugriffe sind auf die Antragsgrün-`source_id`s begrenzt
 * (`ParliamentStore`-Scope): die Sammlung teilt sich der Lauf mit dem
 * LV-Scraper und dem Instagram-Scraper.
 */

import {
  ANTRAGSGRUEN_INSTANCES,
  ANTRAGSGRUEN_SOURCE_IDS,
  type AntragsgruenInstance,
} from '../../../../config/antragsgruenInstances.js';
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
  contentTypeOfMotion,
  isCandidacy,
  motionDocumentId,
  motionSignatureOf,
  motionUnitOf,
  PARTEITAGE_COLLECTION,
  PARTEITAGE_CONTENT_TYPE_LABELS,
  PARTEITAGE_SOURCE,
  type NewestVersion,
  type ParteitagContext,
  type ParteitageUnit,
} from './builders.js';
import { pageFactsOf, versionRoleOf } from './pageFacts.js';
import {
  normalizeTitle,
  syncWebsiteDuplicates,
  type AntragsgruenBeschluss,
} from './websiteDuplicates.js';

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

/** Payload-Felder von Chunk 0, die ein Lauf über bekannte Dokumente braucht. */
const KNOWN_FIELDS = [
  'source_id',
  'parteitag_id',
  'list_signature',
  'content_hash',
  'content_type',
  'antrag_titel',
  'beschlossen_am',
  'beschluss_durch',
] as const;

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
  /** Zwischenversionen einer Antragskette, nicht geschrieben bzw. gelöscht. */
  superseded: number;
  /** Konsultationen, die eine Anmeldung verlangen. */
  notPublic: number;
  /** Gelöschte Dokumente (nicht mehr öffentlich oder überholt). */
  removed: number;
  /** Website-Beiträge, die als Abschrift eines Beschlusses markiert bzw. entmarkiert wurden. */
  websiteDuplicatesMarked: number;
  websiteDuplicatesCleared: number;
  /** Website-Beiträge, die zu mehr als einem Beschluss passen — unmarkiert, zum Nachsehen. */
  websiteDuplicatesAmbiguous: string[];
  failed: number;
  chunks: number;
  errors: string[];
}

const isActive = (ref: ConsultationRef): boolean =>
  !ref.date_published ||
  Date.now() - new Date(ref.date_published).getTime() < ACTIVE_DAYS * 86_400_000;

/** Ob die Instanz diese Konsultation überhaupt führt (`consultations` in `antragsgruenInstances.ts`). */
export const isEnabled = (instance: AntragsgruenInstance, ref: ConsultationRef): boolean =>
  instance.consultations === null || instance.consultations.includes(ref.url_path);

export class ParteitageScraper extends BaseScraper {
  readonly #store = new ParliamentStore(PARTEITAGE_COLLECTION, PARTEITAGE_SOURCE, 'Parteitage', [
    { key: 'source_id', match: { any: ANTRAGSGRUEN_SOURCE_IDS } },
  ]);
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
      superseded: 0,
      notPublic: 0,
      removed: 0,
      websiteDuplicatesMarked: 0,
      websiteDuplicatesCleared: 0,
      websiteDuplicatesAmbiguous: [],
      failed: 0,
      chunks: 0,
      errors: [],
    };
    this.#known = options.dryRun
      ? new Map<string, Record<string, unknown>>()
      : await this.#store.loadKnown(KNOWN_FIELDS);
    log.info(`[parteitage] ${this.#known.size} Antragsgrün documents in ${PARTEITAGE_COLLECTION}`);

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
        if (!isEnabled(instance, ref)) continue;
        if (
          options.consultations &&
          !options.consultations.includes(`${instance.id}/${ref.url_path}`)
        ) {
          continue;
        }
        await this.#consultation(client, { instance, consultation: ref }, options, summary);
      }
      await this.#websiteDuplicates(instance, options, summary);
    }

    log.info(
      `[parteitage] done: stored=${summary.stored} updated=${summary.updated} skipped=${summary.skipped} excluded=${summary.excluded} superseded=${summary.superseded} notPublic=${summary.notPublic} removed=${summary.removed} websiteDuplicates=+${summary.websiteDuplicatesMarked}/-${summary.websiteDuplicatesCleared} ambiguous=${summary.websiteDuplicatesAmbiguous.length} failed=${summary.failed} chunks=${summary.chunks}`
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
    const motions = new Map<number, MotionLink>();
    for (const link of overview.motion_links)
      if (link.type === 'motion') motions.set(link.id, link);
    const seen = new Set<string>();
    const tasks: Array<() => Promise<void>> = [];
    for (const link of overview.motion_links) {
      if (link.type === 'amendment') {
        seen.add(amendmentDocumentId(ctx.instance, link.id));
        tasks.push(() => this.#amendment(client, link, null, ctx, active, options, summary));
        continue;
      }
      seen.add(motionDocumentId(ctx.instance, link.id));
      tasks.push(() => this.#motion(client, link, motions, ctx, active, options, summary));
      for (const amendment of link.amendment_links) {
        seen.add(amendmentDocumentId(ctx.instance, amendment.id));
        const beschluss = titleTwinOf(link, motions, ctx);
        tasks.push(() =>
          this.#amendment(client, amendment, beschluss, ctx, active, options, summary)
        );
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
    motions: ReadonlyMap<number, MotionLink>,
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
      const facts = pageFactsOf(await client.page(motion.url_html));
      const role = versionRoleOf(facts);
      if (role.role === 'superseded') {
        summary.superseded += 1;
        await this.#drop(documentId, options, summary);
        return;
      }
      const newest =
        role.role === 'original'
          ? newestOf(role.newestMotionId, motions, ctx)
          : contentTypeOfMotion(motion) === 'antrag'
            ? titleTwinOf(link, motions, ctx)
            : null;
      await this.#write(motionUnitOf(motion, link, ctx, facts, newest), options, summary);
    } catch (error: unknown) {
      this.#fail(documentId, error, summary);
    }
  }

  async #amendment(
    client: AntragsgruenClient,
    link: AmendmentLink,
    beschluss: NewestVersion | null,
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
      const facts = amendment.date_published
        ? null
        : pageFactsOf(await client.page(amendment.url_html));
      await this.#write(amendmentUnitOf(amendment, link, ctx, facts, beschluss), options, summary);
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

  async #drop(
    documentId: string,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    if (!this.#known.has(documentId) || options.dryRun) return;
    await this.#store.remove(documentId);
    this.#known.delete(documentId);
    summary.removed += 1;
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
    for (const documentId of vanished) await this.#drop(documentId, options, summary);
    log.info(`[parteitage] ${parteitagId}: removed ${vanished.length} documents no longer public`);
  }

  async #websiteDuplicates(
    instance: AntragsgruenInstance,
    options: ParteitageRunOptions,
    summary: ParteitageRunSummary
  ): Promise<void> {
    if (options.dryRun) return;
    const beschluesse: AntragsgruenBeschluss[] = [];
    for (const [documentId, p] of this.#known) {
      if (p.source_id !== instance.sourceId || p.content_type !== 'beschluss') continue;
      if (typeof p.beschlossen_am !== 'string' || typeof p.antrag_titel !== 'string') continue;
      beschluesse.push({
        documentId,
        title: p.antrag_titel,
        beschlossenAm: p.beschlossen_am,
        beschlussDurch: typeof p.beschluss_durch === 'string' ? p.beschluss_durch : null,
      });
    }
    try {
      const result = await syncWebsiteDuplicates({
        client: (await this.#store.qdrant()).writeClient(PARTEITAGE_COLLECTION),
        collection: PARTEITAGE_COLLECTION,
        websiteSourceIds: instance.websiteSourceIds,
        beschluesse,
        dryRun: false,
      });
      summary.websiteDuplicatesMarked += result.marked;
      summary.websiteDuplicatesCleared += result.cleared;
      summary.websiteDuplicatesAmbiguous.push(...result.ambiguous);
      if (result.ambiguous.length > 0) {
        log.warn(
          `[parteitage] ${instance.id}: ${result.ambiguous.length} website posts match more than one Beschluss, left visible: ${result.ambiguous.join(', ')}`
        );
      }
    } catch (error: unknown) {
      this.#fail(`${instance.id} website duplicates`, error, summary);
    }
  }
}

/**
 * Ein Beschluss ohne Antragshistorie zum eingereichten Antrag: Landesparteirat
 * Schwerte 2026 führt „V-1" (eingereicht) und „V-01" (Beschluss) als zwei
 * unverknüpfte Anträge mit demselben Titel. Verknüpft wird nur, wenn es in der
 * Konsultation genau einen Beschluss mit identischem Titel gibt.
 */
function titleTwinOf(
  link: MotionLink,
  motions: ReadonlyMap<number, MotionLink>,
  ctx: ParteitagContext
): NewestVersion | null {
  const title = normalizeTitle(link.title);
  const twins = [...motions.values()].filter(
    (m) =>
      m.id !== link.id &&
      contentTypeOfMotion(m) === 'beschluss' &&
      normalizeTitle(m.title) === title
  );
  return twins.length === 1 ? newestOf(twins[0].id, motions, ctx) : null;
}

/** Die neueste Fassung eines eingereichten Antrags, wie die Übersicht sie zeigt. */
function newestOf(
  motionId: number,
  motions: ReadonlyMap<number, MotionLink>,
  ctx: ParteitagContext
): NewestVersion | null {
  const link = motions.get(motionId);
  if (!link) return null;
  const type = contentTypeOfMotion(link);
  return {
    documentId: motionDocumentId(ctx.instance, motionId),
    title: `${PARTEITAGE_CONTENT_TYPE_LABELS[type]} ${link.title_with_prefix}`,
    isBeschluss: type === 'beschluss',
  };
}

let instance: ParteitageScraper | null = null;

export function getParteitageScraper(): ParteitageScraper {
  if (!instance) instance = new ParteitageScraper();
  return instance;
}
