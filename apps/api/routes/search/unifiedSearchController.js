/**
 * Unified Search Controller
 * Handles both normal web search and deep research using LangGraph
 * Replaces multiple existing search controllers
 */

import express from 'express';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('unifiedSearch');

const router = express.Router();

/**
 * POST /api/search
 * Normal web search with optional AI summary
 */
router.post('/', async (req, res) => {
  const startTime = Date.now();

  try {
    const {
      query,
      includeSummary = false,
      maxResults = 10,
      language = 'de-DE',
      timeRange,
      safesearch = 0,
      categories = 'general'
    } = req.body;

    const userId = req.user?.sub || req.user?.id || 'anonymous';

    // Validate input
    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Suchbegriff ist erforderlich'
      });
    }

    if (query.trim().length < 2) {
      return res.status(400).json({
        status: 'error',
        message: 'Suchbegriff muss mindestens 2 Zeichen lang sein'
      });
    }

    if (query.trim().length > 500) {
      return res.status(400).json({
        status: 'error',
        message: 'Suchbegriff ist zu lang (max. 500 Zeichen)'
      });
    }

    log.debug(`[UnifiedSearch] Normal search: "${query}" (userId: ${userId}, summary: ${includeSummary})`);

    // Dynamic import of the LangGraph search function
    const { runWebSearch } = await import('../../agents/langgraph/webSearchGraph.mjs');

    // Prepare search options
    const searchOptions = {
      maxResults: Math.min(Math.max(1, parseInt(maxResults) || 10), 20),
      language: language || 'de-DE',
      safesearch: Math.min(Math.max(0, parseInt(safesearch) || 0), 2),
      categories: categories || 'general',
      includeSummary,
      timeRange
    };

    // Execute normal web search using LangGraph
    const searchResults = await runWebSearch({
      query: query.trim(),
      mode: 'normal',
      user_id: userId,
      searchOptions,
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req
    });

    if (searchResults.status !== 'success') {
      log.error(`[UnifiedSearch] Search failed: ${searchResults.error}`);
      return res.status(500).json({
        status: 'error',
        message: 'Websuche fehlgeschlagen',
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    const processingTime = Date.now() - startTime;
    log.debug(`[UnifiedSearch] Normal search completed: ${searchResults.results?.length || 0} results, ${processingTime}ms`);

    // Prepare response
    const response = {
      success: true,
      query: searchResults.query,
      results: searchResults.results || [],
      resultCount: searchResults.results?.length || 0,
      searchEngine: 'searxng-langgraph',
      metadata: {
        ...searchResults.metadata,
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
        searchType: 'normal',
        includedSummary: !!searchResults.summary?.generated
      }
    };

    // Add summary if generated
    if (searchResults.summary) {
      response.summary = searchResults.summary;
    }

    // Add citations if available
    if (searchResults.citations && searchResults.citations.length > 0) {
      response.citations = searchResults.citations;
    }

    // Add citation sources if available
    if (searchResults.citationSources && searchResults.citationSources.length > 0) {
      response.sources = searchResults.citationSources;
    }

    res.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[UnifiedSearch] Normal search error (${processingTime}ms):`, error);

    // Map common errors to user-friendly messages
    let userError = 'Websuche fehlgeschlagen';

    if (error.message.includes('timeout')) {
      userError = 'Die Suche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
    } else if (error.message.includes('network') || error.message.includes('ENOTFOUND')) {
      userError = 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
    } else if (error.message.includes('SearXNG')) {
      userError = 'Suchmaschine temporär nicht verfügbar. Bitte versuchen Sie es später erneut.';
    }

    res.status(500).json({
      success: false,
      error: userError,
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
        searchType: 'normal'
      },
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/search/deep-research
 * Deep research mode with comprehensive analysis
 */
router.post('/deep-research', async (req, res) => {
  const startTime = Date.now();

  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        status: 'error',
        message: 'Suchbegriff ist erforderlich'
      });
    }

    const userId = req.user?.sub || req.user?.id || 'anonymous';
    log.debug(`[UnifiedSearch] Deep research: "${query}" (userId: ${userId})`);

    // Dynamic import of the LangGraph search function
    const { runWebSearch } = await import('../../agents/langgraph/webSearchGraph.mjs');

    // Track performance metrics
    const performanceMetrics = {
      startTime,
      aiCalls: 0,
      estimatedTokens: 0
    };

    // Execute deep research using LangGraph
    const searchResults = await runWebSearch({
      query: query.trim(),
      mode: 'deep',
      user_id: userId,
      searchOptions: {
        maxResults: 10,
        language: 'de-DE'
      },
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req
    });

    if (searchResults.status !== 'success') {
      log.error(`[UnifiedSearch] Deep research failed: ${searchResults.error}`);
      return res.status(500).json({
        status: 'error',
        message: 'Fehler bei der Deep Research',
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    // Complete performance metrics
    performanceMetrics.endTime = Date.now();
    performanceMetrics.totalDuration = performanceMetrics.endTime - performanceMetrics.startTime;

    log.debug(`[UnifiedSearch] Deep research completed: ${performanceMetrics.totalDuration}ms`);

    // Prepare response matching the expected format from deepResearchController
    const response = {
      status: 'success',
      dossier: searchResults.dossier,
      researchQuestions: searchResults.researchQuestions || [],
      searchResults: searchResults.searchResults || [],
      sources: searchResults.sources || [],
      categorizedSources: searchResults.categorizedSources || {},
      grundsatzResults: searchResults.grundsatzResults || null,
      // Add citation support for deep research
      citations: searchResults.citations || [],
      citationSources: searchResults.citationSources || [],
      metadata: {
        ...searchResults.metadata,
        totalSources: (searchResults.sources?.length || 0) + (searchResults.grundsatzResults?.results?.length || 0),
        externalSources: searchResults.sources?.length || 0,
        officialSources: searchResults.grundsatzResults?.results?.length || 0,
        categories: Object.keys(searchResults.categorizedSources || {}),
        questionsCount: searchResults.researchQuestions?.length || 0,
        hasOfficialPosition: searchResults.metadata?.hasOfficialPosition || false,
        // Performance metrics for monitoring
        performance: {
          duration: performanceMetrics.totalDuration,
          aiCalls: performanceMetrics.aiCalls,
          estimatedTokens: performanceMetrics.estimatedTokens
        }
      }
    };

    res.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[UnifiedSearch] Deep research error (${processingTime}ms):`, error);

    res.status(500).json({
      status: 'error',
      message: 'Fehler bei der Deep Research',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined,
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
        searchType: 'deep_research'
      }
    });
  }
});

