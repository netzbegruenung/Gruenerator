/**
 * Executes the goneState verdicts for a collection that holds one source, so
 * `source_url` alone identifies a page's points (#3990). The Landesverband
 * scraper keeps its own executor: its collections mix sources and its mark
 * lives in `lv_gone_since`.
 *
 * Marks and clears run inline; deletes are collected and run in `flush`, behind
 * allowGoneDeletes. Best-effort: a Qdrant failure lands in `failures`, never in
 * the crawl.
 */
import { type QdrantClient } from '@qdrant/js-client-rest';

import {
  batchDelete,
  scrollDocuments,
  setPayload,
} from '../../../database/services/QdrantService/operations/batchOperations.js';
import { HttpStatusError } from '../base/BaseScraper.js';

import { allowGoneDeletes, classifyFetch, goneVerdict, type FetchOutcome } from './goneState.js';

/** Payload field holding the mark on stored points. */
export const GONE_SINCE_FIELD = 'gone_since';

/**
 * Reported through `skipReasons` under the Landesverband scraper's keys, the
 * one field the content-sync response already carries per reason.
 * `gone_delete_deferred`: confirmed gone, but above the delete cap — marks kept.
 */
type GoneReason = 'gone_marked' | 'gone_deleted' | 'gone_delete_deferred';
export type GoneSkipReasons = Partial<Record<GoneReason, { count: number; examples: string[] }>>;

const MAX_EXAMPLES = 5;

export class GoneTracker {
  readonly skipReasons: GoneSkipReasons = {};
  readonly failures: string[] = [];
  readonly #deletes: string[] = [];

  constructor(
    private readonly client: QdrantClient,
    private readonly collection: string
  ) {}

  #count(reason: GoneReason, url: string): void {
    const entry = (this.skipReasons[reason] ??= { count: 0, examples: [] });
    entry.count++;
    if (entry.examples.length < MAX_EXAMPLES) entry.examples.push(url);
  }

  #filter(url: string) {
    return { must: [{ key: 'source_url', match: { value: url } }] };
  }

  /**
   * A fetch that answered 2xx. False when it ended somewhere else than the
   * article (homepage, parent section, another page) — then the answer must
   * not be stored under the requested URL.
   */
  async answered(url: string, finalUrl: string | null): Promise<boolean> {
    const outcome = classifyFetch({ requestedUrl: url, status: 200, finalUrl, listingPaths: [] });
    if (outcome !== 'gone' && outcome !== 'moved') return true;
    await this.#gone(url, outcome);
    return false;
  }

  /** A fetch that rejected; only a clean 404/410 counts, everything else is transient. */
  async rejected(url: string, reason: unknown): Promise<void> {
    if (!(reason instanceof HttpStatusError)) return;
    const outcome = classifyFetch({
      requestedUrl: url,
      status: reason.status,
      finalUrl: null,
      listingPaths: [],
    });
    if (outcome === 'gone') await this.#gone(url, outcome);
  }

  async #gone(url: string, outcome: FetchOutcome, now = Date.now()): Promise<void> {
    try {
      const points = await scrollDocuments(this.client, this.collection, this.#filter(url), {
        limit: 1,
        withPayload: true,
        withVector: false,
      });
      const stored = points[0] ? { goneSince: points[0].payload[GONE_SINCE_FIELD] } : null;
      const verdict = goneVerdict(outcome, stored, now);
      if (verdict === 'delete') this.#deletes.push(url);
      if (verdict !== 'mark') return;
      await setPayload(
        this.client,
        this.collection,
        { [GONE_SINCE_FIELD]: new Date(now).toISOString() },
        this.#filter(url)
      );
      this.#count('gone_marked', url);
    } catch (error) {
      this.failures.push(`${url}: gone ${outcome} failed: ${message(error)}`);
    }
  }

  /** The page answered again; drop the mark its stored points carry. */
  async clear(url: string): Promise<void> {
    try {
      await this.client.deletePayload(this.collection, {
        keys: [GONE_SINCE_FIELD],
        filter: this.#filter(url),
        wait: true,
      });
    } catch (error) {
      this.failures.push(`${url}: gone clear failed: ${message(error)}`);
    }
  }

  /** Runs the queued deletes, unless more are due than `fetched` allows. */
  async flush(fetched: number): Promise<void> {
    if (this.#deletes.length === 0) return;
    if (!allowGoneDeletes({ deletes: this.#deletes.length, fetched })) {
      for (const url of this.#deletes) this.#count('gone_delete_deferred', url);
      return;
    }
    for (const url of this.#deletes) {
      try {
        await batchDelete(this.client, this.collection, this.#filter(url));
        this.#count('gone_deleted', url);
      } catch (error) {
        this.failures.push(`${url}: gone delete failed: ${message(error)}`);
      }
    }
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
