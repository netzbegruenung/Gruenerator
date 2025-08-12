const { createCache } = require('../utils/lruCache.js');
const { InputValidator, ValidationError } = require('../utils/inputValidation.js');

/**
 * AI-powered search query enhancement agent
 * 
 * Replaces hardcoded German synonym mappings with intelligent AI-driven query expansion.
 * Uses the existing aiWorker infrastructure for cost-effective natural language understanding.
 */
class AISearchAgent {
  constructor() {
    this.defaultTimeout = 15000; // 15 seconds for search enhancement
    
    // Only keep enhancement cache for AI-generated synonyms (these can be reused)
    this.enhancementCache = createCache.searchEnhancement();
    
    // Tool definitions for autonomous search
    this.searchTools = this.defineSearchTools();
  }

  // NOTE: AI worker pool is now accessed via req.app.locals.aiWorkerPool (standard pattern)
  
  /**
   * Define search tools for autonomous database operations
   * @private
   */
  defineSearchTools() {
    return [
      {
        name: "search_database_examples",
        description: "Search database examples using vector similarity. IMPORTANT: Respect the limit parameter exactly - do not request more results than needed!",
        input_schema: {
          type: "object",
          properties: {
            query: { type: "string", description: "Search query text" },
            content_type: { type: "string", description: "Content type filter (instagram, facebook, antrag, etc.)" },
            limit: { type: "number", description: "Maximum results to return", default: 5 },
            threshold: { type: "number", description: "Similarity threshold (0-1)", default: 0.25 }
          },
          required: ["query", "content_type"]
        }
      },
      {
        name: "execute_database_query",
        description: "Execute direct database query using MCP Supabase tools",
        input_schema: {
          type: "object",
          properties: {
            table: { type: "string", description: "Database table name" },
            filters: { type: "object", description: "Query filters" },
            columns: { type: "array", description: "Columns to select", items: { type: "string" } },
            limit: { type: "number", description: "Limit results", default: 10 }
          },
          required: ["table"]
        }
      },
      {
        name: "analyze_and_rank_results",
        description: "Analyze search results and select the best matches",
        input_schema: {
          type: "object",
          properties: {
            results: { type: "array", description: "Search results to analyze" },
            criteria: { type: "string", description: "Selection criteria" },
            target_count: { type: "number", description: "Number of results to select" }
          },
          required: ["results", "criteria", "target_count"]
        }
      }
    ];
  }

  /**
   * Autonomous database search - conducts full search and returns specific element IDs
   * @param {string} naturalLanguageQuery - Natural language search request
   * @param {Object} options - Search options
   * @param {Object} req - Express request object (for AI worker pool access)
   * @returns {Promise<Object>} Search results with specific element IDs and reasoning
   */
  async searchDatabase(naturalLanguageQuery, options = {}, req = null) {
    const {
      contentType = null, // Content type passed from caller
      maxResults = 5,
      includeReasoning = true,
      returnFormat = 'ids', // 'ids' or 'full'
      useCache = true,
      strategy = 'auto' // 'auto', 'vector_only', 'sql_only', 'hybrid'
    } = options;

    if (!naturalLanguageQuery || typeof naturalLanguageQuery !== 'string') {
      return {
        success: false,
        error: 'Invalid query provided',
        elementIds: [],
        reasoning: 'No valid query provided for search'
      };
    }

    try {
      console.log(`[AISearchAgent] Autonomous search request: "${naturalLanguageQuery}"`);



      // Parse search intent
      const searchIntent = this.extractSearchIntent(naturalLanguageQuery, contentType);
      console.log(`[AISearchAgent] Extracted intent:`, {
        query: searchIntent.query,
        contentType: searchIntent.contentType,
        limit: searchIntent.limit
      });

      // Conduct autonomous search with AI tools
      const searchResult = await this.conductAutonomousSearch(
        searchIntent, 
        naturalLanguageQuery, 
        { ...options, maxResults },
        req
      );



      console.log(`[AISearchAgent] Autonomous search completed: ${searchResult.elementIds?.length || 0} results, confidence: ${searchResult.confidence}`);
      return searchResult;

    } catch (error) {
      console.error('[AISearchAgent] Autonomous search error:', error);
      return {
        success: false,
        error: error.message,
        elementIds: [],
        reasoning: `Search failed: ${error.message}`,
        fallbackAvailable: true
      };
    }
  }