/**
 * POST /api/search/analyze
 * Search analysis endpoint (for backward compatibility)
 */
router.post('/analyze', async (req, res) => {
  const { contents } = req.body;

  try {
    // Basic validation
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Inhalte für die Analyse sind erforderlich'
      });
    }

    log.debug(`[UnifiedSearch] Analysis request: ${contents.length} items`);

    // Use AI worker to analyze the content
    const result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'search_analysis',
      systemPrompt: `Du bist ein Recherche-Assistent, der Suchergebnisse gründlich analysiert.

Deine Aufgabe ist es, die Inhalte der gefundenen Webseiten zu analysieren und eine detaillierte Zusammenfassung zu erstellen:
- Nutze ALLE verfügbaren Quellen für deine Analyse
- Fasse die Informationen ausführlich zusammen
- Strukturiere den Text mit Zwischenüberschriften und Hervorhebungen
- Verwende Stichpunkte für Aufzählungen
- Bleibe neutral und sachlich
- Beziehe dich ausschließlich auf die Inhalte der Quellen

Formatierung:
- Verwende <h3>Zwischenüberschrift</h3> für thematische Abschnitte
- Nutze <strong>Fettdruck</strong> für wichtige Begriffe und Kernaussagen
- Setze <em>Kursivschrift</em> für Zitate oder Betonungen
- Strukturiere Aufzählungen mit <ul> und <li> Tags
- Trenne Absätze mit <p> Tags

WICHTIG: Du MUSST für JEDE einzelne Quelle eine Empfehlung schreiben, keine auslassen!

Format deiner Antwort:
1. Hauptteil: Deine ausführlich formatierte Zusammenfassung
2. Listen mit <ul> und <li> Tags
3. Nach zwei Leerzeilen: "###SOURCE_RECOMMENDATIONS_START###"
4. Für JEDE einzelne Quelle (keine auslassen):
   "QUELLE: [Titel]
   ZUSAMMENFASSUNG: [Ein prägnanter Satz, der den Hauptinhalt der Quelle zusammenfasst]"
5. Nach zwei Leerzeilen: "###SOURCE_RECOMMENDATIONS_END###"
6. Nach zwei Leerzeilen: "###USED_SOURCES_START###"
7. Auflistung der verwendeten Quellen: "QUELLE: [Titel]"
8. "###USED_SOURCES_END###"`,
      messages: [{
        role: "user",
        content: [{
          type: "text",
          text: `Erstelle eine ausführliche Zusammenfassung der folgenden Suchergebnisse. Nutze möglichst alle Quellen und liste am Ende die verwendeten Quellen auf:
          ${JSON.stringify(contents, null, 2)}`
        }]
      }],
      options: {
        max_tokens: 4000,
        temperature: 0.7
      }
    }, req);

    if (!result.success) {
      throw new Error(result.error);
    }

    // Parse the result (same logic as original searchAnalysis.js)
    const content = result.content;
    const mainText = content.split('###SOURCE_RECOMMENDATIONS_START###')[0].trim();

    // Extract source recommendations
    const recommendationsMatch = content.match(/###SOURCE_RECOMMENDATIONS_START###\n([\s\S]*?)\n###SOURCE_RECOMMENDATIONS_END###/);
    const sourceRecommendations = recommendationsMatch ?
      recommendationsMatch[1]
        .split('\nQUELLE: ')
        .filter(Boolean)
        .map(block => {
          const [title, summaryLine] = block.split('\n');
          return {
            title: title.trim(),
            summary: summaryLine.replace('ZUSAMMENFASSUNG: ', '').trim()
          };
        })
      : [];

    const sourcesMatch = content.match(/###USED_SOURCES_START###\n([\s\S]*?)\n###USED_SOURCES_END###/);
    const usedSourceTitles = sourcesMatch ?
      sourcesMatch[1]
        .split('\n')
        .map(line => line.trim())
        .filter(line => line.startsWith('QUELLE: '))
        .map(line => line.replace('QUELLE: ', ''))
      : [];

    res.json({
      status: 'success',
      analysis: mainText,
      sourceRecommendations,
      claudeSourceTitles: usedSourceTitles,
      metadata: result.metadata
    });

  } catch (error) {
    log.error('[UnifiedSearch] Analysis error:', error);
    res.status(500).json({
      status: 'error',
      error: 'Fehler bei der Analyse der Suchergebnisse',
      details: error.message
    });
  }
});

/**
 * GET /api/search/status
 * Get search service status and health
 */
router.get('/status', async (req, res) => {
  try {
    // Dynamic import of the SearXNG service
    const searxngService = await import('../../services/searxngService.mjs');
    const status = await searxngService.default.getServiceStatus();

    res.json({
      success: true,
      status: 'operational',
      service: 'LangGraph Web Search',
      searxng: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[UnifiedSearch] Status check failed:', error);

    res.status(503).json({
      success: false,
      status: 'error',
      service: 'LangGraph Web Search',
      error: 'Service status check failed',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/search/clear-cache
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
    // Dynamic import of the SearXNG service
    const searxngService = await import('../../services/searxngService.mjs');
    await searxngService.default.clearCache();

    res.json({
      success: true,
      message: 'Cache erfolgreich geleert',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[UnifiedSearch] Cache clear failed:', error);

    res.status(500).json({
      success: false,
      error: 'Fehler beim Leeren des Caches',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

export default router;