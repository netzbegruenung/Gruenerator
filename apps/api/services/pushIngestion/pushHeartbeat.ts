/**
 * Landesverband push heartbeat.
 *
 * The "plugin is default, code decides" switchover: the push-ingest endpoint
 * calls `touchPushHeartbeat(sourceId)` on every successful ingest/delete, and the
 * scheduled scraper calls `getPushActiveSourceIds()` to skip any source that has
 * pushed within the freshness window. If pushes go silent the window lapses and
 * the scraper automatically resumes for that source — no manual flag.
 */
import { gte, sql } from 'drizzle-orm';

import { env } from '../../config/env.js';
import { lvPushHeartbeat } from '../../database/schema/lvPushHeartbeat.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('lvPushHeartbeat');

/**
 * How long a single push keeps a source "push-active" (scraper backs off).
 * Defaults to 26h so one push per day comfortably covers the daily scrape; the
 * scraper resumes within ~a day of the last push if the plugin stops sending.
 */
export function getPushFreshnessHours(): number {
  const hours = env.LV_PUSH_FRESHNESS_HOURS;
  return hours > 0 ? hours : 26;
}

/** Upsert last_push_at = now() for a source. Never throws — heartbeat is best-effort. */
export async function touchPushHeartbeat(sourceId: string): Promise<void> {
  try {
    const db = getDrizzleInstance();
    const now = new Date().toISOString();
    await db
      .insert(lvPushHeartbeat)
      .values({ source_id: sourceId, last_push_at: now })
      .onConflictDoUpdate({
        target: lvPushHeartbeat.source_id,
        set: { last_push_at: now },
      });
  } catch (err) {
    log.warn(`[lvPushHeartbeat] touch failed for ${sourceId}:`, err);
  }
}

/**
 * The set of source ids that have pushed within the freshness window. Returns an
 * empty set on any error so the scraper falls back to its normal full run.
 */
export async function getPushActiveSourceIds(): Promise<Set<string>> {
  try {
    const db = getDrizzleInstance();
    const cutoff = new Date(Date.now() - getPushFreshnessHours() * 3600_000).toISOString();
    const rows = await db
      .select({ source_id: lvPushHeartbeat.source_id })
      .from(lvPushHeartbeat)
      .where(gte(lvPushHeartbeat.last_push_at, sql`${cutoff}`));
    return new Set(rows.map((r) => r.source_id));
  } catch (err) {
    log.warn('[lvPushHeartbeat] getPushActiveSourceIds failed; scraping all:', err);
    return new Set();
  }
}
