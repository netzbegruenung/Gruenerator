/**
 * Search Controller
 * Consolidated TypeScript controller for all search functionality
 * Handles normal web search, deep research, and analysis endpoints
 */

import express, { Response, Router } from 'express';
import { createLogger } from '../../utils/logger.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type {
  WebSearchInput,
  NormalSearchOutput,
  DeepSearchOutput,
  SearchOptions,
  SearchResult,
  WebSearchBatch,
  ResearchDossier,
  CategorizedSources,
  GrundsatzResult,
  Citation,
  Source,
  SearchMetadata
} from '../../agents/langgraph/WebSearchGraph/types.js';

const log = createLogger('search');

// ============================================================================
// Request/Response Types
// ============================================================================

interface SearchRequest extends AuthenticatedRequest {
  body: {
    query: string;
    includeSummary?: boolean;
    maxResults?: number;
    language?: string;
    timeRange?: string;
    safesearch?: number;
    categories?: string;
  };
}

interface DeepResearchRequest extends AuthenticatedRequest {
  body: {
    query: string;
  };
}

interface AnalyzeRequest extends AuthenticatedRequest {
  body: {
    contents: Array<{
      url: string;
      title: string;
      content?: string;
      raw_content?: string;
    }>;
  };
}

interface SourceRecommendation {
  title: string;
  summary: string;
}

interface NormalSearchResponse {
  success: boolean;
  query: string;
  results: SearchResult[];
  resultCount: number;
  searchEngine: string;
  summary?: {
    text?: string;
    generated?: boolean;
  };
  citations?: Citation[];
  sources?: Source[];
  metadata: {
    processingTimeMs: number;
    timestamp: string;
    searchType: string;
    includedSummary: boolean;
    [key: string]: unknown;
  };
}

interface DeepResearchResponse {
  status: 'success' | 'error';
  dossier: ResearchDossier | null;
  researchQuestions: string[];
  searchResults: WebSearchBatch[];
  sources: SearchResult[];
  categorizedSources: CategorizedSources;
  grundsatzResults: GrundsatzResult | null;
  citations: Citation[];
  citationSources: Source[];
  metadata: {
    totalSources: number;
    externalSources: number;
    officialSources: number;
    categories: string[];
    questionsCount: number;
    hasOfficialPosition: boolean;
    performance: {
      duration: number;
      aiCalls: number;
      estimatedTokens: number;
    };
    [key: string]: unknown;
  };
  details?: string;
}

interface AnalyzeResponse {
  status: 'success' | 'error';
  analysis?: string;
  sourceRecommendations?: SourceRecommendation[];
  claudeSourceTitles?: string[];
  metadata?: SearchMetadata;
  error?: string;
  details?: string;
}

interface StatusResponse {
  success: boolean;
  status: string;
  service: string;
  searxng?: unknown;
  timestamp: string;
  error?: string;
  details?: string;
}

interface ClearCacheResponse {
  success: boolean;
  message?: string;
  error?: string;
  timestamp: string;
}

// ============================================================================
// Router Setup
// ============================================================================

const router: Router = express.Router();

// ============================================================================
// Helper Functions
// ============================================================================

function getUserId(req: AuthenticatedRequest): string {
  return req.user?.id || req.user?.keycloak_id || 'anonymous';
}

function parseAnalysisResponse(content: string): {
  mainText: string;
  sourceRecommendations: SourceRecommendation[];
  usedSourceTitles: string[];
} {
  const mainText = content.split('###SOURCE_RECOMMENDATIONS_START###')[0].trim();

  const recommendationsMatch = content.match(
    /###SOURCE_RECOMMENDATIONS_START###\n([\s\S]*?)\n###SOURCE_RECOMMENDATIONS_END###/
  );
  const sourceRecommendations: SourceRecommendation[] = recommendationsMatch
    ? recommendationsMatch[1]
        .split('\nQUELLE: ')
        .filter(Boolean)
        .map((block) => {
          const [title, summaryLine] = block.split('\n');
          return {
            title: title.trim(),
            summary: (summaryLine || '').replace('ZUSAMMENFASSUNG: ', '').trim()
          };
        })
    : [];

  const sourcesMatch = content.match(
    /###USED_SOURCES_START###\n([\s\S]*?)\n###USED_SOURCES_END###/
  );
  const usedSourceTitles: string[] = sourcesMatch
    ? sourcesMatch[1]
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.startsWith('QUELLE: '))
        .map((line) => line.replace('QUELLE: ', ''))
    : [];

  return { mainText, sourceRecommendations, usedSourceTitles };
}

