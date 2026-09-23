/**
 * Layer-1 freshness gate of the Landesverband scraper, as a pure function.
 *
 * Its own module so the decision can be tested without loading the scraper —
 * importing `LandesverbandScraper.ts` pulls in Qdrant clients, the embedding
 * service and the whole source config at module load.
 */
import crypto from 'crypto';

/**
 * Re-fetch an already-indexed URL once its last indexing is older than this.
 * Living documents (Wahlprogramme, revised Beschlüsse) keep a stable URL but
 * change in place; a permanent "URL exists → skip" gate froze them forever.
 * On a re-fetch the content-hash diff in DocumentProcessor decides whether to
 * actually re-embed, so unchanged pages cost only an HTTP GET, not embeddings.
 */
const RECHECK_AFTER_MS = 3 * 24 * 60 * 60 * 1000; // 3 days

/**
 * Content published longer ago than this is treated as settled: it rarely
 * changes in place, so it is not re-walked every run — the re-fetch cost that
 * pushed big LVs (BE, HH) past the sync timeout. Pages without a parseable
 * published date fall through to the RECHECK_AFTER_MS window.
 */
const RECHECK_MAX_CONTENT_AGE_MS = 2 * 365 * 24 * 60 * 60 * 1000; // ~2 years

/**
 * Settled content is still re-checked, just rarely: once its `checked_at` is
 * older than this many days, and only on the one day in RECHECK_SPREAD_DAYS
 * that its URL hashes to. Without the re-check extractor fixes never reached
 * half the corpus, and gone pages were never noticed (#3578). Without the
 * spread the first run after deploy would re-fetch every old page at once —
 * none of them carries a `checked_at` yet. PDFs stopped at the 304 /
 * same-bytes gates never reach DocumentProcessor and so never get a
 * `checked_at`: on their bucket day they are re-checked on every run (bounded,
 * conditional GETs).
 */
export const RECHECK_SPREAD_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

export function recheckBucket(url: string): number {
  const digest = crypto.createHash('sha1').update(url).digest();
  return digest.readUInt32BE(0) % RECHECK_SPREAD_DAYS;
}

function ageMs(value: unknown, now: number): number | null {
  if (typeof value !== 'string' || !value) return null;
  const age = now - new Date(value).getTime();
  return Number.isFinite(age) ? age : null;
}

/**
 * True when the caller should skip the document entirely.
 *   - settled content (published > RECHECK_MAX_CONTENT_AGE_MS ago) is skipped
 *     unless its staggered re-check is due (see RECHECK_SPREAD_DAYS);
 *   - everything else is skipped while it was indexed within RECHECK_AFTER_MS.
 * Missing, timestamp-less (legacy), or stale recent points return false so the
 * caller re-fetches. What the re-fetch then costs is decided one layer down: for
 * PDFs by the file fingerprint (before extraction), for HTML pages by the
 * DocumentProcessor content-hash diff (before embedding).
 */
export function isFreshlyIndexed(
  url: string,
  payload: Record<string, unknown> | null,
  now: number
): boolean {
  if (!payload) return false;

  const contentAge = ageMs(payload.published_at, now);
  if (contentAge !== null && contentAge > RECHECK_MAX_CONTENT_AGE_MS) {
    const checkedAge = ageMs(payload.checked_at, now);
    const stale = checkedAge === null || checkedAge > RECHECK_SPREAD_DAYS * DAY_MS;
    const bucketToday = recheckBucket(url) === Math.floor(now / DAY_MS) % RECHECK_SPREAD_DAYS;
    return !(stale && bucketToday);
  }

  const age = ageMs(payload.indexed_at, now);
  return age !== null && age >= 0 && age < RECHECK_AFTER_MS;
}
