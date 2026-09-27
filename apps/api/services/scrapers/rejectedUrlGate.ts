/**
 * Memory for URLs that were fetched and then thrown away.
 *
 * The scrapers' two cheap gates — `#storedPayload` and `isFreshlyIndexed` —
 * both key on a point that exists in Qdrant. A document rejected at the store
 * stage never writes one, so it is invisible to both and gets fetched again on
 * every single walk. Measured for Berlin on 2026-09-15: 105 of 375 discovered
 * URLs fetched-then-discarded in one *hourly* run (#3200).
 *
 * This module is the third gate, and the only one that can see those URLs. It
 * deliberately stores `publishedAt` rather than a bare "rejected" flag: the
 * caller re-evaluates that date against the source's *current* age limit, so
 * widening `maxAgeYears` brings the URLs back on the next run instead of
 * needing the table purged by hand.
 *
 * **Only cache a rejection that cannot reverse on its own.** 'too_old' is the
 * one that qualifies — a document does not become younger. 'too_short' and
 * 'no_chunks' are properties of a page that may well be filled in next week;
 * remembering those would make the update invisible.
 *
 * Every call fails soft, mirroring `runRegistry.ts`. Two reasons: a sync must
 * not die because its bookkeeping did, and the CLI entry point
 * (`update-all-content.ts`) runs in CI without Postgres access — the same
 * asymmetry `syncEventRecorder` handles by buffering. A failed load yields an
 * empty map, which is exactly the behaviour before this gate existed: the URL
 * gets fetched.
 */
import { getPostgresInstance } from '../../database/services/PostgresService/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('RejectedUrlGate');

/** The one rejection reason that is safe to remember. See the module comment. */
export const CACHEABLE_REJECTION_REASON = 'too_old';

async function failSoft<T>(what: string, fn: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    log.warn(`[RejectedUrlGate] ${what} fehlgeschlagen: ${String(error)}`);
    return fallback;
  }
}

/**
 * All remembered rejections for one source, as `url → publishedAt` (ISO).
 *
 * Loaded once per content path rather than queried per URL: a full Berlin walk
 * checks ~2 300 URLs, and one round trip each would trade a saved fetch for a
 * new query.
 */
export async function loadRejectedUrls(sourceId: string): Promise<Map<string, string>> {
  return failSoft(
    'Abgelehnte URLs laden',
    async () => {
      const rows = await getPostgresInstance().query<{
        source_url: string;
        published_at: string | Date;
      }>(
        `SELECT source_url, published_at
           FROM scraper_rejected_urls
          WHERE source_id = $1 AND reason = $2`,
        [sourceId, CACHEABLE_REJECTION_REASON]
      );
      // node-postgres hands back a Date for timestamptz; the callers compare
      // dates, so normalise to ISO here rather than at every use.
      return new Map(
        rows.map((row): [string, string] => [
          row.source_url,
          row.published_at instanceof Date
            ? row.published_at.toISOString()
            : String(row.published_at),
        ])
      );
    },
    // Typed explicitly: a bare `new Map()` is `Map<any, any>` and would widen
    // the generic inferred from this fallback, taking the return type with it.
    new Map<string, string>()
  );
}

/**
 * Remember one rejection.
 *
 * Upserts, so a page whose date changed carries the new one rather than
 * accumulating rows — the URL is the identity here, not the attempt.
 */
export async function rememberRejection(params: {
  url: string;
  sourceId: string;
  reason: string;
  publishedAt: string;
}): Promise<void> {
  await failSoft(
    'Ablehnung merken',
    async () => {
      await getPostgresInstance().query(
        `INSERT INTO scraper_rejected_urls (source_url, source_id, reason, published_at)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (source_url) DO UPDATE
           SET source_id = EXCLUDED.source_id,
               reason = EXCLUDED.reason,
               published_at = EXCLUDED.published_at,
               rejected_at = NOW()`,
        [params.url, params.sourceId, params.reason, params.publishedAt]
      );
    },
    undefined
  );
}
