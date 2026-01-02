import express from 'express';
import oparlApiClient from '../services/api-clients/oparlApiClient';
import { oparlScraperService } from '../services/scrapers/implementations/OparlScraper/index.js';
import authMiddlewareModule from '../middleware/authMiddleware.js';
import passport from '../config/passportSetup.js';
import { createLogger } from '../utils/logger.js';

const log = createLogger('oparl');
const { requireAuth: ensureAuthenticated } = authMiddlewareModule;
const router = express.Router();

router.use(passport.session());

let scraperInitialized = false;
async function ensureScraperInit() {
  if (!scraperInitialized) {
    await oparlScraperService.init();
    scraperInitialized = true;
  }
}

router.get('/endpoints', (req, res) => {
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

router.get('/search-city', (req, res) => {
  try {
    const { q } = req.query;

    if (!q || q.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Suchanfrage muss mindestens 2 Zeichen haben'
      });
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

router.get('/papers', ensureAuthenticated, async (req, res) => {
  try {
    const { city, limit = 50 } = req.query;

    if (!city) {
      return res.status(400).json({
        success: false,
        error: 'Stadt ist erforderlich'
      });
    }

    log.debug(`[OParl] Papers request for city: ${city} by user: ${req.user?.id}`);

    const cityResults = oparlApiClient.searchCity(city);
    if (cityResults.length === 0) {
      return res.status(404).json({
        success: false,
        error: `Keine OParl-Daten für "${city}" verfügbar`
      });
    }

    const endpoint = cityResults[0];
    const result = await oparlApiClient.getGreenPapers(endpoint.url, parseInt(limit));

    const formattedPapers = result.papers.map(paper => ({
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
    log.error('[OParl] Error fetching papers:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler beim Abrufen der Anträge',
      details: error.message
    });
  }
});

// Semantic search across all indexed papers in Qdrant
router.get('/search', ensureAuthenticated, async (req, res) => {
  try {
    const { q, city, limit = 10 } = req.query;

    if (!q || q.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Suchanfrage muss mindestens 2 Zeichen haben'
      });
    }

    log.debug(`[OParl] Search request: "${q}" city=${city || 'all'} by user: ${req.user?.id}`);

    await ensureScraperInit();

    const searchResult = await oparlScraperService.searchPapers(q.trim(), {
      city: city || null,
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
    log.error('[OParl] Search error:', error);
    res.status(500).json({
      success: false,
      error: 'Fehler bei der Suche',
      details: error.message
    });
  }
});

// Get list of indexed cities from Qdrant
router.get('/indexed-cities', ensureAuthenticated, async (req, res) => {
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

// Get collection stats
router.get('/stats', ensureAuthenticated, async (req, res) => {
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
