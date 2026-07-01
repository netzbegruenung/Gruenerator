/**
 * AbgeordnetenwatchScraper
 *
 * Ingests two free-text corpora from the Abgeordnetenwatch API into the shared
 * `abgeordnetenwatch_documents` Qdrant collection (discriminated by
 * `content_type`), powering the "Abgeordnetenwatch" transparency notebook:
 *   - Abstimmungen (polls): narrative description + result + Grünen-fraction stance
 *   - Nebentätigkeiten (sidejobs): one doc each, joined to the MP (name + party)
 *
 * Self-contained: bulk HTTP uses a dedicated fair-use loop (see `apiGet` —
 * paces under the 30 req/min limit and cools down ~60s on a 429), NOT the
 * precision chat connector client. Point ids are the stable entity ids
 * (namespaced so polls and sidejobs never collide); a content-hash gate skips
 * re-embedding unchanged records so re-runs are cheap.
 */
import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import {
  batchUpsert,
  scrollDocuments,
} from '../../../../database/services/QdrantService/operations/batchOperations.js';
import { createLogger } from '../../../../utils/logger.js';
import { mistralEmbeddingService } from '../../../mistral/index.js';
import { BaseScraper } from '../../base/BaseScraper.js';

import {
  aggregateGrueneStance,
  buildPollDocument,
  buildSidejobDocument,
  mandateToInfo,
  POLL_ID_BASE,
  SIDEJOB_ID_BASE,
  type BuiltDocument,
  type MandateInfo,
  type RawMandate,
  type RawPoll,
  type RawSidejob,
  type RawVote,
} from './builders.js';

import type { ScraperResult } from '../../types.js';
import type { QdrantClient } from '@qdrant/js-client-rest';

const log = createLogger('AbgeordnetenwatchScraper');

const BASE_URL = 'https://www.abgeordnetenwatch.de/api/v2';
const COLLECTION = 'abgeordnetenwatch_documents';
const PAGE = 1000; // API max range_end
const EMBED_BATCH = 50;
const USER_AGENT = 'Gruenerator/1.0 (+https://gruenerator.eu)';
// Fair use: the API limit is 30 req/min per IP. 2200ms between requests ≈ 27/min,
// leaving headroom for the chat connector (shared server IP) during off-peak runs.
const FAIR_USE_DELAY_MS = 2200;
const RATE_LIMIT_COOLDOWN_S = 60; // API asks to wait ~60s after a 429
const REQUEST_TIMEOUT_MS = 20000;
const MAX_ATTEMPTS = 5;
const RECENT_POLL_WINDOW_DAYS = 60;
const RECENT_SIDEJOB_PAGES = 2;

export interface AwScrapeOptions {
  forceUpdate?: boolean;
  recent?: boolean;
  dryRun?: boolean;
}

export interface AwScrapeSummary {
  stored: number;
  updated: number;
  skipped: number;
  fetchErrors: number;
  errors: number;
}

interface AwEnvelope<T> {
  data?: T[];
  meta?: { result?: { total?: number } };
}

export class AbgeordnetenwatchScraper extends BaseScraper {
  private qdrantClient!: QdrantClient;

  constructor() {
    super({ collectionName: COLLECTION, baseUrl: BASE_URL, delayMs: FAIR_USE_DELAY_MS });
  }

  async init(): Promise<void> {
    const qdrant = getQdrantInstance();
    await qdrant.init(); // creates abgeordnetenwatch_documents from COLLECTION_SCHEMAS if missing
    await mistralEmbeddingService.init();
    this.qdrantClient = qdrant.client!;
  }

  /** BaseScraper contract — full ingest with defaults. */
  async scrape(): Promise<ScraperResult> {
    await this.scrapeAllSources({});
    return this.buildResult();
  }