  /**
   * Enhance search query with AI-powered semantic expansion
   * @param {string} query - Original search query
   * @param {Object} options - Enhancement options
   * @param {Object} req - Express request object (for AI worker pool access)
   * @returns {Promise<Object>} Enhanced query data
   */
  async enhanceQuery(query, options = {}, req = null) {
    const {
      contentType = 'general',
      limit = 3,
      includeContext = true,
      useCache = true
    } = options;

    if (!query || typeof query !== 'string' || query.trim().length === 0) {
      return this.getFallbackEnhancement(query);
    }

    try {
      console.log(`[AISearchAgent] Enhancing query: "${query}" for type: ${contentType}`);

      // Try cache first
      if (useCache) {
        const cacheKey = this.generateCacheKey(query, contentType);
        const cachedResult = await this.getCachedEnhancement(cacheKey);
        if (cachedResult) {
          console.log('[AISearchAgent] Using cached enhancement');
          return cachedResult;
        }
      }

      // Generate AI-enhanced query using aiWorker  
      if (!req) {
        console.warn('[AISearchAgent] No req object provided, using fallback');
        throw new Error('Request object required for AI worker access');
      }
      
      const enhancementResult = await this.callAIWorker(query, contentType, options, req);

      // Parse and validate the AI response
      const enhancement = this.parseAIResponse(enhancementResult, query);

      // Cache the result
      if (useCache && enhancement.success) {
        const cacheKey = this.generateCacheKey(query, contentType);
        await this.cacheEnhancement(cacheKey, enhancement);
      }

      console.log(`[AISearchAgent] Enhanced "${query}" -> ${enhancement.enhancedQueries?.length || 0} variants`);
      return enhancement;

    } catch (error) {
      console.error('[AISearchAgent] Enhancement error:', error);
      return this.getFallbackEnhancement(query, error.message);
    }
  }

  /**
   * Call the AI worker for query enhancement (using standard codebase pattern)
   * @private
   */
  async callAIWorker(query, contentType, options, req) {
    try {
      // Validate inputs
      const validQuery = InputValidator.validateSearchQuery(query);
      const validContentType = InputValidator.validateContentType(contentType);
      
      // Separate system instructions from user content for proper AI provider compatibility
      const systemPrompt = this.buildEnhancementSystemPrompt();
      const userContent = this.buildEnhancementUserContent(validQuery, validContentType, options);

      console.log(`[AISearchAgent] Calling AI worker for query enhancement`);

      // Use standard codebase pattern (same as claude_social.js and other routes)
      const result = await req.app.locals.aiWorkerPool.processRequest({
        type: 'search_enhancement',
        systemPrompt: systemPrompt,
        messages: [{
          role: 'user',
          content: userContent
        }],
        options: {
          model: 'anthropic.claude-3-haiku-20240307-v1:0', // Use Haiku for cost efficiency
          max_tokens: 1000,
          temperature: 0.3, // Low temperature for consistent, focused results
          provider: 'bedrock' // Use Bedrock for EU compliance
        }
      }, req);

      return result;
      
    } catch (error) {
      if (error instanceof ValidationError) {
        console.error('[AISearchAgent] AI worker input validation failed:', error.message);
        throw error;
      }
      throw error;
    }
  }

