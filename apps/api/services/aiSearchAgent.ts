/**
 * AI-powered search query enhancement agent
 *
 * Replaces hardcoded German synonym mappings with intelligent AI-driven query expansion.
 * Uses the existing aiWorker infrastructure for cost-effective natural language understanding.
 */

import { createLogger } from '../utils/logger.js';
import { createCache } from '../utils/redis/index.js';
import { InputValidator, ValidationError, simpleHash } from '../utils/validation/index.js';

const log = createLogger('AISearchAgent');

// =============================================================================
// Type Definitions
// =============================================================================

interface ToolInputSchema {
  type: 'object';
  properties: Record<
    string,
    {
      type: string;
      description: string;
      default?: unknown;
      items?: { type: string };
    }
  >;
  required: string[];
}

interface SearchTool {
  name: string;
  description: string;
  input_schema: ToolInputSchema;
}

interface SearchDatabaseOptions {
  contentType?: string | null;
  maxResults?: number;
  includeReasoning?: boolean;
  returnFormat?: 'ids' | 'full';
  useCache?: boolean;
  strategy?: 'auto' | 'vector_only' | 'sql_only' | 'hybrid';
}

interface SearchDatabaseResult {
  success: boolean;
  error?: string;
  elementIds: Array<string | number>;
  reasoning: string;
  confidence?: number;
  searchStrategy?: string;
  toolsUsed?: string[];
  metadata?: Record<string, unknown>;
  fallbackAvailable?: boolean;
}

interface EnhanceQueryOptions {
  contentType?: string;
  limit?: number;
  includeContext?: boolean;
  useCache?: boolean;
}

interface SemanticContext {
  mainTopics: string[];
  relatedTerms: string[];
  politicalContext: string;
}

interface EnhancementMetadata {
  timestamp: string;
  aiProvider?: string;
  model?: string;
  error?: string | null;
}

interface EnhancementResult {
  success: boolean;
  originalQuery: string;
  enhancedQueries: string[];
  semanticContext: SemanticContext;
  confidence: number;
  source: 'ai_enhanced' | 'fallback_hardcoded';
  metadata: EnhancementMetadata;
}

interface SearchIntent {
  query: string;
  contentType: string | null;
  limit: number;
  originalRequest?: string;
}

interface AIWorkerResult {
  success: boolean;
  content?: string;
  tool_calls?: ToolCall[];
  metadata?: {
    provider?: string;
    model?: string;
  };
}

interface ToolCall {
  name: string;
  input: Record<string, unknown>;
}

interface ToolExecutionResult {
  tool: string;
  input: Record<string, unknown>;
  result?: SearchToolResult | DatabaseQueryResult | AnalyzeResult;
  error?: string;
  success?: boolean;
  results?: SearchResultItem[];
  count?: number;
  search_query?: string;
}

interface SearchToolResult {
  success: boolean;
  results: SearchResultItem[];
  count: number;
  search_query: string;
}

interface SearchResultItem {
  id: string | number;
  title?: string;
  similarity_score?: number;
  search_query?: string;
  search_timestamp?: number;
  [key: string]: unknown;
}

interface DatabaseQueryResult {
  success: boolean;
  results: unknown[];
  note?: string;
}

interface AnalyzeResult {
  success: boolean;
  selectedResults: SearchResultItem[];
  reasoning: string;
}

interface AnalyzeAndRankParams {
  results: SearchResultItem[];
  criteria: string;
  target_count: number;
}

interface SearchExamplesParams {
  query: string;
  content_type: string;
  limit?: number;
  threshold?: number;
  user_id?: string;
}

interface DatabaseQueryParams {
  table: string;
  filters?: Record<string, unknown>;
  columns?: string[];
  limit?: number;
}

interface CacheInstance {
  get: (key: string) => EnhancementResult | null;
  set: (key: string, value: EnhancementResult) => void;
  getStats: () => Record<string, unknown>;
}

interface AgentStats {
  enhancementCache: Record<string, unknown>;
  defaultTimeout: number;
  toolsAvailable: number;
}

// Express request with app locals (minimal interface for this service)
interface ExpressRequest {
  app: {
    locals: {
      aiWorkerPool: {
        processRequest: (request: AIWorkerRequest, req: ExpressRequest) => Promise<AIWorkerResult>;
      };
    };
  };
  user?: {
    id?: string;
  };
}