  async scrapeAllSources(options: AwScrapeOptions): Promise<AwScrapeSummary> {
    const summary: AwScrapeSummary = {
      stored: 0,
      updated: 0,
      skipped: 0,
      fetchErrors: 0,
      errors: 0,
    };
    this.initializeSession();

    const existing = await this.loadExistingHashes();
    log.info(`[abgeordnetenwatch] ${existing.size} existing points in ${COLLECTION}`);

    try {
      await this.runPolls(options, existing, summary);
    } catch (error: unknown) {
      summary.errors += 1;
      log.error(
        `[abgeordnetenwatch] polls run failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }
    try {
      await this.runSidejobs(options, existing, summary);
    } catch (error: unknown) {
      summary.errors += 1;
      log.error(
        `[abgeordnetenwatch] sidejobs run failed: ${error instanceof Error ? error.message : String(error)}`
      );
    }

    log.info(
      `[abgeordnetenwatch] done: stored=${summary.stored} updated=${summary.updated} skipped=${summary.skipped} fetchErrors=${summary.fetchErrors} errors=${summary.errors}`
    );
    return summary;
  }

  // ── HTTP (fair-use compliant) ─────────────────────────────────────────────
  // The Abgeordnetenwatch API allows 30 req/min per IP and asks callers to pause
  // ~60 s on a 429. We deliberately DON'T use BaseScraper.fetchWithRetry here:
  // its retry cadence (1s/2s/3s, any error) would hammer the API on a 429. This
  // loop instead (a) paces ≥ delayMs BEFORE every request (incl. retries), so
  // two requests can never be closer than the fair-use interval, (b) honours
  // Retry-After / waits ~60 s on 429, and (c) backs off exponentially on 5xx.
  private async apiGet<T>(
    path: string,
    params: Record<string, string | number>
  ): Promise<AwEnvelope<T>> {
    const query = Object.entries(params)
      .map(([k, v]) => `${k}=${encodeURIComponent(String(v))}`)
      .join('&');
    const url = `${BASE_URL}/${path}${query ? `?${query}` : ''}`;

    for (let attempt = 1; ; attempt++) {
      await this.delay(); // fair-use pacing: applied before EVERY request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
      let res: Response;
      try {
        res = await fetch(url, {
          headers: { Accept: 'application/json', 'User-Agent': USER_AGENT },
          signal: controller.signal,
        });
      } catch (error: unknown) {
        clearTimeout(timeoutId);
        if (attempt >= MAX_ATTEMPTS) throw error;
        await this.delay(2000 * attempt); // network error: exponential backoff
        continue;
      }
      clearTimeout(timeoutId);

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get('retry-after')) || RATE_LIMIT_COOLDOWN_S;
        const waitMs = Math.min(retryAfter, 90) * 1000;
        log.warn(`[abgeordnetenwatch] 429 on ${path} — cooling down ${waitMs}ms (fair use)`);
        if (attempt >= MAX_ATTEMPTS)
          throw new Error(`Abgeordnetenwatch rate limit persists on ${path}`);
        await this.delay(waitMs);
        continue;
      }
      if (res.status >= 500) {
        if (attempt >= MAX_ATTEMPTS) throw new Error(`Abgeordnetenwatch ${res.status} on ${path}`);
        await this.delay(2000 * attempt);
        continue;
      }
      if (!res.ok) throw new Error(`Abgeordnetenwatch ${res.status} on ${path}`);
      return (await res.json()) as AwEnvelope<T>;
    }
  }

  /** Page an endpoint via range_start/range_end. `stop` ends paging early (recent mode). */
  private async pageAll<T>(
    path: string,
    baseParams: Record<string, string | number>,
    stop?: (items: T[]) => boolean
  ): Promise<T[]> {
    const out: T[] = [];
    let offset = 0;
    for (;;) {
      const env = await this.apiGet<T>(path, {
        ...baseParams,
        range_start: offset,
        range_end: PAGE,
      });
      const items = env.data ?? [];
      out.push(...items);
      const total = env.meta?.result?.total ?? out.length;
      offset += items.length;
      if (items.length === 0 || offset >= total) break;
      if (stop && stop(items)) break;
    }
    return out;
  }

  // ── existing hashes (dedup gate) ──────────────────────────────────────────
  private async loadExistingHashes(): Promise<Map<number, string>> {
    const map = new Map<number, string>();
    let offset: string | number | null = null;
    for (;;) {
      const points = await scrollDocuments(
        this.qdrantClient,
        COLLECTION,
        {},
        {
          limit: PAGE,
          withPayload: true,
          withVector: false,
          ...(offset !== null ? { offset } : {}),
        }
      );
      for (const p of points) {
        if (typeof p.id === 'number') map.set(p.id, (p.payload.content_hash as string) ?? '');
      }
      if (points.length < PAGE) break;
      const last = points[points.length - 1].id;
      offset = typeof last === 'number' || typeof last === 'string' ? last : null;
      if (offset === null) break;
    }
    return map;
  }

  // ── Abstimmungen ──────────────────────────────────────────────────────────
  private async runPolls(
    options: AwScrapeOptions,
    existing: Map<number, string>,
    summary: AwScrapeSummary
  ): Promise<void> {
    const cutoff = options.recent
      ? new Date(Date.now() - RECENT_POLL_WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
      : null;

    const polls = await this.pageAll<RawPoll>(
      'polls',
      { sort_by: 'field_poll_date', sort_direction: 'desc' },
      cutoff ? (items) => items.some((p) => (p.field_poll_date ?? '9999') < cutoff) : undefined
    );
    const scoped = cutoff ? polls.filter((p) => (p.field_poll_date ?? '9999') >= cutoff) : polls;
    log.info(
      `[abgeordnetenwatch] ${scoped.length} Abstimmungen to process (recent=${!!options.recent})`
    );

    let batch: { id: number; doc: BuiltDocument; existed: boolean }[] = [];
    const flush = async () => {
      await this.flushDocs(batch, options.dryRun, summary);
      batch = [];
    };

    for (const poll of scoped) {
      const pointId = POLL_ID_BASE + poll.id;
      // A poll's description + result + Grünen stance are settled once cast, so
      // an already-ingested poll is never re-fetched (this is what keeps nightly
      // full runs cheap — only NEW polls trigger the per-poll votes call). A
      // manual --force refreshes everything.
      if (existing.has(pointId) && !options.forceUpdate) {
        summary.skipped += 1;
        continue;
      }
      try {
        // dry-run skips the (heavy) per-poll votes fetch — it only validates mapping.
        let stance = aggregateGrueneStance([]);
        if (!options.dryRun) {
          const votes = await this.apiGet<RawVote>('votes', { poll: poll.id, range_end: PAGE });
          stance = aggregateGrueneStance(votes.data ?? []);
        }
        const doc = buildPollDocument(poll, stance, (s) => this.generateHash(s));
        batch.push({ id: pointId, doc, existed: existing.has(pointId) });
        if (batch.length >= EMBED_BATCH) await flush();
      } catch (error: unknown) {
        summary.fetchErrors += 1;
        log.warn(
          `[abgeordnetenwatch] poll ${poll.id} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    await flush();
  }

  // ── Nebentätigkeiten ──────────────────────────────────────────────────────
  private async runSidejobs(
    options: AwScrapeOptions,
    existing: Map<number, string>,
    summary: AwScrapeSummary
  ): Promise<void> {
    let pages = 0;
    const sidejobs = await this.pageAll<RawSidejob>(
      'sidejobs',
      { sort_by: 'id', sort_direction: 'desc' },
      options.recent ? () => ++pages >= RECENT_SIDEJOB_PAGES : undefined
    );
    // Like polls, a reported Nebentätigkeit is settled — skip already-ingested
    // ones (unless --force) so nightly runs only process new records and only
    // resolve the mandates those new records reference.
    const toProcess = sidejobs.filter(
      (s) => options.forceUpdate || !existing.has(SIDEJOB_ID_BASE + s.id)
    );
    summary.skipped += sidejobs.length - toProcess.length;
    log.info(
      `[abgeordnetenwatch] ${toProcess.length}/${sidejobs.length} Nebentätigkeiten to process (recent=${!!options.recent})`
    );

    const mandateMap = await this.buildMandateMap(toProcess);

    let batch: { id: number; doc: BuiltDocument; existed: boolean }[] = [];
    const flush = async () => {
      await this.flushDocs(batch, options.dryRun, summary);
      batch = [];
    };

    for (const sidejob of toProcess) {
      try {
        const mandateId = sidejob.mandates?.[0]?.id;
        const info: MandateInfo | null =
          mandateId != null ? (mandateMap.get(mandateId) ?? null) : null;
        const doc = buildSidejobDocument(sidejob, info, (s) => this.generateHash(s));
        const pointId = SIDEJOB_ID_BASE + sidejob.id;
        batch.push({ id: pointId, doc, existed: existing.has(pointId) });
        if (batch.length >= EMBED_BATCH) await flush();
      } catch (error: unknown) {
        summary.errors += 1;
        log.warn(
          `[abgeordnetenwatch] sidejob ${sidejob.id} failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    await flush();
  }

  /** Resolve name + party for exactly the mandates referenced by these sidejobs. */
  private async buildMandateMap(sidejobs: RawSidejob[]): Promise<Map<number, MandateInfo>> {
    const ids = [
      ...new Set(
        sidejobs.flatMap((s) =>
          (s.mandates ?? []).map((m) => m.id).filter((id): id is number => id != null)
        )
      ),
    ];
    const map = new Map<number, MandateInfo>();
    for (let i = 0; i < ids.length; i += 100) {
      const chunk = ids.slice(i, i + 100);
      try {
        const env = await this.apiGet<RawMandate>('candidacies-mandates', {
          'id[in]': `[${chunk.join(',')}]`,
          range_end: PAGE,
        });
        for (const m of env.data ?? []) map.set(m.id, mandateToInfo(m));
      } catch (error: unknown) {
        log.warn(
          `[abgeordnetenwatch] mandate chunk failed: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }
    log.info(`[abgeordnetenwatch] resolved ${map.size}/${ids.length} referenced mandates`);
    return map;
  }

  // ── embed + upsert ─────────────────────────────────────────────────────────
  private async flushDocs(
    batch: { id: number; doc: BuiltDocument; existed: boolean }[],
    dryRun: boolean | undefined,
    summary: AwScrapeSummary
  ): Promise<void> {
    if (batch.length === 0) return;
    const countStored = () => {
      for (const b of batch) {
        if (b.existed) summary.updated += 1;
        else summary.stored += 1;
      }
    };
    if (dryRun) {
      countStored();
      return;
    }
    const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
      batch.map((b) => b.doc.text)
    );
    const points = batch.map((b, i) => ({
      id: b.id,
      vector: embeddings[i],
      payload: b.doc.payload,
    }));
    await batchUpsert(this.qdrantClient, COLLECTION, points);
    countStored();
    this.stats.vectorsStored += points.length;
  }
}

let instance: AbgeordnetenwatchScraper | null = null;

export function getAbgeordnetenwatchScraperService(): AbgeordnetenwatchScraper {
  if (!instance) instance = new AbgeordnetenwatchScraper();
  return instance;
}