  /**
   * Build system prompt for query enhancement (separated for AI provider compatibility)
   * @private
   */
  buildEnhancementSystemPrompt() {
    return `Du bist ein Suchexperte für deutsche politische und kommunale Inhalte. Deine Aufgabe ist es, Suchanfragen intelligent zu erweitern, um bessere semantische Treffer zu finden.

KONTEXT:
- Die Datenbank enthält deutsche politische Inhalte, besonders für Bündnis 90/Die Grünen
- Schwerpunkte: Kommunalpolitik, Umwelt, Klimaschutz, Soziales, Verkehrswende
- Suche erfolgt über Vektorähnlichkeit, daher sind semantisch verwandte Begriffe wichtig

ANWEISUNGEN:
1. Analysiere die Suchintention der ursprünglichen Anfrage
2. Identifiziere verwandte Begriffe und Synonyme im deutschen politischen Kontext
3. Generiere 3-5 erweiterte Suchvarianten, die semantisch verwandt aber unterschiedlich formuliert sind
4. Berücksichtige den Inhaltstyp bei der Erweiterung
5. Fokussiere auf deutsche Begriffe und Konzepte

Antworte ausschließlich im JSON-Format ohne zusätzliche Erklärungen.`;
  }

  /**
   * Build user content for query enhancement (separated for AI provider compatibility)
   * @private
   */
  buildEnhancementUserContent(query, contentType, options) {
    return `AUFGABE: Erweitere die folgende Suchanfrage für bessere Ergebnisse in einer Vektordatenbank.

ORIGINAL SUCHANFRAGE: "${query}"
INHALTSTYP: ${contentType}
ZIELANZAHL: ${options.limit || 3} Beispiele

AUSGABEFORMAT (JSON):
{
  "originalQuery": "${query}",
  "contentType": "${contentType}",
  "enhancedQueries": [
    "Erweiterte Suchanfrage 1",
    "Erweiterte Suchanfrage 2", 
    "Erweiterte Suchanfrage 3"
  ],
  "semanticContext": {
    "mainTopics": ["Hauptthema 1", "Hauptthema 2"],
    "relatedTerms": ["Begriff 1", "Begriff 2", "Begriff 3"],
    "politicalContext": "Kurze Erklärung des politischen Kontexts"
  },
  "confidence": 0.85
}`;
  }

  /**
   * Parse and validate AI response
   * @private
   */
  parseAIResponse(aiResult, originalQuery) {
    try {
      if (!aiResult || !aiResult.success || !aiResult.content) {
        throw new Error('Invalid AI worker response');
      }

      const jsonResponse = JSON.parse(aiResult.content);

      // Validate required fields
      if (!jsonResponse.enhancedQueries || !Array.isArray(jsonResponse.enhancedQueries)) {
        throw new Error('Missing enhancedQueries array');
      }

      // Ensure we have at least the original query
      if (jsonResponse.enhancedQueries.length === 0) {
        jsonResponse.enhancedQueries = [originalQuery];
      }

      // Add original query as first entry if not present
      if (!jsonResponse.enhancedQueries.includes(originalQuery)) {
        jsonResponse.enhancedQueries.unshift(originalQuery);
      }

      return {
        success: true,
        originalQuery: originalQuery,
        enhancedQueries: jsonResponse.enhancedQueries,
        semanticContext: jsonResponse.semanticContext || {},
        confidence: jsonResponse.confidence || 0.8,
        source: 'ai_enhanced',
        metadata: {
          timestamp: new Date().toISOString(),
          aiProvider: aiResult.metadata?.provider || 'bedrock',
          model: aiResult.metadata?.model || 'haiku'
        }
      };

    } catch (error) {
      console.warn('[AISearchAgent] Failed to parse AI response:', error);
      return this.getFallbackEnhancement(originalQuery, error.message);
    }
  }

  /**
   * Get fallback enhancement when AI fails
   * @private
   */
  getFallbackEnhancement(query, errorMessage = null) {
    console.log(`[AISearchAgent] Using fallback enhancement for: "${query}"`);
    
    // Basic German political term expansion as fallback
    const basicExpansions = this.getBasicGermanExpansions(query);
    
    return {
      success: true,
      originalQuery: query || '',
      enhancedQueries: [query, ...basicExpansions].filter(Boolean).slice(0, 3),
      semanticContext: {
        mainTopics: [],
        relatedTerms: basicExpansions,
        politicalContext: 'Fallback expansion'
      },
      confidence: 0.5,
      source: 'fallback_hardcoded',
      metadata: {
        timestamp: new Date().toISOString(),
        error: errorMessage
      }
    };
  }

