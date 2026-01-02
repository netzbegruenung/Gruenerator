import express, { Request, Response, Router } from 'express';
import { searxngService as searxngWebSearchService } from '../../services/search/index.js';
import { createLogger } from '../../utils/logger.js';
import type { FormattedSearchResults, FormattedSearchResultsWithSummary } from '../../services/search/types.js';

const log = createLogger('webSearch');
const router: Router = express.Router();

interface SearchRequestBody {
  query: string;
  searchType?: string;
  includeSummary?: boolean;
  maxResults?: number;
  language?: string;
  timeRange?: string;
  safesearch?: number;
  usePrivacyMode?: boolean;
}

interface SearchRequestUser {
  sub?: string;
  id?: string;
  role?: string;
}

type SearchRequest = Request<Record<string, string>, unknown, SearchRequestBody> & {
  user?: SearchRequestUser;
};

type SearchResultsWithSummary = FormattedSearchResultsWithSummary & {
  error?: string;
};

function mapSearchTypeToCategories(searchType: string): string {
  const categoryMap: Record<string, string> = {
    'general': 'general',
    'news': 'news',
    'images': 'images',
    'videos': 'videos',
    'music': 'music',
    'files': 'files',
    'it': 'it',
    'science': 'science',
    'social': 'social media',
    'web': 'general',
    'academic': 'science'
  };

  return categoryMap[searchType] || 'general';
}

router.post('/', async (req: SearchRequest, res: Response) => {
  const startTime = Date.now();

  try {
    const {
      query,
      searchType = 'general',
      includeSummary = false,
      maxResults = 10,
      language = 'de-DE',
      timeRange,
      safesearch = 0
    } = req.body;

    const userId = req.user?.sub || req.user?.id || 'anonymous';

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff ist erforderlich und muss ein gültiger String sein'
      });
    }

    if (query.trim().length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff muss mindestens 2 Zeichen lang sein'
      });
    }

    if (query.trim().length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff ist zu lang (max. 500 Zeichen)'
      });
    }

    log.debug(`[web-search] User ${userId} searching: "${query}" (type: ${searchType}, summary: ${includeSummary})`);

    const searchOptions: {
      maxResults: number;
      language: string;
      safesearch: number;
      categories: string;
      page: number;
      time_range?: string;
    } = {
      maxResults: Math.min(Math.max(1, parseInt(String(maxResults)) || 10), 20),
      language: language || 'de-DE',
      safesearch: Math.min(Math.max(0, parseInt(String(safesearch)) || 0), 2),
      categories: mapSearchTypeToCategories(searchType),
      page: 1
    };

    if (timeRange && ['day', 'week', 'month', 'year'].includes(timeRange)) {
      searchOptions.time_range = timeRange;
    }

    log.debug(`[web-search] Search options:`, searchOptions);

    const searchResults = await searxngWebSearchService.performWebSearch(query, searchOptions) as FormattedSearchResults & { error?: string };

    if (!searchResults.success) {
      log.debug(`[web-search] Search failed: ${searchResults.error}`);
      return res.status(500).json({
        success: false,
        error: 'Websuche fehlgeschlagen',
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    let finalResults: SearchResultsWithSummary = searchResults;

    if (includeSummary && searchResults.results && searchResults.results.length > 0) {
      log.debug(`[web-search] Generating AI summary for ${searchResults.results.length} results`);

      try {
        finalResults = await searxngWebSearchService.generateAISummary(
          searchResults,
          query,
          req.app.locals.aiWorkerPool,
          {
            maxResults: searchOptions.maxResults,
            usePrivacyMode: req.body.usePrivacyMode || false
          },
          req
        ) as FormattedSearchResults;
      } catch (summaryError) {
        log.warn(`[web-search] AI summary generation failed:`, (summaryError as Error).message);
        finalResults = {
          ...searchResults,
          summary: {
            text: 'Zusammenfassung konnte nicht generiert werden.',
            generated: false,
            error: (summaryError as Error).message
          }
        };
      }
    }

    const processingTime = Date.now() - startTime;
    log.debug(`[web-search] Search completed: ${finalResults.resultCount} results, ${processingTime}ms`);

    const response: Record<string, unknown> = {
      success: true,
      query: finalResults.query,
      results: finalResults.results,
      resultCount: finalResults.resultCount,
      totalResults: finalResults.totalResults,
      searchEngine: 'searxng',
      contentStats: finalResults.contentStats,
      metadata: {
        searchType,
        processingTimeMs: processingTime,
        timestamp: finalResults.timestamp,
        searchOptions: finalResults.searchOptions,
        includedSummary: includeSummary && finalResults.summary?.generated || false
      }
    };

    if (includeSummary && finalResults.summary) {
      response.summary = finalResults.summary;
    }

    if (finalResults.suggestions && finalResults.suggestions.length > 0) {
      response.suggestions = finalResults.suggestions;
    }

    if (finalResults.infoboxes && finalResults.infoboxes.length > 0) {
      response.infoboxes = finalResults.infoboxes;
    }

    if (finalResults.answers && finalResults.answers.length > 0) {
      response.answers = finalResults.answers;
    }

    res.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[web-search] Error processing request (${processingTime}ms):`, error);

    let userError = 'Websuche fehlgeschlagen';
    const errorMessage = (error as Error).message;

    if (errorMessage.includes('timeout')) {
      userError = 'Die Suche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    } else if (errorMessage.includes('network') || errorMessage.includes('ENOTFOUND')) {
      userError = 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
    } else if (errorMessage.includes('SearXNG API')) {
      userError = 'Suchmaschine temporär nicht verfügbar. Bitte versuchen Sie es später erneut.';
    } else if (errorMessage.includes('rate limit')) {
      userError = 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
    }

    res.status(500).json({
      success: false,
      error: userError,
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      },
      details: process.env.NODE_ENV === 'development' ? errorMessage : undefined
    });
  }
});

router.get('/status', async (_req: Request, res: Response) => {
  try {
    const status = await searxngWebSearchService.getServiceStatus();

    res.json({
      success: true,
      status: 'operational',
      service: 'SearXNG Web Search',
      data: status
    });
  } catch (error) {
    log.error('[web-search] Status check failed:', error);

    res.status(503).json({
      success: false,
      status: 'error',
      service: 'SearXNG Web Search',
      error: 'Service status check failed',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

router.post('/clear-cache', async (req: Request, res: Response) => {
  const user = (req as SearchRequest).user;
  const isAdmin = user?.role === 'admin' || process.env.NODE_ENV === 'development';

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Zugriff verweigert - Admin-Berechtigung erforderlich'
    });
  }

  try {
    await searxngWebSearchService.clearCache();

    res.json({
      success: true,
      message: 'Cache erfolgreich geleert',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[web-search] Cache clear failed:', error);

    res.status(500).json({
      success: false,
      error: 'Fehler beim Leeren des Caches',
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

export default router;