interface AIWorkerRequest {
  type: string;
  systemPrompt: string;
  messages: Array<{ role: string; content: string }>;
  options: {
    model: string;
    max_tokens: number;
    temperature: number;
    provider: string;
    tools?: SearchTool[];
    tool_choice?: { type: string };
  };
}

// =============================================================================
// AISearchAgent Class
// =============================================================================

class AISearchAgent {
  private defaultTimeout: number;
  private enhancementCache: CacheInstance;
  private searchTools: SearchTool[];

  constructor() {
    this.defaultTimeout = 15000;
    this.enhancementCache = createCache.searchEnhancement() as unknown as CacheInstance;
    this.searchTools = this.defineSearchTools();
  }

  /**
   * Define search tools for autonomous database operations
   */
  private defineSearchTools(): SearchTool[] {
    return [
      {
        name: 'search_database_examples',
        description:
          'Search database examples using vector similarity. IMPORTANT: Respect the limit parameter exactly - do not request more results than needed!',
        input_schema: {
          type: 'object',
          properties: {
            query: { type: 'string', description: 'Search query text' },
            content_type: {
              type: 'string',
              description: 'Content type filter (instagram, facebook, antrag, etc.)',
            },
            limit: { type: 'number', description: 'Maximum results to return', default: 5 },
            threshold: { type: 'number', description: 'Similarity threshold (0-1)', default: 0.25 },
          },
          required: ['query', 'content_type'],
        },
      },
      {
        name: 'execute_database_query',
        description: 'Execute direct database query using MCP Supabase tools',
        input_schema: {
          type: 'object',
          properties: {
            table: { type: 'string', description: 'Database table name' },
            filters: { type: 'object', description: 'Query filters' },
            columns: { type: 'array', description: 'Columns to select', items: { type: 'string' } },
            limit: { type: 'number', description: 'Limit results', default: 10 },
          },
          required: ['table'],
        },
      },
      {
        name: 'analyze_and_rank_results',
        description: 'Analyze search results and select the best matches',
        input_schema: {
          type: 'object',
          properties: {
            results: { type: 'array', description: 'Search results to analyze' },
            criteria: { type: 'string', description: 'Selection criteria' },
            target_count: { type: 'number', description: 'Number of results to select' },
          },
          required: ['results', 'criteria', 'target_count'],
        },
      },
    ];
  }

