/**
 * Run history and mail switch for the content sync.
 *
 * Every run that goes through `executeSyncRun` lands here as one row, so the
 * admin panel shows what used to arrive as one mail per run ("1/1 Quellen
 * fehlgeschlagen", hourly, per Landesverband). Mails still exist, but only
 * when an instance admin switches them on — `isContentSyncEmailEnabled` is
 * the one question every sender asks.
 */
import {
  type AdminContentSyncRunsQuery,
  type ContentSyncRun,
  type ContentSyncSource,
} from '@gruenerator/contracts';
import { desc, eq, gt, lt, or, sql } from 'drizzle-orm';

import {
  contentSyncRuns,
  contentSyncSettings,
  type ContentSyncRunRow,
} from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('contentSyncRunLog');

const RETENTION_DAYS = 90;
const LIST_LIMIT = 200;
/** Same order of magnitude as the samples the scrapers already cap. */
const MAX_SAMPLES = 20;

export interface ContentSyncRunInput {
  sourceId: ContentSyncSource;
  landesverband: string | null;
  name: string;
  status: 'success' | 'failed';
  recent: boolean;
  dryRun: boolean;
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  deadLinks: number;
  failureMessage: string | null;
  errorSamples: string[];
  deadLinkSamples: string[];
  runUrl: string | null;
  startedAt: Date;
  durationMs: number;
}

/** Never throws: the history is a report, a lost row must not fail the sync. */
export async function recordContentSyncRun(run: ContentSyncRunInput): Promise<void> {
  try {
    const db = getDrizzleInstance();
    await db.insert(contentSyncRuns).values({
      source_id: run.sourceId,
      landesverband: run.landesverband,
      name: run.name,
      status: run.status,
      recent: run.recent,
      dry_run: run.dryRun,
      stored: run.stored,
      updated: run.updated,
      skipped: run.skipped,
      errors: run.errors,
      dead_links: run.deadLinks,
      failure_message: run.failureMessage,
      error_samples: run.errorSamples.slice(0, MAX_SAMPLES),
      dead_link_samples: run.deadLinkSamples.slice(0, MAX_SAMPLES),
      run_url: run.runUrl,
      started_at: run.startedAt.toISOString(),
      duration_ms: run.durationMs,
    });
    await db
      .delete(contentSyncRuns)
      .where(lt(contentSyncRuns.started_at, sql`now() - make_interval(days => ${RETENTION_DAYS})`));
  } catch (error) {
    log.warn(`Failed to record content sync run (non-fatal): ${toError(error).message}`);
  }
}

function toRun(row: ContentSyncRunRow): ContentSyncRun {
  return {
    id: row.id,
    sourceId: row.source_id,
    landesverband: row.landesverband,
    name: row.name,
    status: row.status,
    recent: row.recent,
    dryRun: row.dry_run,
    stored: row.stored,
    updated: row.updated,
    skipped: row.skipped,
    errors: row.errors,
    deadLinks: row.dead_links,
    failureMessage: row.failure_message,
    errorSamples: row.error_samples,
    deadLinkSamples: row.dead_link_samples,
    runUrl: row.run_url,
    startedAt: new Date(row.started_at).toISOString(),
    durationMs: row.duration_ms,
  };
}

export async function listContentSyncRuns(
  query: AdminContentSyncRunsQuery
): Promise<ContentSyncRun[]> {
  const db = getDrizzleInstance();
  const rows = await db
    .select()
    .from(contentSyncRuns)
    .where(
      query.filter === 'problems'
        ? or(eq(contentSyncRuns.status, 'failed'), gt(contentSyncRuns.errors, 0))
        : undefined
    )
    .orderBy(desc(contentSyncRuns.started_at))
    .limit(LIST_LIMIT);
  return rows.map(toRun);
}

/** Off when the row is missing or the database is unreachable — mails are opt-in. */
export async function isContentSyncEmailEnabled(): Promise<boolean> {
  try {
    const db = getDrizzleInstance();
    const [row] = await db
      .select({ emailEnabled: contentSyncSettings.email_enabled })
      .from(contentSyncSettings)
      .where(eq(contentSyncSettings.id, 1));
    return row?.emailEnabled ?? false;
  } catch (error) {
    log.warn(`Could not read content sync settings, mails stay off: ${toError(error).message}`);
    return false;
  }
}

export async function setContentSyncEmailEnabled(
  emailEnabled: boolean,
  userId: string
): Promise<boolean> {
  const db = getDrizzleInstance();
  const now = new Date().toISOString();
  await db
    .insert(contentSyncSettings)
    .values({ id: 1, email_enabled: emailEnabled, updated_at: now, updated_by: userId })
    .onConflictDoUpdate({
      target: contentSyncSettings.id,
      set: { email_enabled: emailEnabled, updated_at: now, updated_by: userId },
    });
  return emailEnabled;
}
