/**
 * Persistence for the content-sync article event log ("Was ist passiert").
 *
 * Events are recorded in-process by the scrapers (syncEventRecorder) and reach
 * this service either via POST /api/internal/monitor/sync-events (the GitHub
 * Action has no Postgres access) or directly from in-process sync runs.
 */
import {
  type SyncArticleSourceGroup,
  type SyncEventInput,
  type WhatHappenedArticle,
  type WhatHappenedDay,
  type WhatHappenedQuery,
  type WhatHappenedResult,
} from '@gruenerator/contracts';

import { type ContentSyncArticleRow } from '../../database/schema/contentSync.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('ContentSyncEvents');

const RETENTION_DAYS = 90;
const INSERT_CHUNK_SIZE = 500;

function db() {
  return getPostgresInstance();
}

export interface SyncRunContext {
  runId: string | null;
  runUrl: string | null;
}

/**
 * Batch-upsert article events. One row per article per UTC day: a retried POST
 * is a no-op, and an article stored and later updated on the same day keeps
 * its 'stored' badge (new today beats updated today).
 */
export async function upsertSyncEvents(
  events: SyncEventInput[],
  run: SyncRunContext
): Promise<number> {
  if (events.length === 0) return 0;

  // A URL recorded twice in one batch would hit the same conflict target twice
  // within one INSERT, which Postgres rejects. Keep one event per URL ('stored'
  // wins over 'updated', mirroring the upsert's CASE).
  const byUrl = new Map<string, SyncEventInput>();
  for (const e of events) {
    const prev = byUrl.get(e.sourceUrl);
    if (!prev || prev.eventType !== 'stored') byUrl.set(e.sourceUrl, e);
  }
  const deduped = [...byUrl.values()];

  let upserted = 0;
  for (let start = 0; start < deduped.length; start += INSERT_CHUNK_SIZE) {
    const chunk = deduped.slice(start, start + INSERT_CHUNK_SIZE);
    const placeholders: string[] = [];
    const params: unknown[] = [];
    for (let i = 0; i < chunk.length; i++) {
      const e = chunk[i];
      const o = i * 11;
      placeholders.push(
        `($${o + 1}, $${o + 2}, $${o + 3}, $${o + 4}, $${o + 5}, $${o + 6}, $${o + 7}, ` +
          `$${o + 8}::timestamptz, $${o + 9}::timestamptz, ` +
          `($${o + 9}::timestamptz AT TIME ZONE 'UTC')::date, $${o + 10}, $${o + 11})`
      );
      params.push(
        e.title,
        e.sourceUrl,
        e.sourceGroupId,
        e.sourceName,
        e.landesverband,
        e.collection,
        e.eventType,
        e.publishedAt,
        e.indexedAt,
        run.runId,
        run.runUrl
      );
    }

    const result = await db().query(
      `INSERT INTO content_sync_articles
         (title, source_url, source_group_id, source_name, landesverband, collection,
          event_type, published_at, indexed_at, event_date, sync_run_id, sync_run_url)
       VALUES ${placeholders.join(', ')}
       ON CONFLICT (source_url, event_date) DO UPDATE SET
         title = EXCLUDED.title,
         event_type = CASE
           WHEN content_sync_articles.event_type = 'stored' THEN 'stored'
           ELSE EXCLUDED.event_type
         END,
         published_at = EXCLUDED.published_at,
         indexed_at = EXCLUDED.indexed_at,
         sync_run_id = EXCLUDED.sync_run_id,
         sync_run_url = EXCLUDED.sync_run_url
       RETURNING id`,
      params
    );
    upserted += result.length;
  }

  try {
    await db().query(
      `DELETE FROM content_sync_articles
       WHERE event_date < (now() AT TIME ZONE 'UTC')::date - $1::int`,
      [RETENTION_DAYS]
    );
  } catch (error) {
    log.warn(`Retention prune failed (non-fatal): ${toError(error).message}`);
  }

  log.info(`Upserted ${upserted} content-sync article events`);
  return upserted;
}

/**
 * Day-grouped article feed for the "Was ist passiert" tab.
 *
 * Locale follows the monitor convention: 'at' shows the gruene-at source
 * group, 'de' everything else. The sourceGroups/landesverbaende facets are
 * computed before the expert-mode filters so the filter options stay stable
 * while a filter is active.
 */
export async function getWhatHappened(query: WhatHappenedQuery): Promise<WhatHappenedResult> {
  const days = query.days ?? 7;
  const locale = query.locale ?? 'de';

  // event_date::text — the pg driver parses DATE columns into JS Dates at
  // *local* midnight, which shifts the day when serialized back to UTC.
  const rows = await db().query<ContentSyncArticleRow & { event_day: string }>(
    `SELECT *, event_date::text AS event_day FROM content_sync_articles
     WHERE event_date >= (now() AT TIME ZONE 'UTC')::date - ($1::int - 1)
       AND ${locale === 'at' ? `source_group_id = 'gruene-at'` : `source_group_id <> 'gruene-at'`}
     ORDER BY event_date DESC, indexed_at DESC`,
    [days]
  );

  const sourceGroups = [...new Set(rows.map((r) => r.source_group_id))].sort();
  const landesverbaende = [
    ...new Set(rows.map((r) => r.landesverband).filter((lv): lv is string => lv !== null)),
  ].sort();

  const filtered = rows.filter(
    (r) =>
      (!query.sourceGroup || r.source_group_id === query.sourceGroup) &&
      (!query.landesverband || r.landesverband === query.landesverband) &&
      (!query.eventType || r.event_type === query.eventType)
  );

  const dayBuckets = new Map<string, WhatHappenedDay>();
  for (const row of filtered) {
    const date = row.event_day;
    let bucket = dayBuckets.get(date);
    if (!bucket) {
      bucket = { date, counts: { stored: 0, updated: 0 }, articles: [] };
      dayBuckets.set(date, bucket);
    }
    bucket.counts[row.event_type] += 1;
    bucket.articles.push(toArticle(row));
  }

  return {
    days: [...dayBuckets.values()],
    totalCount: filtered.length,
    sourceGroups: sourceGroups as SyncArticleSourceGroup[],
    landesverbaende,
  };
}

function toArticle(row: ContentSyncArticleRow): WhatHappenedArticle {
  return {
    title: row.title,
    sourceUrl: row.source_url,
    sourceGroupId: row.source_group_id,
    sourceName: row.source_name,
    landesverband: row.landesverband,
    collection: row.collection,
    eventType: row.event_type,
    publishedAt: row.published_at,
    indexedAt: row.indexed_at,
    syncRunUrl: row.sync_run_url,
  };
}
