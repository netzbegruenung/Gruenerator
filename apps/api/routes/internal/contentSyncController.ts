import { Router, type Request, type Response } from 'express';

import { requireAdminToken } from '../../middleware/adminTokenMiddleware.js';
import { toError } from '../../utils/errors/index.js';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('content-sync-internal');
const router: Router = Router();

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

const sourceCache: Record<string, SourceConfig> = {};
const runningSync = new Set<string>();

async function loadSource(sourceId: string): Promise<SourceConfig | null> {
  if (sourceCache[sourceId]) return sourceCache[sourceId];

  let config: SourceConfig | null = null;

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

  if (config) sourceCache[sourceId] = config;
  return config;
}

const VALID_SOURCES = [
  'landesverbaende',
  'gruenblog',
  'gruene-at',
  'kommunalwiki',
  'boell-stiftung',
  'bundestag',
  'social-media',
];

router.post(
  '/source/:sourceId',
  requireAdminToken,
  async (req: Request<{ sourceId: string }>, res: Response): Promise<void> => {
    const { sourceId } = req.params;

    if (!VALID_SOURCES.includes(sourceId)) {
      res
        .status(400)
        .json({ error: `Invalid source: ${sourceId}. Valid: ${VALID_SOURCES.join(', ')}` });
      return;
    }

    if (runningSync.has(sourceId)) {
      res.status(409).json({ error: `Sync already running for: ${sourceId}` });
      return;
    }

    const startTime = Date.now();

    try {
      runningSync.add(sourceId);
      log.info(`Content sync started: ${sourceId}`);

      const source = await loadSource(sourceId);
      if (!source) {
        res.status(500).json({ error: `Failed to load source: ${sourceId}` });
        return;
      }

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

      const durationMs = Date.now() - startTime;

      log.info(
        `Content sync completed: ${sourceId} — stored=${result.stored} updated=${result.updated} skipped=${result.skipped} errors=${result.errors} (${Math.round(durationMs / 1000)}s)`
      );

      res.json({
        success: true,
        sourceId,
        name: source.name,
        stored: result.stored ?? 0,
        updated: result.updated ?? 0,
        skipped: result.skipped ?? 0,
        errors: result.errors ?? 0,
        fetchErrors: result.fetchErrors ?? 0,
        durationMs,
      });
    } catch (error) {
      const err = toError(error);
      const durationMs = Date.now() - startTime;
      log.error(`Content sync failed: ${sourceId} — ${err.message}`);
      res.status(500).json({ success: false, sourceId, error: err.message, durationMs });
    } finally {
      runningSync.delete(sourceId);
    }
  }
);

router.get('/sources', (_req: Request, res: Response): void => {
  res.json({ sources: VALID_SOURCES });
});

export const contentSyncRouter = router;
