/**
 * OParl Routes
 * Access to German parliamentary documents via OParl API
 */

import express, { Response, Router } from 'express';
import oparlApiClient from '../../services/api-clients/oparlApiClient.js';
import { oparlScraperService } from '../../services/scrapers/implementations/OparlScraper.js';
import { requireAuth } from '../../middleware/authMiddleware.js';
import passport from '../../config/passportSetup.js';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { OparlEndpoint } from '../../services/api-clients/oparlApiClient.js';

const log = createLogger('oparl');
const router: Router = express.Router();

router.use(passport.session());

let scraperInitialized = false;

async function ensureScraperInit(): Promise<void> {
  if (!scraperInitialized) {
    await oparlScraperService.init();
    scraperInitialized = true;
  }
}

interface EndpointsResponse {
  success: boolean;
  endpoints?: OparlEndpoint[];
  count?: number;
  error?: string;
}

interface SearchCityQuery {
  q?: string;
}

interface SearchCityResponse {
  success: boolean;
  query?: string;
  results?: OparlEndpoint[];
  count?: number;
  error?: string;
}

interface PapersQuery {
  city?: string;
  limit?: string;
}

interface FormattedPaper {
  id: string;
  title: string;
  reference?: string;
  date?: string;
  paperType?: string;
  mainFile: { name?: string; url?: string } | null;
  web?: unknown;
}

interface PapersResponse {
  success: boolean;
  city?: string;
  body?: unknown;
  greenFactions?: unknown[];
  papers?: FormattedPaper[];
  count?: number;
  totalAvailable?: number;
  error?: string;
  details?: string;
}

interface SearchQuery {
  q?: string;
  city?: string;
  limit?: string;
}

interface SearchResponse {
  success: boolean;
  query?: string;
  city?: string | null;
  results?: unknown[];
  total?: number;
  error?: string;
  details?: string;
}

interface CitiesResponse {
  success: boolean;
  cities?: string[];
  count?: number;
  error?: string;
}

interface StatsResponse {
  success: boolean;
  stats?: unknown;
  error?: string;
}

/**
 * GET /endpoints - Get all available OParl endpoints
 */
router.get('/endpoints', (_req: AuthenticatedRequest, res: Response<EndpointsResponse>): void => {
  try {
    const endpoints = oparlApiClient.getAllEndpoints();
    res.json({
      success: true,
      endpoints,
      count: endpoints.length
    });
  } catch (error) {
    log.error('[OParl] Error fetching endpoints:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Endpoints'
    });
  }
});

/**
 * GET /search-city - Search for cities with OParl data
 */
router.get('/search-city', (req: AuthenticatedRequest, res: Response<SearchCityResponse>): void => {
  try {
    const { q } = req.query as SearchCityQuery;

    if (!q || q.length < 2) {
      res.status(400).json({
        success: false,
        error: 'Suchanfrage muss mindestens 2 Zeichen haben'
      });
      return;
    }

    const results = oparlApiClient.searchCity(q);
    res.json({
      success: true,
      query: q,
      results,
      count: results.length
    });
  } catch (error) {
    log.error('[OParl] Error searching city:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Stadtsuche'
    });
  }
});

/**
 * GET /papers - Fetch green party papers for a city
 */
router.get('/papers', requireAuth, async (req: AuthenticatedRequest, res: Response<PapersResponse>): Promise<void> => {
  try {
    const { city, limit = '50' } = req.query as PapersQuery;

    if (!city) {
      res.status(400).json({
        success: false,
        error: 'Stadt ist erforderlich'
      });
      return;
    }

    log.debug(`[OParl] Papers request for city: ${city} by user: ${req.user?.id}`);

    const cityResults = oparlApiClient.searchCity(city);
    if (cityResults.length === 0) {
      res.status(404).json({
        success: false,
        error: `Keine OParl-Daten für "${city}" verfügbar`
      });
      return;
    }

    const endpoint = cityResults[0];
    const result = await oparlApiClient.getGreenPapers(endpoint.url, parseInt(limit));

    const formattedPapers: FormattedPaper[] = result.papers.map(paper => ({
      id: paper.id,
      title: paper.name || 'Unbenannter Antrag',
      reference: paper.reference,
      date: paper.date,
      paperType: paper.paperType,
      mainFile: paper.mainFile ? {
        name: paper.mainFile.name,
        url: paper.mainFile.accessUrl || paper.mainFile.downloadUrl
      } : null,
      web: paper.web
    }));

    res.json({
      success: true,
      city: endpoint.city,
      body: result.body,
      greenFactions: result.greenFactions,
      papers: formattedPapers,
      count: formattedPapers.length,
      totalAvailable: result.totalPapers
    });
  } catch (error) {
    const err = error as Error;
    log.error('[OParl] Error fetching papers:', err);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Anträge',
      details: err.message
    });
  }
});

/**
 * GET /search - Semantic search across indexed papers in Qdrant
 */
router.get('/search', requireAuth, async (req: AuthenticatedRequest, res: Response<SearchResponse>): Promise<void> => {
  try {
    const { q, city, limit = '10' } = req.query as SearchQuery;

    if (!q || q.trim().length < 2) {
      res.status(400).json({
        success: false,
        error: 'Suchanfrage muss mindestens 2 Zeichen haben'
      });
      return;
    }

    log.debug(`[OParl] Search request: "${q}" city=${city || 'all'} by user: ${req.user?.id}`);

    await ensureScraperInit();

    const searchResult = await oparlScraperService.searchPapers(q.trim(), {
      city: city || undefined,
      limit: parseInt(limit),
      threshold: 0.35
    });

    res.json({
      success: true,
      query: q,
      city: city || null,
      results: searchResult.results,
      total: searchResult.total
    });
  } catch (error) {
    const err = error as Error;
    log.error('[OParl] Search error:', err);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Suche',
      details: err.message
    });
  }
});

/**
 * GET /indexed-cities - Get list of indexed cities from Qdrant
 */
router.get('/indexed-cities', requireAuth, async (_req: AuthenticatedRequest, res: Response<CitiesResponse>): Promise<void> => {
  try {
    await ensureScraperInit();
    const cities = await oparlScraperService.getCities();
    res.json({
      success: true,
      cities,
      count: cities.length
    });
  } catch (error) {
    log.error('[OParl] Error fetching indexed cities:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Städte'
    });
  }
});

/**
 * GET /stats - Get collection statistics
 */
router.get('/stats', requireAuth, async (_req: AuthenticatedRequest, res: Response<StatsResponse>): Promise<void> => {
  try {
    await ensureScraperInit();
    const stats = await oparlScraperService.getStats();
    res.json({
      success: true,
      stats
    });
  } catch (error) {
    log.error('[OParl] Error fetching stats:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Laden der Statistiken'
    });
  }
});

export default router;
