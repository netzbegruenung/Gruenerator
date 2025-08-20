const express = require('express');
const router = express.Router();
const searxngWebSearchService = require('../services/searxngWebSearchService');

/**
 * POST /api/web-search
 * Performs web search using SearXNG with optional AI summary
 */
router.post('/', async (req, res) => {
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
    
    // Validate input
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

    console.log(`[web-search] User ${userId} searching: "${query}" (type: ${searchType}, summary: ${includeSummary})`);

    // Prepare search options
    const searchOptions = {
      maxResults: Math.min(Math.max(1, parseInt(maxResults) || 10), 20), // Limit between 1-20
      language: language || 'de-DE',
      safesearch: Math.min(Math.max(0, parseInt(safesearch) || 0), 2), // 0-2 range
      categories: mapSearchTypeToCategories(searchType),
      page: 1 // Always start with first page for now
    };

    // Add time range if specified
    if (timeRange && ['day', 'week', 'month', 'year'].includes(timeRange)) {
      searchOptions.time_range = timeRange;
    }

    console.log(`[web-search] Search options:`, searchOptions);

    // Perform the web search
    const searchResults = await searxngWebSearchService.performWebSearch(query, searchOptions);

    if (!searchResults.success) {
      console.log(`[web-search] Search failed: ${searchResults.error}`);
      return res.status(500).json({
        success: false,
        error: 'Websuche fehlgeschlagen',
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    let finalResults = searchResults;

    // Generate AI summary if requested
    if (includeSummary && searchResults.results && searchResults.results.length > 0) {
      console.log(`[web-search] Generating AI summary for ${searchResults.results.length} results`);
      
      try {
        finalResults = await searxngWebSearchService.generateAISummary(
          searchResults, 
          query, 
          req.app.locals.aiWorkerPool,
          { 
            maxResults: searchOptions.maxResults,
            usePrivacyMode: req.body.usePrivacyMode || false
          }
        );
      } catch (summaryError) {
        console.warn(`[web-search] AI summary generation failed:`, summaryError.message);
        // Continue without summary rather than failing the whole request
        finalResults = {
          ...searchResults,
          summary: {
            text: 'Zusammenfassung konnte nicht generiert werden.',
            generated: false,
            error: summaryError.message
          }
        };
      }
    }

    const processingTime = Date.now() - startTime;
    console.log(`[web-search] Search completed: ${finalResults.resultCount} results, ${processingTime}ms`);

    // Prepare response
    const response = {
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

    // Add summary if it was requested and generated
    if (includeSummary && finalResults.summary) {
      response.summary = finalResults.summary;
    }

    // Add additional SearXNG data if available
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
    console.error(`[web-search] Error processing request (${processingTime}ms):`, error);
    
    // Map common errors to user-friendly messages
    let userError = 'Websuche fehlgeschlagen';
    
    if (error.message.includes('timeout')) {
      userError = 'Die Suche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      userError = 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
    } else if (error.message.includes('SearXNG API')) {
      userError = 'Suchmaschine temporär nicht verfügbar. Bitte versuchen Sie es später erneut.';
    } else if (error.message.includes('rate limit')) {
      userError = 'Zu viele Anfragen. Bitte warten Sie einen Moment und versuchen Sie es erneut.';
    }

    res.status(500).json({
      success: false,
      error: userError,
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString()
      },
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * GET /api/web-search/status
 * Get search service status and health
 */
router.get('/status', async (req, res) => {
  try {
    const status = await searxngWebSearchService.getServiceStatus();
    
    res.json({
      success: true,
      status: 'operational',
      service: 'SearXNG Web Search',
      data: status
    });
  } catch (error) {
    console.error('[web-search] Status check failed:', error);
    
    res.status(503).json({
      success: false,
      status: 'error',
      service: 'SearXNG Web Search',
      error: 'Service status check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/web-search/clear-cache
 * Clear search cache (admin/development only)
 */
router.post('/clear-cache', async (req, res) => {
  // Simple auth check - in production you'd want proper admin authentication
  const isAdmin = req.user?.role === 'admin' || process.env.NODE_ENV === 'development';
  
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
    console.error('[web-search] Cache clear failed:', error);
    
    res.status(500).json({
      success: false,
      error: 'Fehler beim Leeren des Caches',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * Map search type to SearXNG categories
 * @param {string} searchType - Search type from client
 * @returns {string} SearXNG categories
 */
function mapSearchTypeToCategories(searchType) {
  const categoryMap = {
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

module.exports = router;