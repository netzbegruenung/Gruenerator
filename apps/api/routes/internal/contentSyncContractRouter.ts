/**
 * ts-rest contract router for the internal content-sync endpoint.
 *
 * Replaces the legacy Express router (contentSyncController.ts). This is the
 * n8n boundary: n8n triggers a per-source scraper run and reads back the
 * SyncResult counts. The contract (@gruenerator/contracts) is the source of
 * truth for request/response shapes, and `contentSyncSourceSchema` validates
 * `:sourceId` before the handler runs.
 *
 * Middleware is applied at the prefix in routes.ts, not here:
 *   - /api/internal/content-sync/* → requireAdminToken
 */
import {
  contentSyncContract,
  contentSyncSourceSchema,
  type ContentSyncSource,
} from '@gruenerator/contracts';
import { createExpressEndpoints, initServer } from '@ts-rest/express';

import { upsertSyncEvents } from '../../services/monitor/ContentSyncEventsService.js';
import { drainSyncEvents } from '../../services/scrapers/syncEventRecorder.js';
import { logContractValidationError } from '../../utils/contractValidationLogger.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

import type { Application } from 'express';

const log = createLogger('content-sync-internal');

interface SyncResult {
  stored: number;
  updated: number;
  skipped: number;
  errors: number;
  fetchErrors?: number;
}

interface SourceConfig {
  name: string;
  timeoutMs: number;
  init: () => Promise<void>;
  run: () => Promise<SyncResult>;
}

const sourceCache: Partial<Record<ContentSyncSource, SourceConfig>> = {};
const runningSync = new Set<ContentSyncSource>();

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
        run: () =>
          landesverbandScraperService.scrapeAllSources({ forceUpdate: false, dryRun: false }),
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
        run: () => gruenblogScraperService.fullCrawl({ forceUpdate: false }),
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
        run: () => grueneAtScraperService.fullCrawl({ forceUpdate: false }),
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
        run: () => kommunalwikiScraper.fullCrawl({ forceUpdate: false }),
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
        run: () => boellStiftungScraperService.fullCrawl({ forceUpdate: false }),
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
        run: () => bundestagScraperService.scrapeAllSources({ forceUpdate: false }),
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
        run: () => scrapeAndIndexSocialMedia({ forceUpdate: false }),
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

const s = initServer();

export const contentSyncContractRouter = s.router(contentSyncContract, {
  syncSource: async ({ params }) => {
    const { sourceId } = params;

    if (runningSync.has(sourceId)) {
      return { status: 409 as const, body: { error: `Sync already running for: ${sourceId}` } };
    }

    const startTime = Date.now();

    try {
      runningSync.add(sourceId);
      log.info(`Content sync started: ${sourceId}`);

      const source = await loadSource(sourceId);
      await source.init();

      let timeoutId: ReturnType<typeof setTimeout>;
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(
          () => reject(new Error(`Timeout after ${Math.round(source.timeoutMs / 60000)} minutes`)),
          source.timeoutMs
        );
      });

      const result = await Promise.race([source.run(), timeoutPromise]);
      clearTimeout(timeoutId!);

      await persistRecordedEvents();

      const durationMs = Date.now() - startTime;

      log.info(
        `Content sync completed: ${sourceId} — stored=${result.stored} updated=${result.updated} skipped=${result.skipped} errors=${result.errors} (${Math.round(durationMs / 1000)}s)`
      );

      return {
        status: 200 as const,
        body: {
          success: true as const,
          sourceId,
          name: source.name,
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
      log.error(`Content sync failed: ${sourceId} — ${err.message}`);
      return {
        status: 500 as const,
        body: { success: false as const, sourceId, error: err.message, durationMs },
      };
    } finally {
      runningSync.delete(sourceId);
    }
  },

  listSources: async () => {
    return { status: 200 as const, body: { sources: [...contentSyncSourceSchema.options] } };
  },
});

export function mountContentSyncContractRouter(app: Application): void {
  createExpressEndpoints(contentSyncContract, contentSyncContractRouter, app, {
    requestValidationErrorHandler: logContractValidationError(log, 'contentSyncContract'),
  });
}