  /**
   * Basic German term expansions as fallback
   * @private
   */
  getBasicGermanExpansions(query) {
    if (!query) return [];

    const queryLower = query.toLowerCase();
    const expansions = [];

    // Minimal essential mappings - much reduced from original
    const basicMappings = {
      'umwelt': ['klimaschutz', 'nachhaltigkeit'],
      'klima': ['klimaschutz', 'umwelt'],
      'verkehr': ['mobilität', 'verkehrswende'],
      'energie': ['erneuerbar', 'solar'],
      'wohnen': ['miete', 'bauen'],
      'stadt': ['kommune', 'kommunal']
    };

    Object.entries(basicMappings).forEach(([key, values]) => {
      if (queryLower.includes(key)) {
        expansions.push(values[0]); // Only add first expansion to keep focused
      }
    });

    return [...new Set(expansions)]; // Remove duplicates
  }

  /**
   * Generate cache key
   * @private
   */
  generateCacheKey(query, contentType) {
    const queryHash = this.simpleHash(query.toLowerCase().trim());
    return `enhancement:${contentType}:${queryHash}`;
  }

  /**
   * Simple hash function
   * @private
   */
  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash).toString(16);
  }

  /**
   * Get cached enhancement
   * @private
   */
  async getCachedEnhancement(cacheKey) {
    return this.enhancementCache.get(cacheKey);
  }

  /**
   * Cache enhancement result
   * @private
   */
  async cacheEnhancement(cacheKey, enhancement) {
    this.enhancementCache.set(cacheKey, enhancement);
  }

  /**
   * Extract search intent from natural language request
   * @param {string} naturalLanguageQuery - Full natural language request
   * @param {string} passedContentType - Content type passed from caller
   * @returns {Object} Extracted search parameters
   */
  extractSearchIntent(naturalLanguageQuery, passedContentType = null) {
    if (!naturalLanguageQuery) {
      return { query: '', contentType: passedContentType || null, limit: 3 };
    }

    const query = naturalLanguageQuery.toLowerCase();
    let extractedQuery = naturalLanguageQuery;
    let contentType = passedContentType || null; // Use passed content type first, null means search all types
    let limit = 3;

    // Only extract content type hints if not passed from caller
    if (!passedContentType) {
      const contentTypePatterns = {
        'instagram': /instagram|insta/i,
        'facebook': /facebook|fb/i,
        'twitter': /twitter|tweet/i,
        'antrag': /antrag|anträge/i,
        'pressemitteilung': /presse|pressemitteilung/i,
        'rede': /rede|speech/i
      };

      for (const [type, pattern] of Object.entries(contentTypePatterns)) {
        if (pattern.test(query)) {
          contentType = type;
          break;
        }
      }
    }

    // Extract number/limit
    const numberMatch = query.match(/(\d+)\s*(beispiele|examples|stück)/);
    if (numberMatch) {
      limit = parseInt(numberMatch[1], 10);
      limit = Math.min(Math.max(limit, 1), 10); // Clamp between 1 and 10
    }

    // Clean query - remove meta information
    extractedQuery = extractedQuery
      .replace(/ich\s+(möchte|will|brauche|suche)/gi, '')
      .replace(/\d+\s*(beispiele|examples|stück)/gi, '')
      .replace(/(für|about|zum thema|über)/gi, '')
      .replace(/(instagram|facebook|twitter|antrag|anträge|presse)/gi, '')
      .trim();

    // If query became too short, use original
    if (extractedQuery.length < 3) {
      extractedQuery = naturalLanguageQuery;
    }

    return {
      query: extractedQuery,
      contentType,
      limit,
      originalRequest: naturalLanguageQuery
    };
  }

  /**
   * Conduct autonomous search using AI tools and existing services
   * @private
   */
  async conductAutonomousSearch(searchIntent, originalQuery, options, req) {
    try {
      // Build system prompt for autonomous search
      const systemPrompt = this.buildAutonomousSearchPrompt(searchIntent, originalQuery, options);
      
      const workerRequest = {
        type: 'search_enhancement', // Will be enhanced to support tools
        systemPrompt: systemPrompt, // Move system content to separate field for Bedrock compatibility
        messages: [{
          role: 'user',
          content: originalQuery
        }],
        options: {
          model: 'anthropic.claude-3-haiku-20240307-v1:0',
          max_tokens: 2000,
          temperature: 0.2,
          provider: 'bedrock',
          tools: this.searchTools,
          tool_choice: { type: 'auto' }
        }
      };

      console.log(`[AISearchAgent] Calling AI worker for autonomous search`);

      // Use standard codebase pattern for AI worker access
      if (!req) {
        console.warn('[AISearchAgent] No req object provided for autonomous search');
        throw new Error('Request object required for AI worker access');
      }

      const aiResult = await req.app.locals.aiWorkerPool.processRequest(workerRequest, req);

      // Process AI response and tool calls
      return await this.processAutonomousSearchResult(aiResult, searchIntent, options);

    } catch (error) {
      console.error('[AISearchAgent] Autonomous search failed:', error);
      return {
        success: false,
        elementIds: [],
        reasoning: `Autonomous search failed: ${error.message}`,
        confidence: 0.1,
        searchStrategy: 'failed',
        metadata: { timestamp: new Date().toISOString(), error: true }
      };
    }
  }

  /**
   * Build system prompt for autonomous search
   * @private
   */
  buildAutonomousSearchPrompt(searchIntent, originalQuery, options) {
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
   * @private
   */
  async processAutonomousSearchResult(aiResult, searchIntent, options) {
    if (!aiResult || !aiResult.success) {
      throw new Error('Invalid AI worker response for autonomous search');
    }

    // If AI used tools, process the tool calls (likely multiple searches)
    if (aiResult.tool_calls && aiResult.tool_calls.length > 0) {
      const toolResults = await this.executeSearchTools(aiResult.tool_calls);
      
      // Aggregate results from multiple searches
      const aggregatedResults = this.aggregateMultiSearchResults(toolResults, searchIntent.limit);
      
      // Extract element IDs from aggregated results  
      const elementIds = aggregatedResults.map(result => result.id);
      const reasoning = this.buildMultiSearchReasoning(aiResult.content, toolResults, aggregatedResults);
      
      return {
        success: true,
        elementIds: elementIds,
        reasoning: reasoning,
        confidence: this.calculateConfidence(toolResults, searchIntent),
        searchStrategy: 'autonomous_tools',
        toolsUsed: aiResult.tool_calls.map(t => t.name),
        metadata: {
          timestamp: new Date().toISOString(),
          originalQuery: searchIntent.originalRequest,
          toolResults: toolResults.length
        }
      };
    }

    // If no tools were used, return empty result (no fallback)
    console.log('[AISearchAgent] No tools used in autonomous search. Returning empty result.');
    return {
      success: false,
      elementIds: [],
      reasoning: 'No tools used by AI during autonomous search',
      confidence: 0.2,
      searchStrategy: 'no_tools'
    };
  }

  /**
   * Execute search tools called by AI
   * @private
   */
  async executeSearchTools(toolCalls) {
    const results = [];

    for (const toolCall of toolCalls) {
      try {
        let toolResult;

        switch (toolCall.name) {
          case 'search_database_examples':
            toolResult = await this.handleSearchDatabaseExamples(toolCall.input);
            break;
          case 'execute_database_query':
            toolResult = await this.handleExecuteDatabaseQuery(toolCall.input);
            break;
          case 'analyze_and_rank_results':
            toolResult = await this.handleAnalyzeAndRankResults(toolCall.input);
            break;
          default:
            console.warn(`[AISearchAgent] Unknown tool: ${toolCall.name}`);
            continue;
        }

        results.push({
          tool: toolCall.name,
          input: toolCall.input,
          result: toolResult
        });

      } catch (error) {
        console.error(`[AISearchAgent] Tool execution failed for ${toolCall.name}:`, error);
        results.push({
          tool: toolCall.name,
          input: toolCall.input,
          error: error.message
        });
      }
    }

    return results;
  }

  /**
   * Handle search_database_examples tool call
   * @private
   */
  async handleSearchDatabaseExamples(params) {
    const vectorSearchService = require('./vectorSearchService.js').vectorSearchService;
    
    // Enforce reasonable limit per individual search (AI should do multiple searches)
    const enforcedLimit = Math.min(params.limit || 5, 5); // Cap at maximum 5 results per search
    
    // LOG EXACTLY WHAT THE AI IS SEARCHING FOR
    console.log(`[AISearchAgent] 🔍 AI SEARCH PARAMETERS:`, {
      query: params.query,
      contentType: params.content_type,
      limit: enforcedLimit,
      threshold: params.threshold || 0.15 // Lowered for better recall in multi-search
    });
    
    const result = await vectorSearchService.searchDatabaseExamples(
      params.query,
      params.content_type,
      enforcedLimit,
      params.threshold || 0.15 // Lower threshold since we'll aggregate best results
    );



    // Add search metadata to results for aggregation
    const resultsWithMetadata = (result.results || []).map(item => ({
      ...item,
      search_query: params.query, // Track which search found this result
      search_timestamp: Date.now()
    }));

    return {
      success: result.success,
      results: resultsWithMetadata,
      count: resultsWithMetadata.length,
      search_query: params.query // For aggregation tracking
    };
  }

  /**
   * Handle execute_database_query tool call using MCP Supabase
   * @private
   */
  async handleExecuteDatabaseQuery(params) {
    // This would use MCP Supabase tools for direct database access
    // For now, return a placeholder that indicates this needs MCP integration
    console.log('[AISearchAgent] Database query tool called:', params);
    
    return {
      success: true,
      results: [],
      note: 'MCP Supabase integration needed for direct database queries'
    };
  }

  /**
   * Aggregate results from multiple searches, deduplicating and selecting best results
   * @private
   */
  aggregateMultiSearchResults(toolResults, targetLimit) {
    const allResults = [];
    
    // DEBUG: Log the tool results structure
    console.log(`[AISearchAgent] 🔍 DEBUG - Tool Results Structure:`, {
      count: toolResults.length,
      structures: toolResults.map(tr => ({
        success: tr.success,
        hasResults: !!tr.results,
        resultsType: Array.isArray(tr.results) ? 'array' : typeof tr.results,
        resultCount: Array.isArray(tr.results) ? tr.results.length : 'not array',
        keys: Object.keys(tr)
      }))
    });
    
    // Collect all results from all search tool calls
    for (const toolResult of toolResults) {
      if (toolResult.success && toolResult.results && Array.isArray(toolResult.results)) {
        console.log(`[AISearchAgent] ✅ Adding ${toolResult.results.length} results from search`);
        allResults.push(...toolResult.results);
      } else {
        console.log(`[AISearchAgent] ❌ Skipping tool result:`, {
          success: toolResult.success,
          hasResults: !!toolResult.results,
          resultsIsArray: Array.isArray(toolResult.results)
        });
      }
    }
    
    console.log(`[AISearchAgent] 🔄 AGGREGATING MULTI-SEARCH RESULTS:`, {
      totalSearches: toolResults.length,
      totalResultsFound: allResults.length,
      targetLimit: targetLimit
    });
    
    if (allResults.length === 0) {
      return [];
    }
    
    // Remove duplicates (same ID) - keep the one with higher similarity
    const deduplicatedResults = this.deduplicateResults(allResults);
    
    // Sort by similarity score (highest first)
    const sortedResults = deduplicatedResults.sort((a, b) => {
      const scoreA = a.similarity_score || 0;
      const scoreB = b.similarity_score || 0;
      return scoreB - scoreA;
    });
    
    // Take the best results up to target limit
    const selectedResults = sortedResults.slice(0, targetLimit);
    
    console.log(`[AISearchAgent] 📈 MULTI-SEARCH AGGREGATION COMPLETE:`, {
      beforeDedup: allResults.length,
      afterDedup: deduplicatedResults.length, 
      finalSelected: selectedResults.length,
      bestScore: selectedResults[0]?.similarity_score || 'none',
      topResult: selectedResults[0]?.title?.substring(0, 50) || 'none'
    });
    
    return selectedResults;
  }
  
  /**
   * Remove duplicate results, keeping the one with higher similarity score
   * @private
   */
  deduplicateResults(results) {
    const uniqueResults = new Map();
    
    for (const result of results) {
      const id = result.id;
      const existingResult = uniqueResults.get(id);
      
      if (!existingResult || (result.similarity_score || 0) > (existingResult.similarity_score || 0)) {
        uniqueResults.set(id, result);
      }
    }
    
    return Array.from(uniqueResults.values());
  }
  
  /**
   * Build reasoning text for multi-search results
   * @private
   */
  buildMultiSearchReasoning(aiContent, toolResults, finalResults) {
    const searchQueries = toolResults
      .filter(tr => tr.search_query)
      .map(tr => `"${tr.search_query}"`)
      .join(', ');
      
    const totalResults = toolResults.reduce((sum, tr) => sum + (tr.count || 0), 0);
    
    return `Multi-search strategy: Performed ${toolResults.length} targeted searches (${searchQueries}). ` +
           `Found ${totalResults} total results, selected top ${finalResults.length} by similarity score. ` +
           `Best result: "${finalResults[0]?.title?.substring(0, 60)}..." (${finalResults[0]?.similarity_score?.toFixed(3)} similarity). ` +
           `${aiContent}`;
  }

  /**
   * Handle analyze_and_rank_results tool call
   * @private
   */
  async handleAnalyzeAndRankResults(params) {
    const { results, criteria, target_count } = params;
    
    if (!results || !Array.isArray(results) || results.length === 0) {
      return {
        success: false,
        selectedResults: [],
        reasoning: 'No results to analyze'
      };
    }

    // Sort by similarity score and select top results
    const sortedResults = [...results].sort((a, b) => {
      return (b.similarity_score || 0) - (a.similarity_score || 0);
    });

    const selectedResults = sortedResults.slice(0, target_count);
    
    return {
      success: true,
      selectedResults: selectedResults,
      reasoning: `Selected top ${selectedResults.length} results based on similarity scores and ${criteria}`
    };
  }

  /**
   * Calculate confidence score based on search results
   * @private
   */
  calculateConfidence(toolResults, searchIntent) {
    if (toolResults.length === 0) return 0.3;
    
    let totalResults = 0;
    let maxSimilarity = 0;
    
    for (const toolResult of toolResults) {
      if (toolResult.result && toolResult.result.results) {
        totalResults += toolResult.result.results.length;
        
        for (const result of toolResult.result.results) {
          if (result.similarity_score) {
            maxSimilarity = Math.max(maxSimilarity, result.similarity_score);
          }
        }
      }
    }
    
    // Base confidence on results found and quality
    let confidence = 0.5;
    if (totalResults >= searchIntent.limit) confidence += 0.2;
    if (maxSimilarity > 0.7) confidence += 0.2;
    if (toolResults.length > 1) confidence += 0.1; // Multiple tools used
    
    return Math.min(confidence, 0.95);
  }

  // Fallback logic removed by design: no enhanced/legacy/random fallbacks



  /**
   * Get statistics about AI search agent usage
   */
  getStats() {
    const enhancementStats = this.enhancementCache.getStats();

    return {
      enhancementCache: enhancementStats,
      defaultTimeout: this.defaultTimeout,
      toolsAvailable: this.searchTools.length
    };
  }
}

// Export singleton instance
module.exports = new AISearchAgent();