function mapErrorToUserMessage(error: Error): string {
  const message = error.message;

  if (message.includes('timeout')) {
    return 'Die Suche hat zu lange gedauert. Bitte versuchen Sie es erneut.';
  }
  if (message.includes('network') || message.includes('ENOTFOUND')) {
    return 'Netzwerkfehler. Bitte überprüfen Sie Ihre Verbindung und versuchen Sie es erneut.';
  }
  if (message.includes('SearXNG')) {
    return 'Suchmaschine temporär nicht verfügbar. Bitte versuchen Sie es später erneut.';
  }

  return 'Websuche fehlgeschlagen';
}

// ============================================================================
// Route Handlers
// ============================================================================

/**
 * POST /api/search
 * Normal web search with optional AI summary
 */
router.post('/', async (req: SearchRequest, res: Response<NormalSearchResponse | { success: false; error: string; metadata: unknown; details?: string }>) => {
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

    const userId = getUserId(req);

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff ist erforderlich',
        metadata: { timestamp: new Date().toISOString(), searchType: 'normal' }
      });
    }

    const trimmedQuery = query.trim();

    if (trimmedQuery.length < 2) {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff muss mindestens 2 Zeichen lang sein',
        metadata: { timestamp: new Date().toISOString(), searchType: 'normal' }
      });
    }

    if (trimmedQuery.length > 500) {
      return res.status(400).json({
        success: false,
        error: 'Suchbegriff ist zu lang (max. 500 Zeichen)',
        metadata: { timestamp: new Date().toISOString(), searchType: 'normal' }
      });
    }

    log.debug(`[Search] Normal search: "${trimmedQuery}" (userId: ${userId}, summary: ${includeSummary})`);

    const { runWebSearch } = await import('../../agents/langgraph/WebSearchGraph/index.js');

    const searchOptions: SearchOptions = {
      maxResults: Math.min(Math.max(1, parseInt(String(maxResults)) || 10), 20),
      language: language || 'de-DE',
      safesearch: Math.min(Math.max(0, parseInt(String(safesearch)) || 0), 2),
      categories: categories || 'general',
      time_range: timeRange
    };

    const searchInput: WebSearchInput = {
      query: trimmedQuery,
      mode: 'normal',
      user_id: userId,
      searchOptions,
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req
    };

    const searchResults = await runWebSearch(searchInput) as NormalSearchOutput;

    if (searchResults.status !== 'success') {
      log.error(`[Search] Search failed: ${searchResults.error}`);
      return res.status(500).json({
        success: false,
        error: 'Websuche fehlgeschlagen',
        metadata: { timestamp: new Date().toISOString(), searchType: 'normal' },
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    const processingTime = Date.now() - startTime;
    log.debug(`[Search] Normal search completed: ${searchResults.results?.length || 0} results, ${processingTime}ms`);

    const response: NormalSearchResponse = {
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
        includedSummary: !!(searchResults.summary as any)?.generated
      }
    };

    if (searchResults.summary) {
      response.summary = searchResults.summary as any;
    }

    if (searchResults.citations && searchResults.citations.length > 0) {
      response.citations = searchResults.citations;
    }

    if (searchResults.citationSources && searchResults.citationSources.length > 0) {
      response.sources = searchResults.citationSources;
    }

    return res.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[Search] Normal search error (${processingTime}ms):`, error);

    const userError = mapErrorToUserMessage(error as Error);

    return res.status(500).json({
      success: false,
      error: userError,
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
        searchType: 'normal'
      },
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * POST /api/search/deep-research
 * Deep research mode with comprehensive analysis
 */
router.post('/deep-research', async (req: DeepResearchRequest, res: Response<DeepResearchResponse>) => {
  const startTime = Date.now();

  try {
    const { query } = req.body;

    if (!query || typeof query !== 'string') {
      return res.status(400).json({
        status: 'error',
        dossier: null,
        researchQuestions: [],
        searchResults: [],
        sources: [],
        categorizedSources: {},
        grundsatzResults: null,
        citations: [],
        citationSources: [],
        metadata: {
          totalSources: 0,
          externalSources: 0,
          officialSources: 0,
          categories: [],
          questionsCount: 0,
          hasOfficialPosition: false,
          performance: { duration: 0, aiCalls: 0, estimatedTokens: 0 }
        },
        details: 'Suchbegriff ist erforderlich'
      });
    }

    const userId = getUserId(req);
    log.debug(`[Search] Deep research: "${query}" (userId: ${userId})`);

    const { runWebSearch } = await import('../../agents/langgraph/WebSearchGraph/index.js');

    const performanceMetrics = {
      startTime,
      aiCalls: 0,
      estimatedTokens: 0
    };

    const searchInput: WebSearchInput = {
      query: query.trim(),
      mode: 'deep',
      user_id: userId,
      searchOptions: {
        maxResults: 10,
        language: 'de-DE'
      },
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req
    };

    const searchResults = await runWebSearch(searchInput) as DeepSearchOutput;

    if (searchResults.status !== 'success') {
      log.error(`[Search] Deep research failed: ${searchResults.error}`);
      return res.status(500).json({
        status: 'error',
        dossier: null,
        researchQuestions: [],
        searchResults: [],
        sources: [],
        categorizedSources: {},
        grundsatzResults: null,
        citations: [],
        citationSources: [],
        metadata: {
          totalSources: 0,
          externalSources: 0,
          officialSources: 0,
          categories: [],
          questionsCount: 0,
          hasOfficialPosition: false,
          performance: { duration: Date.now() - startTime, aiCalls: 0, estimatedTokens: 0 }
        },
        details: process.env.NODE_ENV === 'development' ? searchResults.error : undefined
      });
    }

    const totalDuration = Date.now() - startTime;
    log.debug(`[Search] Deep research completed: ${totalDuration}ms`);

    const response: DeepResearchResponse = {
      status: 'success',
      dossier: searchResults.dossier,
      researchQuestions: searchResults.researchQuestions || [],
      searchResults: searchResults.searchResults || [],
      sources: searchResults.sources || [],
      categorizedSources: searchResults.categorizedSources || {},
      grundsatzResults: searchResults.grundsatzResults || null,
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
        performance: {
          duration: totalDuration,
          aiCalls: performanceMetrics.aiCalls,
          estimatedTokens: performanceMetrics.estimatedTokens
        }
      }
    };

    return res.json(response);

  } catch (error) {
    const processingTime = Date.now() - startTime;
    log.error(`[Search] Deep research error (${processingTime}ms):`, error);

    return res.status(500).json({
      status: 'error',
      dossier: null,
      researchQuestions: [],
      searchResults: [],
      sources: [],
      categorizedSources: {},
      grundsatzResults: null,
      citations: [],
      citationSources: [],
      metadata: {
        processingTimeMs: processingTime,
        timestamp: new Date().toISOString(),
        searchType: 'deep_research',
        totalSources: 0,
        externalSources: 0,
        officialSources: 0,
        categories: [],
        questionsCount: 0,
        hasOfficialPosition: false,
        performance: { duration: processingTime, aiCalls: 0, estimatedTokens: 0 }
      },
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * POST /api/search/analyze
 * Search analysis endpoint - analyzes provided content using AI
 */
router.post('/analyze', async (req: AnalyzeRequest, res: Response<AnalyzeResponse>) => {
  const { contents } = req.body;

  try {
    if (!contents || !Array.isArray(contents) || contents.length === 0) {
      return res.status(400).json({
        status: 'error',
        error: 'Inhalte für die Analyse sind erforderlich'
      });
    }

    log.debug(`[Search] Analysis request: ${contents.length} items`);

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
        role: 'user',
        content: [{
          type: 'text',
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

    const { mainText, sourceRecommendations, usedSourceTitles } = parseAnalysisResponse(result.content);

    return res.json({
      status: 'success',
      analysis: mainText,
      sourceRecommendations,
      claudeSourceTitles: usedSourceTitles,
      metadata: result.metadata
    });

  } catch (error) {
    log.error('[Search] Analysis error:', error);
    return res.status(500).json({
      status: 'error',
      error: 'Fehler bei der Analyse der Suchergebnisse',
      details: (error as Error).message
    });
  }
});

/**
 * GET /api/search/status
 * Get search service status and health
 */
router.get('/status', async (_req: AuthenticatedRequest, res: Response<StatusResponse>) => {
  try {
    const { searxngService } = await import('../../services/search/index.js');
    const status = await searxngService.getServiceStatus();

    res.json({
      success: true,
      status: 'operational',
      service: 'LangGraph Web Search',
      searxng: status,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[Search] Status check failed:', error);

    res.status(503).json({
      success: false,
      status: 'error',
      service: 'LangGraph Web Search',
      error: 'Service status check failed',
      timestamp: new Date().toISOString(),
      details: process.env.NODE_ENV === 'development' ? (error as Error).message : undefined
    });
  }
});

/**
 * POST /api/search/clear-cache
 * Clear search cache (admin/development only)
 */
router.post('/clear-cache', async (req: AuthenticatedRequest, res: Response<ClearCacheResponse>) => {
  const isAdmin = req.user?.database_access || process.env.NODE_ENV === 'development';

  if (!isAdmin) {
    return res.status(403).json({
      success: false,
      error: 'Zugriff verweigert - Admin-Berechtigung erforderlich',
      timestamp: new Date().toISOString()
    });
  }

  try {
    const { searxngService } = await import('../../services/search/index.js');
    await searxngService.clearCache();

    return res.json({
      success: true,
      message: 'Cache erfolgreich geleert',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    log.error('[Search] Cache clear failed:', error);

    return res.status(500).json({
      success: false,
      error: 'Fehler beim Leeren des Caches',
      timestamp: new Date().toISOString()
    });
  }
});

export default router;
