/**
 * ts-rest contract router for the internal content-sync endpoint.
 *
 * This is the boundary CI and n8n both trigger scraper runs through — neither
 * has direct network access to Qdrant (CI runners are IPv4-only, Qdrant is
 * IPv6-only), but this long-lived API process does. The contract
 * (@gruenerator/contracts) is the source of truth for request/response
 * shapes, and `contentSyncSourceSchema` validates `:sourceId` before the
 * handler runs.
 *
 * Middleware is applied at the prefix in routes.ts, not here:
 *   - /api/internal/content-sync/* → requireAdminToken
 */
import { randomUUID } from 'node:crypto';

import {
  contentSyncContract,
  contentSyncJobStatusSchema,
  contentSyncSourceSchema,
  type ContentSyncFailure,
  type ContentSyncJobStatus,
  type ContentSyncResult,
  type ContentSyncSource,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { loadLandesverbandContacts } from '../../config/landesverbaendeConfig.js';
import { sendContentSyncEmail } from '../../services/email/emailService.js';
import { upsertSyncEvents } from '../../services/monitor/ContentSyncEventsService.js';
import { getContentStatsMarkdown } from '../../services/scrapers/contentStats.js';
import { drainSyncEvents } from '../../services/scrapers/syncEventRecorder.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';
import { getCachedJson, setCachedJson } from '../../utils/redis/jsonCache.js';

import type { Application } from 'express';

const log = createLogger('content-sync-internal');

interface SyncResult {
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  fetchErrors?: number;
}

interface RunOpts {
  forceUpdate: boolean;
  recent: boolean;
  dryRun: boolean;
}

interface SourceConfig {
  name: string;
  timeoutMs: number;
  init: () => Promise<void>;
  run: (opts: RunOpts) => Promise<SyncResult>;
}

const sourceCache: Partial<Record<ContentSyncSource, SourceConfig>> = {};
const runningSync = new Set<string>();

async function loadSource(sourceId: ContentSyncSource): Promise<SourceConfig> {
  const cached = sourceCache[sourceId];
  if (cached) return cached;

  let config: SourceConfig;

  switch (sourceId) {
    case 'landesverbaende': {
      const { landesverbandScraperService } =
        await import('../../services/scrapers/implementations/LandesverbandScraper/index.js');
      config = {
        name: 'Landesverbaende',
        timeoutMs: 30 * 60 * 1000,
        init: () => landesverbandScraperService.init(),
        run: (opts) =>
          landesverbandScraperService.scrapeAllSources({
            forceUpdate: opts.forceUpdate,
            dryRun: opts.dryRun,
          }),
      };
      break;
    }
    case 'gruenblog': {
      const { gruenblogScraperService } =
        await import('../../services/scrapers/implementations/GruenblogScraper.js');
      config = {
        name: 'Gruenblog',
        timeoutMs: 30 * 60 * 1000,
        init: () => gruenblogScraperService.init(),
        run: (opts) => gruenblogScraperService.fullCrawl({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'gruene-at': {
      const { grueneAtScraperService } =
        await import('../../services/scrapers/implementations/GrueneAtScraper.js');
      config = {
        name: 'Gruene AT',
        timeoutMs: 45 * 60 * 1000,
        init: () => grueneAtScraperService.init(),
        run: (opts) => grueneAtScraperService.fullCrawl({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'kommunalwiki': {
      const { kommunalwikiScraper } =
        await import('../../services/scrapers/implementations/KommunalwikiScraper.js');
      config = {
        name: 'KommunalWiki',
        timeoutMs: 30 * 60 * 1000,
        init: () => kommunalwikiScraper.init(),
        run: (opts) => kommunalwikiScraper.fullCrawl({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'boell-stiftung': {
      const { boellStiftungScraperService } =
        await import('../../services/scrapers/implementations/BoellStiftungScraper.js');
      config = {
        name: 'Boell Stiftung',
        timeoutMs: 45 * 60 * 1000,
        init: () => boellStiftungScraperService.init(),
        run: (opts) => boellStiftungScraperService.fullCrawl({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'bundestag': {
      const { bundestagScraperService } =
        await import('../../services/scrapers/implementations/BundestagScraper/index.js');
      config = {
        name: 'Bundestag',
        timeoutMs: 20 * 60 * 1000,
        init: () => bundestagScraperService.init(),
        run: (opts) => bundestagScraperService.scrapeAllSources({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'social-media': {
      const { scrapeAndIndexSocialMedia } =
        await import('../../services/scrapers/implementations/SocialMediaExamplesScraper.js');
      config = {
        name: 'Social Media',
        timeoutMs: 30 * 60 * 1000,
        init: async () => {},
        run: (opts) => scrapeAndIndexSocialMedia({ forceUpdate: opts.forceUpdate }),
      };
      break;
    }
    case 'abgeordnetenwatch': {
      const { getAbgeordnetenwatchScraperService } =
        await import('../../services/scrapers/implementations/AbgeordnetenwatchScraper/index.js');
      const service = getAbgeordnetenwatchScraperService();
      config = {
        name: 'Abgeordnetenwatch',
        // Full backfill enriches ~1,900 Abstimmungen with one votes-call each
        // (Grünen stance) at the fair-use limit; --recent runs are minutes.
        timeoutMs: 90 * 60 * 1000,
        init: () => service.init(),
        run: (opts) =>
          service.scrapeAllSources({
            forceUpdate: opts.forceUpdate,
            recent: opts.recent,
            dryRun: opts.dryRun,
          }),
      };
      break;
    }
  }

  sourceCache[sourceId] = config;
  return config;
}

/**
 * In-process runs persist the recorded article events directly (the recorder
 * buffer must be drained either way so it cannot grow across runs in the
 * long-lived API process).
 */
async function persistRecordedEvents(): Promise<void> {
  try {
    const events = drainSyncEvents();
    if (events.length > 0) {
      await upsertSyncEvents(events, { runId: null, runUrl: null });
    }
  } catch (error) {
    log.warn(`Failed to persist sync events (non-fatal): ${toError(error).message}`);
  }
}

/**
 * Scoped per-LV run — mirrors update-all-content.ts's `--landesverband` CLI
 * path, including its own email notification (recipient from
 * landesverbaendeContacts.json, suppressed when nothing changed).
 */
async function runScopedLandesverband(
  landesverband: string,
  opts: RunOpts,
  runUrl: string | undefined,
  fallbackEmail: string | undefined
): Promise<SyncResult> {
  const { landesverbandScraperService } =
    await import('../../services/scrapers/implementations/LandesverbandScraper/index.js');

  await landesverbandScraperService.init();
  const result = await landesverbandScraperService.scrapeAllSources({
    forceUpdate: opts.forceUpdate,
    dryRun: opts.dryRun,
    recent: opts.recent,
    landesverband,
  });

  const hasChanges = result.stored + result.updated + result.errors > 0;
  if (!opts.dryRun) {
    if (!hasChanges) {
      log.info(
        `Per-LV run ${landesverband}: no new/updated docs and no hard errors — skipping email`
      );
    } else {
      const { env } = await import('../../config/env.js');
      const emailTo =
        loadLandesverbandContacts()[landesverband] ?? fallbackEmail ?? env.CONTENT_SYNC_EMAIL;
      if (emailTo) {
        try {
          const sent = await sendContentSyncEmail(emailTo, {
            timestamp: new Date().toISOString(),
            totalDuration: result.duration,
            sources: [
              {
                name: `Landesverband ${landesverband}`,
                status: 'success',
                stored: result.stored,
                updated: result.updated,
                skipped: result.skipped,
                errors: 0,
                duration: result.duration,
              },
            ],
            totals: {
              sources: 1,
              succeeded: 1,
              failed: 0,
              stored: result.stored,
              updated: result.updated,
              skipped: result.skipped,
              errors: 0,
            },
            runUrl,
            dryRun: opts.dryRun,
          });
          log.info(sent ? `LV email sent to ${emailTo}` : 'LV email skipped (SMTP not configured)');
        } catch (emailErr) {
          log.warn(`LV email send failed (non-fatal): ${toError(emailErr).message}`);
        }
      }
    }
  }

  return {
    stored: result.stored,
    updated: result.updated,
    skipped: result.skipped,
    fetchErrors: result.errors,
    errors: 0,
  };
}

const JOB_TTL_SECONDS = 3 * 60 * 60;

const jobKey = (jobId: string): string => `content-sync:job:${jobId}`;

/**
 * setCachedJson swallows Redis errors, but a lost job write means CI polls a
 * phantom job (404s) or a forever-'running' one until its timeout — so verify
 * by read-back and retry before giving up.
 */
async function persistJobStatus(job: ContentSyncJobStatus): Promise<boolean> {
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 1000 * attempt));
    await setCachedJson(jobKey(job.jobId), job, JOB_TTL_SECONDS);
    if (await getCachedJson(jobKey(job.jobId), contentSyncJobStatusSchema)) return true;
  }
  return false;
}

type SyncOutcome =
  | { status: 200; body: ContentSyncResult }
  | { status: 500; body: ContentSyncFailure };

/**
 * The full sync run, shared by the synchronous and background paths. Owns
 * releasing the `runningSync` lock (the caller acquires it so the 409 check
 * stays race-free before responding).
 */
async function executeSyncRun(
  sourceId: ContentSyncSource,
  lockKey: string,
  opts: RunOpts,
  landesverband: string | undefined,
  runUrl: string | undefined,
  fallbackEmail: string | undefined
): Promise<SyncOutcome> {
  const startTime = Date.now();

  try {
    log.info(`Content sync started: ${lockKey}`);

    let name: string;
    let timeoutMs: number;
    let runPromise: Promise<SyncResult>;

    if (sourceId === 'landesverbaende' && landesverband) {
      name = `Landesverband ${landesverband}`;
      timeoutMs = 50 * 60 * 1000;
      runPromise = runScopedLandesverband(landesverband, opts, runUrl, fallbackEmail);
    } else {
      const source = await loadSource(sourceId);
      await source.init();
      name = source.name;
      timeoutMs = source.timeoutMs;
      runPromise = source.run(opts);
    }

    let timeoutId: ReturnType<typeof setTimeout>;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(
        () => reject(new Error(`Timeout after ${Math.round(timeoutMs / 60000)} minutes`)),
        timeoutMs
      );
    });

    const result = await Promise.race([runPromise, timeoutPromise]);
    clearTimeout(timeoutId!);

    await persistRecordedEvents();

    const durationMs = Date.now() - startTime;

    log.info(
      `Content sync completed: ${lockKey} — stored=${result.stored} updated=${result.updated} skipped=${result.skipped} errors=${result.errors} (${Math.round(durationMs / 1000)}s)`
    );

    return {
      status: 200,
      body: {
        success: true,
        sourceId,
        name,
        stored: result.stored,
        updated: result.updated,
        skipped: result.skipped,
        errors: result.errors,
        fetchErrors: result.fetchErrors ?? 0,
        durationMs,
      },
    };
  } catch (error) {
    const err = toError(error);
    const durationMs = Date.now() - startTime;
    // Articles indexed before the failure are real — keep their events.
    await persistRecordedEvents();
    log.error(`Content sync failed: ${lockKey} — ${err.message}`);
    return {
      status: 500,
      body: { success: false, sourceId, error: err.message, durationMs },
    };
  } finally {
    runningSync.delete(lockKey);
  }
}

const s = initServer();

export const contentSyncContractRouter = s.router(contentSyncContract, {
  syncSource: async ({ params, body }) => {
    const { sourceId } = params;
    const {
      landesverband,
      recent = false,
      forceUpdate = false,
      dryRun = false,
      background = false,
      runUrl,
      fallbackEmail,
    } = body ?? {};

    // Concurrent per-LV runs (GH Actions' 8-way matrix) must not lock each
    // other out — only collide on the same LV or the same bulk source.
    const lockKey = landesverband ? `${sourceId}:${landesverband}` : sourceId;
    if (runningSync.has(lockKey)) {
      return { status: 409 as const, body: { error: `Sync already running for: ${lockKey}` } };
    }
    runningSync.add(lockKey);

    const opts: RunOpts = { forceUpdate, recent, dryRun };

    // Background mode exists because full runs (LV BE/HE nightly) outlive the
    // reverse proxy's ~5 min timeout: the job state lives in Redis so polls
    // can hit any cluster worker, while the scrape itself stays in this one.
    if (background) {
      const jobId = randomUUID();
      const startedAt = new Date().toISOString();

      if (!(await persistJobStatus({ jobId, sourceId, status: 'running', startedAt }))) {
        runningSync.delete(lockKey);
        return {
          status: 500 as const,
          body: {
            success: false as const,
            sourceId,
            error: 'Job store unavailable (Redis write failed)',
            durationMs: 0,
          },
        };
      }

      void executeSyncRun(sourceId, lockKey, opts, landesverband, runUrl, fallbackEmail)
        .then(async (outcome) => {
          const persisted = await persistJobStatus({
            jobId,
            sourceId,
            status: outcome.status === 200 ? 'completed' : 'failed',
            startedAt,
            result: outcome.body,
          });
          if (!persisted) {
            log.error(`Failed to persist final status for background sync job ${jobId}`);
          }
        })
        .catch((error) => {
          log.error(`Background sync job ${jobId} crashed: ${toError(error).message}`);
        });

      return { status: 202 as const, body: { accepted: true as const, jobId, sourceId } };
    }

    return executeSyncRun(sourceId, lockKey, opts, landesverband, runUrl, fallbackEmail);
  },

  getSyncJob: async ({ params }) => {
    const job = await getCachedJson(jobKey(params.jobId), contentSyncJobStatusSchema);
    if (!job) {
      return { status: 404 as const, body: { error: `Unknown or expired job: ${params.jobId}` } };
    }
    return { status: 200 as const, body: job };
  },

  listSources: async () => {
    return { status: 200 as const, body: { sources: [...contentSyncSourceSchema.options] } };
  },

  getStats: async () => {
    const { markdown, totalPoints } = await getContentStatsMarkdown();
    return { status: 200 as const, body: { markdown, totalPoints } };
  },
});

export function mountContentSyncContractRouter(app: Application): void {
  createExpressEndpoints(contentSyncContract, contentSyncContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'contentSyncContract'),
  });
}