  /**
   * Autonomous database search - conducts full search and returns specific element IDs
   */
  async searchDatabase(
    naturalLanguageQuery: string,
    options: SearchDatabaseOptions = {},
    req: ExpressRequest | null = null
  ): Promise<SearchDatabaseResult> {
    const { contentType = null, maxResults = 5 } = options;

    if (!naturalLanguageQuery || typeof naturalLanguageQuery !== 'string') {
      return {
        success: false,
        error: 'Invalid query provided',
        elementIds: [],
        reasoning: 'No valid query provided for search',
      };
    }

    try {
      log.debug(`Autonomous search request: "${naturalLanguageQuery}"`);

      const searchIntent = this.extractSearchIntent(naturalLanguageQuery, contentType);
      log.debug(
        `Extracted intent: query=${searchIntent.query}, contentType=${searchIntent.contentType}, limit=${searchIntent.limit}`
      );

      const searchResult = await this.conductAutonomousSearch(
        searchIntent,
        naturalLanguageQuery,
        { ...options, maxResults },
        req
      );

      log.debug(
        `Autonomous search completed: ${searchResult.elementIds?.length || 0} results, confidence: ${searchResult.confidence}`
      );
      return searchResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Autonomous search error: ${message}`);
      return {
        success: false,
        error: message,
        elementIds: [],
        reasoning: `Search failed: ${message}`,
        fallbackAvailable: true,
      };
    }
  }

  /**
   * Enhance search query with AI-powered semantic expansion
   */
  async enhanceQuery(
    query: string,
    options: EnhanceQueryOptions = {},
    req: ExpressRequest | null = null
  ): Promise<EnhancementResult> {
    const { contentType = 'general', useCache = true } = options;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return this.getFallbackEnhancement(query);
    }

    try {
      log.debug(`Enhancing query: "${query}" for type: ${contentType}`);

      if (useCache) {
        const cacheKey = this.generateCacheKey(query, contentType);
        const cachedResult = this.getCachedEnhancement(cacheKey);
        if (cachedResult) {
          log.debug('Using cached enhancement');
          return cachedResult;
        }
      }

      if (!req) {
        log.warn('No req object provided, using fallback');
        throw new Error('Request object required for AI worker access');
      }

      const enhancementResult = await this.callAIWorker(query, contentType, options, req);
      const enhancement = this.parseAIResponse(enhancementResult, query);

      if (useCache && enhancement.success) {
        const cacheKey = this.generateCacheKey(query, contentType);
        this.cacheEnhancement(cacheKey, enhancement);
      }

      log.debug(`Enhanced "${query}" -> ${enhancement.enhancedQueries?.length || 0} variants`);
      return enhancement;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Enhancement error: ${message}`);
      return this.getFallbackEnhancement(query, message);
    }
  }

  /**
   * Call the AI worker for query enhancement
   */
  private async callAIWorker(
    query: string,
    contentType: string,
    options: EnhanceQueryOptions,
    req: ExpressRequest
  ): Promise<AIWorkerResult> {
    try {
      const validQuery = InputValidator.validateSearchQuery(query);
      const validContentType = InputValidator.validateContentType(contentType);

      const systemPrompt = this.buildEnhancementSystemPrompt();
      const userContent = this.buildEnhancementUserContent(validQuery, validContentType, options);

      log.debug('Calling AI worker for query enhancement');

      const result = await req.app.locals.aiWorkerPool.processRequest(
        {
          type: 'search_enhancement',
          systemPrompt: systemPrompt,
          messages: [
            {
              role: 'user',
              content: userContent,
            },
          ],
          options: {
            model: 'mistral-large-2512',
            max_tokens: 1000,
            temperature: 0.3,
            provider: 'mistral',
          },
        },
        req
      );

      return result;
    } catch (error) {
      if (error instanceof ValidationError) {
        log.error(`AI worker input validation failed: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Build system prompt for query enhancement
   */
  private buildEnhancementSystemPrompt(): string {
    return `Du bist ein Suchexperte für deutsche politische und kommunale Inhalte. Deine Aufgabe ist es, Suchanfragen intelligent zu erweitern, um bessere semantische Treffer zu finden.

KONTEXT:
- Die Datenbank enthält deutsche politische Inhalte, besonders für Bündnis 90/Die Grünen
- Schwerpunkte: Kommunalpolitik, Umwelt, Klimaschutz, Soziales, Verkehrswende
- Suche erfolgt über Vektorähnlichkeit, daher sind semantisch verwandte Begriffe wichtig

ANWEISUNGEN:
1. Analysiere die Suchintention der ursprünglichen Anfrage
2. ENTFERNE Füllwörter und Stopwords: "mehr", "der", "die", "das", "im", "in", "ausdenken", "ich möchte"
3. ENTFERNE Ortsnamen die nicht in der Datenbank sind
4. Identifiziere das KERNTHEMA (z.B. "Radwege" → Kernthema: Fahrräder)
5. Generiere 3-5 KURZE, FOKUSSIERTE Suchbegriffe (1-2 Wörter):
   - Jeder Begriff muss DIREKT und SPEZIFISCH zum Kernthema passen
   - KEINE langen Phrasen, KEINE allgemeinen Politikbegriffe
   - KEINE Verben wie "ausbauen", "planen", "entwickeln"
   - NUR konkrete Substantive die eng verwandt sind

BEISPIELE:
❌ FALSCH: "Radverkehrsinfrastruktur ausbauen Verkehrswende" (zu breit, matched alles)
❌ FALSCH: "kommunale Konzepte entwickeln" (zu allgemein)
✅ RICHTIG: "Radwege" (konkret)
✅ RICHTIG: "Fahrradinfrastruktur" (konkret)
✅ RICHTIG: "Radverkehr" (konkret)

WICHTIG: Antworte NUR mit reinem JSON. KEINE Markdown-Code-Blöcke, KEINE Backticks, KEINE Erklärungen. Nur das reine JSON-Objekt.`;
  }

  /**
   * Build user content for query enhancement
   */
  private buildEnhancementUserContent(
    query: string,
    contentType: string,
    _options: EnhanceQueryOptions
  ): string {
    return `AUFGABE: Extrahiere KURZE, FOKUSSIERTE Suchbegriffe aus der Anfrage.

ORIGINAL SUCHANFRAGE: "${query}"
INHALTSTYP: ${contentType}

SCHRITT 1: Entferne Stopwords ("mehr", "der", "im", "ausdenken")
SCHRITT 2: Identifiziere das KERNTHEMA
SCHRITT 3: Generiere 3-5 KURZE Begriffe (1-2 Wörter), die DIREKT zum Kernthema passen

WICHTIG:
- NUR konkrete Substantive (z.B. "Radwege", "Fahrrad")
- KEINE langen Phrasen (FALSCH: "Radverkehrsinfrastruktur ausbauen Verkehrswende")
- KEINE Verben (FALSCH: "planen", "ausbauen", "entwickeln")
- KEINE allgemeinen Begriffe (FALSCH: "kommunale Konzepte", "Verkehrswende")

Antworte NUR mit diesem JSON (keine Markdown-Blöcke):
{
  "originalQuery": "${query}",
  "contentType": "${contentType}",
  "enhancedQueries": [
    "Kurzer Begriff 1",
    "Kurzer Begriff 2",
    "Kurzer Begriff 3"
  ],
  "semanticContext": {
    "mainTopics": ["Kernthema"],
    "relatedTerms": ["eng verwandter Begriff 1", "eng verwandter Begriff 2"],
    "politicalContext": "Kurze Erklärung"
  },
  "confidence": 0.85
}`;
  }

  /**
   * Parse and validate AI response
   */
  private parseAIResponse(aiResult: AIWorkerResult, originalQuery: string): EnhancementResult {
    try {
      if (!aiResult || !aiResult.success || !aiResult.content) {
        throw new Error('Invalid AI worker response');
      }

      let content = aiResult.content.trim();

      if (content.startsWith('```json')) {
        content = content
          .replace(/^```json\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
      } else if (content.startsWith('```')) {
        content = content
          .replace(/^```\s*/i, '')
          .replace(/\s*```$/, '')
          .trim();
      }

      const jsonResponse = JSON.parse(content) as {
        enhancedQueries?: string[];
        semanticContext?: SemanticContext;
        confidence?: number;
      };

      if (!jsonResponse.enhancedQueries || !Array.isArray(jsonResponse.enhancedQueries)) {
        throw new Error('Missing enhancedQueries array');
      }

      if (jsonResponse.enhancedQueries.length === 0) {
        throw new Error('AI returned empty enhancedQueries array');
      }

      return {
        success: true,
        originalQuery: originalQuery,
        enhancedQueries: jsonResponse.enhancedQueries,
        semanticContext: jsonResponse.semanticContext || {
          mainTopics: [],
          relatedTerms: [],
          politicalContext: '',
        },
        confidence: jsonResponse.confidence || 0.8,
        source: 'ai_enhanced',
        metadata: {
          timestamp: new Date().toISOString(),
          aiProvider: aiResult.metadata?.provider || 'bedrock',
          model: aiResult.metadata?.model || 'haiku',
        },
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.warn(`Failed to parse AI response: ${message}`);
      return this.getFallbackEnhancement(originalQuery, message);
    }
  }

  /**
   * Get fallback enhancement when AI fails
   */
  private getFallbackEnhancement(
    query: string | null | undefined,
    errorMessage: string | null = null
  ): EnhancementResult {
    log.debug(`Using fallback enhancement for: "${query}"`);

    const basicExpansions = this.getBasicGermanExpansions(query || '');

    return {
      success: true,
      originalQuery: query || '',
      enhancedQueries: [query, ...basicExpansions]
        .filter((q): q is string => Boolean(q))
        .slice(0, 3),
      semanticContext: {
        mainTopics: [],
        relatedTerms: basicExpansions,
        politicalContext: 'Fallback expansion',
      },
      confidence: 0.5,
      source: 'fallback_hardcoded',
      metadata: {
        timestamp: new Date().toISOString(),
        error: errorMessage,
      },
    };
  }

  /**
   * Basic German term expansions as fallback
   */
  private getBasicGermanExpansions(query: string): string[] {
    if (!query) return [];

    const queryLower = query.toLowerCase();
    const expansions: string[] = [];

    const basicMappings: Record<string, string[]> = {
      umwelt: ['klimaschutz', 'nachhaltigkeit'],
      klima: ['klimaschutz', 'umwelt'],
      verkehr: ['mobilität', 'verkehrswende'],
      energie: ['erneuerbar', 'solar'],
      wohnen: ['miete', 'bauen'],
      stadt: ['kommune', 'kommunal'],
    };

    Object.entries(basicMappings).forEach(([key, values]) => {
      if (queryLower.includes(key)) {
        expansions.push(values[0]);
      }
    });

    return [...new Set(expansions)];
  }

  /**
   * Generate cache key
   */
  private generateCacheKey(query: string, contentType: string): string {
    const queryHash = simpleHash(query.toLowerCase().trim());
    return `enhancement:${contentType}:${queryHash}`;
  }

  /**
   * Get cached enhancement
   */
  private getCachedEnhancement(cacheKey: string): EnhancementResult | undefined {
    return this.enhancementCache.get(cacheKey) ?? undefined;
  }

  /**
   * Cache enhancement result
   */
  private cacheEnhancement(cacheKey: string, enhancement: EnhancementResult): void {
    this.enhancementCache.set(cacheKey, enhancement);
  }

  /**
   * Extract search intent from natural language request
   */
  extractSearchIntent(
    naturalLanguageQuery: string,
    passedContentType: string | null = null
  ): SearchIntent {
    if (!naturalLanguageQuery) {
      return { query: '', contentType: passedContentType, limit: 3 };
    }

    const query = naturalLanguageQuery.toLowerCase();
    let extractedQuery = naturalLanguageQuery;
    let contentType = passedContentType;
    let limit = 3;

    if (!passedContentType) {
      const contentTypePatterns: Record<string, RegExp> = {
        instagram: /instagram|insta/i,
        facebook: /facebook|fb/i,
        twitter: /twitter|tweet/i,
        antrag: /antrag|anträge/i,
        pressemitteilung: /presse|pressemitteilung/i,
        rede: /rede|speech/i,
      };

      for (const [type, pattern] of Object.entries(contentTypePatterns)) {
        if (pattern.test(query)) {
          contentType = type;
          break;
        }
      }
    }

    const numberMatch = query.match(/(\d+)\s*(beispiele|examples|stück)/);
    if (numberMatch) {
      limit = parseInt(numberMatch[1], 10);
      limit = Math.min(Math.max(limit, 1), 10);
    }

    extractedQuery = extractedQuery
      .replace(/ich\s+(möchte|will|brauche|suche)/gi, '')
      .replace(/\d+\s*(beispiele|examples|stück)/gi, '')
      .replace(/(für|about|zum thema|über)/gi, '')
      .replace(/(instagram|facebook|twitter|antrag|anträge|presse)/gi, '')
      .trim();

    if (extractedQuery.length < 3) {
      extractedQuery = naturalLanguageQuery;
    }

    return {
      query: extractedQuery,
      contentType,
      limit,
      originalRequest: naturalLanguageQuery,
    };
  }

  /**
   * Conduct autonomous search using AI tools and existing services
   */
  private async conductAutonomousSearch(
    searchIntent: SearchIntent,
    originalQuery: string,
    options: SearchDatabaseOptions,
    req: ExpressRequest | null
  ): Promise<SearchDatabaseResult> {
    try {
      const systemPrompt = this.buildAutonomousSearchPrompt(searchIntent, originalQuery);

      const workerRequest: AIWorkerRequest = {
        type: 'search_enhancement',
        systemPrompt: systemPrompt,
        messages: [
          {
            role: 'user',
            content: originalQuery,
          },
        ],
        options: {
          model: 'anthropic.claude-3-haiku-20240307-v1:0',
          max_tokens: 2000,
          temperature: 0.2,
          provider: 'bedrock',
          tools: this.searchTools,
          tool_choice: { type: 'auto' },
        },
      };

      log.debug('Calling AI worker for autonomous search');

      if (!req) {
        log.warn('No req object provided for autonomous search');
        throw new Error('Request object required for AI worker access');
      }

      const aiResult = await req.app.locals.aiWorkerPool.processRequest(workerRequest, req);

      return await this.processAutonomousSearchResult(aiResult, searchIntent);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log.error(`Autonomous search failed: ${message}`);
      return {
        success: false,
        elementIds: [],
        reasoning: `Autonomous search failed: ${message}`,
        confidence: 0.1,
        searchStrategy: 'failed',
        metadata: { timestamp: new Date().toISOString(), error: true },
      };
    }
  }

  /**
   * Build system prompt for autonomous search
   */
  private buildAutonomousSearchPrompt(searchIntent: SearchIntent, originalQuery: string): string {
    return `Du bist ein autonomer Datenbank-Suchagent für deutsche politische Inhalte. Du führst präzise Datenbanksuchen durch.

AUFGABE: Finde EXAKT ${searchIntent.limit} relevante Ergebnisse für diese Anfrage.

SUCHANFRAGE: "${originalQuery}"
INHALTSTYP: ${searchIntent.contentType}
GEWÜNSCHTE ANZAHL: EXAKT ${searchIntent.limit} Ergebnisse (nicht mehr!)

KRITISCH - MULTI-KEYWORD-SUCHSTRATEGIE:
Du musst MEHRERE gezielte Suchen durchführen und die besten Ergebnisse kombinieren:

SCHRITT 1 - KEYWORD-EXTRAKTION:
- Identifiziere 3-5 relevante deutsche politische Suchbegriffe
- Entferne Füllwörter: "mehr", "in der", "ausdenken", "ich möchte"
- Entferne Ortsnamen: "Musterstadt", "Dortmund" (nicht in der Datenbank)
- Extrahiere sowohl spezifische als auch verwandte Begriffe

SCHRITT 2 - MULTI-SEARCH-ANSATZ:
Führe 3-5 separate Suchen durch mit verschiedenen Ansätzen:
1. **Hauptbegriff**: Der spezifischste Term (z.B. "hochwasserschutz")
2. **Verwandte Begriffe**: Synonyme/verwandte Terms (z.B. "überschwemmung", "katastrophenschutz")
3. **Oberkategorie**: Breiterer politischer Bereich (z.B. "umweltpolitik", "klimapolitik")
4. **Themen-Kombination**: Falls mehrere Themen erkannt (z.B. "bienen" UND "artenschutz")
5. **Fallback**: Allgemeinere politische Begriffe falls nötig

BEISPIELE für Multi-Search:
Query: "mehr Artenschutz in musterstadt für die Bienen"
→ Suche 1: "artenschutz" (spezifisch)
→ Suche 2: "bienen" (konkret)
→ Suche 3: "tierschutz" (verwandt)
→ Suche 4: "umweltpolitik" (kategorie)
→ Suche 5: "biodiversität" (fachbegriff)

Query: "klimaschutz in Dortmund"
→ Suche 1: "klimaschutz" (spezifisch)
→ Suche 2: "klimapolitik" (verwandt)
→ Suche 3: "umwelt" (oberkategorie)
→ Suche 4: "nachhaltigkeit" (synonym)
→ Suche 5: "co2" (konkret)

SCHRITT 3 - ERGEBNIS-SELEKTION:
- Sammle ALLE Ergebnisse aus allen Suchen
- Sortiere nach Similarity-Score (höchste zuerst)
- Wähle die besten ${searchIntent.limit} Ergebnisse über ALLE Suchen hinweg
- Entferne Duplikate falls dasselbe Beispiel mehrfach gefunden

VERFÜGBARE TOOLS:
1. search_database_examples - Führe mehrere separate Suchen durch!

WICHTIGE REGELN:
- Mache IMMER mehrere Suchen mit verschiedenen Keywords
- Verwende einzelne, präzise deutsche politische Begriffe
- Sammle Ergebnisse aus ALLEN Suchen bevor du die besten auswählst
- Limit pro Einzelsuche: max 5, dann beste ${searchIntent.limit} gesamt wählen

CONTEXT:
- Datenbank enthält deutsche politische Inhalte für Bündnis 90/Die Grünen
- Schwerpunkte: Kommunalpolitik, Umwelt, Klimaschutz, Soziales, Verkehrswende
- Bevorzuge thematisch passende vor generell politischen Inhalten

Nach der Suche erkläre deine Keyword-Wahl und begründe die Relevanz der Ergebnisse.`;
  }

  /**
   * Process autonomous search result and tool calls
   */
  private async processAutonomousSearchResult(
    aiResult: AIWorkerResult,
    searchIntent: SearchIntent
  ): Promise<SearchDatabaseResult> {
    if (!aiResult || !aiResult.success) {
      throw new Error('Invalid AI worker response for autonomous search');
    }

    if (aiResult.tool_calls && aiResult.tool_calls.length > 0) {
      const toolResults = await this.executeSearchTools(aiResult.tool_calls);
      const aggregatedResults = this.aggregateMultiSearchResults(toolResults, searchIntent.limit);
      const elementIds = aggregatedResults.map((result) => result.id);
      const reasoning = this.buildMultiSearchReasoning(
        aiResult.content || '',
        toolResults,
        aggregatedResults
      );

      return {
        success: true,
        elementIds: elementIds,
        reasoning: reasoning,
        confidence: this.calculateConfidence(toolResults, searchIntent),
        searchStrategy: 'autonomous_tools',
        toolsUsed: aiResult.tool_calls.map((t) => t.name),
        metadata: {
          timestamp: new Date().toISOString(),
          originalQuery: searchIntent.originalRequest,
          toolResults: toolResults.length,
        },
      };
    }

    log.debug('No tools used in autonomous search. Returning empty result.');
    return {
      success: false,
      elementIds: [],
      reasoning: 'No tools used by AI during autonomous search',
      confidence: 0.2,
      searchStrategy: 'no_tools',
    };
  }

  /**
   * Execute search tools called by AI
   */
  private async executeSearchTools(toolCalls: ToolCall[]): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const toolCall of toolCalls) {
      try {
        let toolResult: SearchToolResult | DatabaseQueryResult | AnalyzeResult | undefined;

        switch (toolCall.name) {
          case 'search_database_examples':
            toolResult = await this.handleSearchDatabaseExamples(
              toolCall.input as unknown as SearchExamplesParams
            );
            break;
          case 'execute_database_query':
            toolResult = await this.handleExecuteDatabaseQuery(
              toolCall.input as unknown as DatabaseQueryParams
            );
            break;
          case 'analyze_and_rank_results':
            toolResult = await this.handleAnalyzeAndRankResults(
              toolCall.input as unknown as AnalyzeAndRankParams
            );
            break;
          default:
            log.warn(`Unknown tool: ${toolCall.name}`);
            continue;
        }

        results.push({
          tool: toolCall.name,
          input: toolCall.input,
          result: toolResult,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Tool execution failed for ${toolCall.name}: ${message}`);
        results.push({
          tool: toolCall.name,
          input: toolCall.input,
          error: message,
        });
      }
    }

    return results;
  }

  /**
   * Handle search_database_examples tool call
   */
  private async handleSearchDatabaseExamples(
    params: SearchExamplesParams
  ): Promise<SearchToolResult> {
    const { DocumentSearchService } =
      await import('./document-services/DocumentSearchService/index.js');
    const documentSearchService = new DocumentSearchService();

    const enforcedLimit = Math.min(params.limit || 5, 5);

    log.debug(
      `🔍 AI SEARCH PARAMETERS: query=${params.query}, contentType=${params.content_type}, limit=${enforcedLimit}, threshold=${params.threshold || 0.15}`
    );

    const result = await documentSearchService.search({
      query: params.query,
      userId: params.user_id || 'system',
      options: {
        limit: enforcedLimit,
        threshold: params.threshold || 0.15,
      },
    });

    const resultsWithMetadata = ((result.results || []) as unknown as SearchResultItem[]).map(
      (item) => ({
        ...item,
        search_query: params.query,
        search_timestamp: Date.now(),
      })
    );

    return {
      success: result.success,
      results: resultsWithMetadata,
      count: resultsWithMetadata.length,
      search_query: params.query,
    };
  }

  /**
   * Handle execute_database_query tool call using MCP Supabase
   */
  private async handleExecuteDatabaseQuery(
    params: DatabaseQueryParams
  ): Promise<DatabaseQueryResult> {
    log.debug(`Database query tool called: table=${params.table}`);

    return {
      success: true,
      results: [],
      note: 'MCP Supabase integration needed for direct database queries',
    };
  }

  /**
   * Aggregate results from multiple searches, deduplicating and selecting best results
   */
  private aggregateMultiSearchResults(
    toolResults: ToolExecutionResult[],
    targetLimit: number
  ): SearchResultItem[] {
    const allResults: SearchResultItem[] = [];

    log.debug(`🔍 DEBUG - Tool Results Structure: count=${toolResults.length}`);

    for (const toolResult of toolResults) {
      const result = toolResult.result as SearchToolResult | undefined;
      if (result?.success && result.results && Array.isArray(result.results)) {
        log.debug(`✅ Adding ${result.results.length} results from search`);
        allResults.push(...result.results);
      } else {
        log.debug(
          `❌ Skipping tool result: success=${result?.success}, hasResults=${!!result?.results}`
        );
      }
    }

    log.debug(
      `🔄 AGGREGATING MULTI-SEARCH RESULTS: totalSearches=${toolResults.length}, totalResultsFound=${allResults.length}, targetLimit=${targetLimit}`
    );

    if (allResults.length === 0) {
      return [];
    }

    const deduplicatedResults = this.deduplicateResults(allResults);

    const sortedResults = deduplicatedResults.sort((a, b) => {
      const scoreA = a.similarity_score || 0;
      const scoreB = b.similarity_score || 0;
      return scoreB - scoreA;
    });

    const selectedResults = sortedResults.slice(0, targetLimit);

    log.debug(
      `📈 MULTI-SEARCH AGGREGATION COMPLETE: beforeDedup=${allResults.length}, afterDedup=${deduplicatedResults.length}, finalSelected=${selectedResults.length}`
    );

    return selectedResults;
  }

  /**
   * Remove duplicate results, keeping the one with higher similarity score
   */
  private deduplicateResults(results: SearchResultItem[]): SearchResultItem[] {
    const uniqueResults = new Map<string | number, SearchResultItem>();

    for (const result of results) {
      const id = result.id;
      const existingResult = uniqueResults.get(id);

      if (
        !existingResult ||
        (result.similarity_score || 0) > (existingResult.similarity_score || 0)
      ) {
        uniqueResults.set(id, result);
      }
    }

    return Array.from(uniqueResults.values());
  }

  /**
   * Build reasoning text for multi-search results
   */
  private buildMultiSearchReasoning(
    aiContent: string,
    toolResults: ToolExecutionResult[],
    finalResults: SearchResultItem[]
  ): string {
    const searchQueries = toolResults
      .filter((tr) => (tr.result as SearchToolResult)?.search_query)
      .map((tr) => `"${(tr.result as SearchToolResult).search_query}"`)
      .join(', ');

    const totalResults = toolResults.reduce(
      (sum, tr) => sum + ((tr.result as SearchToolResult)?.count || 0),
      0
    );

    const bestTitle = finalResults[0]?.title?.substring(0, 60) || 'N/A';
    const bestScore = finalResults[0]?.similarity_score?.toFixed(3) || 'N/A';

    return (
      `Multi-search strategy: Performed ${toolResults.length} targeted searches (${searchQueries}). ` +
      `Found ${totalResults} total results, selected top ${finalResults.length} by similarity score. ` +
      `Best result: "${bestTitle}..." (${bestScore} similarity). ` +
      `${aiContent}`
    );
  }

  /**
   * Handle analyze_and_rank_results tool call
   */
  private async handleAnalyzeAndRankResults(params: AnalyzeAndRankParams): Promise<AnalyzeResult> {
    const { results, criteria, target_count } = params;

    if (!results || !Array.isArray(results) || results.length === 0) {
      return {
        success: false,
        selectedResults: [],
        reasoning: 'No results to analyze',
      };
    }

    const sortedResults = [...results].sort((a, b) => {
      return (b.similarity_score || 0) - (a.similarity_score || 0);
    });

    const selectedResults = sortedResults.slice(0, target_count);

    return {
      success: true,
      selectedResults: selectedResults,
      reasoning: `Selected top ${selectedResults.length} results based on similarity scores and ${criteria}`,
    };
  }

  /**
   * Calculate confidence score based on search results
   */
  private calculateConfidence(
    toolResults: ToolExecutionResult[],
    searchIntent: SearchIntent
  ): number {
    if (toolResults.length === 0) return 0.3;

    let totalResults = 0;
    let maxSimilarity = 0;

    for (const toolResult of toolResults) {
      const result = toolResult.result as SearchToolResult | undefined;
      if (result?.results) {
        totalResults += result.results.length;

        for (const item of result.results) {
          if (item.similarity_score) {
            maxSimilarity = Math.max(maxSimilarity, item.similarity_score);
          }
        }
      }
    }

    let confidence = 0.5;
    if (totalResults >= searchIntent.limit) confidence += 0.2;
    if (maxSimilarity > 0.7) confidence += 0.2;
    if (toolResults.length > 1) confidence += 0.1;

    return Math.min(confidence, 0.95);
  }

  /**
   * Get statistics about AI search agent usage
   */
  getStats(): AgentStats {
    const enhancementStats = this.enhancementCache.getStats();

    return {
      enhancementCache: enhancementStats,
      defaultTimeout: this.defaultTimeout,
      toolsAvailable: this.searchTools.length,
    };
  }
}

// Export singleton instance
const instance = new AISearchAgent();
export default instance;

// Export types for consumers
export type {
  SearchDatabaseOptions,
  SearchDatabaseResult,
  EnhanceQueryOptions,
  EnhancementResult,
  SearchIntent,
  AgentStats,
};
