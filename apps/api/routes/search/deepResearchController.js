import express from 'express';
const router = express.Router();
import { MistralWebSearchService } from '../../services/mistral/index.js';
import { MARKDOWN_FORMATTING_INSTRUCTIONS } from '../../utils/promptUtils.js';

const mistralWebSearchService = new MistralWebSearchService();
import { DocumentSearchService } from '../../services/document-services/DocumentSearchService.js';
import { createLogger } from '../../utils/logger.js';
const log = createLogger('deepResearch');


const GENERATE_RESEARCH_QUESTIONS_TOOL = "generate_research_questions";
const WEB_SEARCH_TOOL = "web_search";
const SEARCH_GRUNDSATZ_DOCUMENTS_TOOL = "search_grundsatz_documents";

/**
 * Determine intelligent search options based on question content and category
 * Following Mistral web search best practices for optimal results
 */
function getIntelligentSearchOptions(question, category) {
  // Base options following Mistral web search best practices
  const baseOptions = {
    search_depth: 'advanced',        // Always use advanced for better relevance
    max_results: 10,                 // 10 for better relevance vs default 5
    include_answer: true,            // Include LLM-generated answer
    chunks_per_source: 3,            // Maximum chunks per source with advanced
    include_raw_content: true,       // Full content extraction for better processing
    auto_parameters: true            // Maintain compatibility with search options
  };

  const questionLower = question.toLowerCase();
  const categoryLower = category.toLowerCase();
  
  // Detect German regional searches and add relevant domain preferences
  const isGermanRegionalSearch = (
    questionLower.includes('rhein-sieg') ||
    questionLower.includes('deutschland') ||
    questionLower.includes('nrw') ||
    questionLower.includes('nordrhein-westfalen') ||
    questionLower.includes('bonn') ||
    questionLower.includes('köln') ||
    questionLower.includes('landkreis') ||
    questionLower.includes('germany') ||
    questionLower.includes('german')
  );
  
  if (isGermanRegionalSearch) {
    // Use country targeting + focused German domains (following best practices)
    baseOptions.country = 'germany';
    baseOptions.include_domains = [
      '*.de',                        // All German domains
      'rhein-sieg-kreis.de',
      'nrw.de', 
      'verkehr.nrw',
      'ksta.de',
      'general-anzeiger-bonn.de',
      'spd-rhein-sieg.de',
      'cdu-fraktion-rhein-sieg.de',
      'gruene-fraktion-rhein-sieg.de',
      'fdp-rhein-sieg.de',
      'ihk-bonn.de',
      'bundesregierung.de',
      'bundestag.de'
    ];
    
    // Exclude irrelevant international domains
    baseOptions.exclude_domains = [
      '*.com',
      '*.co.uk', 
      '*.fr',
      '*.it',
      '*.es',
      'bbc.com',
      'cnn.com',
      'reuters.com',
      'bloomberg.com',
      'forbes.com',
      'techcrunch.com',
      'govtech.com',     // Specifically exclude sources from example
      'chicagotribune.com',
      'democratandchronicle.com',
      'houstonchronicle.com'
    ];
    
    log.debug(`[deep-research] Using German regional targeting for: "${question}"`);
  }

  // News search for current developments, recent events, or status questions
  if (
    categoryLower.includes('aktuelle') || 
    categoryLower.includes('entwicklung') ||
    categoryLower.includes('hintergrund') ||
    questionLower.includes('aktuelle') ||
    questionLower.includes('derzeit') ||
    questionLower.includes('gegenwärtig') ||
    questionLower.includes('zurzeit') ||
    questionLower.includes('momentan') ||
    questionLower.includes('jetzt') ||
    questionLower.includes('heute') ||
    questionLower.includes('2024') ||
    questionLower.includes('2025') ||
    questionLower.includes('situation') ||
    questionLower.includes('stand') ||
    questionLower.includes('status') ||
    questionLower.includes('wie ist') ||
    questionLower.includes('welche.*wurden.*umgesetzt') ||
    questionLower.includes('welche.*sind.*in planung') ||
    questionLower.includes('maßnahmen') ||
    questionLower.includes('projekte')
  ) {
    log.debug(`[deep-research] Using NEWS search for current developments: "${question}"`);
    return {
      ...baseOptions,
      topic: 'news',
      days: 365 // Last year for current developments (using days instead of timeRange)
    };
  }

  // Recent time filter for planning/future questions
  if (
    categoryLower.includes('zukunft') ||
    categoryLower.includes('planung') ||
    questionLower.includes('zukunft') ||
    questionLower.includes('künftig') ||
    questionLower.includes('geplant') ||
    questionLower.includes('vorhaben') ||
    questionLower.includes('plan')
  ) {
    log.debug(`[deep-research] Using RECENT search for future/planning: "${question}"`);
    return {
      ...baseOptions,
      time_range: 'month' // Last month for recent planning
    };
  }

  // General search for background, analysis, alternatives
  log.debug(`[deep-research] Using GENERAL search for: "${question}"`);
  return baseOptions;
}

router.post('/', async (req, res) => {
  const { query } = req.body;
  
  if (!query || typeof query !== 'string') {
    return res.status(400).json({
      status: 'error',
      message: 'Suchbegriff ist erforderlich'
    });
  }

  const tools = [
    {
      name: SEARCH_GRUNDSATZ_DOCUMENTS_TOOL,
      description: "Sucht in den offiziellen Grundsatzprogrammen von Bündnis 90/Die Grünen nach der offiziellen Parteiposition zu einem Thema.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Suchbegriff für die Grundsatzprogramme (z.B. 'Klimaschutz', 'Bildung', 'Energie')"
          }
        },
        required: ["query"]
      }
    },
    {
      name: GENERATE_RESEARCH_QUESTIONS_TOOL,
      description: "Generiert 4-5 strategische Forschungsfragen für Websuche, OHNE Grüne Position (da diese bereits durch Grundsatz-Suche abgedeckt ist).",
      input_schema: {
        type: "object",
        properties: {
          original_query: {
            type: "string",
            description: "Die ursprüngliche Suchanfrage des Nutzers"
          },
          research_questions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                question: {
                  type: "string",
                  description: "Eine spezifische Forschungsfrage"
                },
                category: {
                  type: "string",
                  description: "Kategorie der Frage (z.B. 'Hintergrund', 'Aktuelle Entwicklungen', 'Auswirkungen', 'Alternative Perspektiven', 'Zukunftsausblick') - KEINE 'Grüne Position'"
                }
              },
              required: ["question", "category"]
            },
            minItems: 4,
            maxItems: 5,
            description: "Array von 4-5 strategischen Forschungsfragen (OHNE Grüne Position)"
          }
        },
        required: ["original_query", "research_questions"]
      }
    },
    {
      name: WEB_SEARCH_TOOL,
      description: "Führt eine Websuche mit Mistral Web Search durch und liefert detaillierte Ergebnisse zurück.",
      input_schema: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "Die Suchanfrage für Mistral Web Search"
          }
        },
        required: ["query"]
      }
    }
  ];

  try {
    const startTime = Date.now();
    log.debug('[deep-research] Starting deep research for query:', query);
    
    // Track token usage and performance
    const performanceMetrics = {
      startTime,
      aiCalls: 0,
      estimatedTokens: 0,
      dataReductionPercent: 0
    };

    // Step 1: Search Grundsatz documents first for official Green Party position
    const grundsatzSystemPrompt = `Du bist ein Experte für die Grundsatzprogramme von Bündnis 90/Die Grünen. Deine Aufgabe ist es, zuerst die offizielle Position der Grünen zu einem Thema zu finden.

ERSTE AKTION: Verwende SOFORT das search_grundsatz_documents Tool, um die offizielle Position der Grünen zu finden.

Verfügbare Dokumente:
- Grundsatzprogramm 2020 (136 Seiten)
- EU-Wahlprogramm 2024 (114 Seiten) 
- Regierungsprogramm 2025 (160 Seiten)

Verwende spezifische Suchbegriffe, die zum Thema passen.`;

    const grundsatzPrompt = `Finde die offizielle Position von Bündnis 90/Die Grünen zum Thema: "${query}"

Verwende das search_grundsatz_documents Tool, um in den Grundsatzprogrammen zu suchen.`;

    let result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: grundsatzSystemPrompt,
      messages: [{ role: "user", content: grundsatzPrompt }],
      options: { tools }
    });
    
    performanceMetrics.aiCalls++;
    performanceMetrics.estimatedTokens += grundsatzSystemPrompt.length + grundsatzPrompt.length + 500;

    if (!result.success) {
      throw new Error(result.error);
    }

    log.debug('[deep-research] Grundsatz search response:', JSON.stringify(result, null, 2));

    // Step 1: Handle Grundsatz search tool call
    let grundsatzResults = null;
    if (result.stop_reason === 'tool_use' && result.raw_content_blocks) {
      const grundsatzToolUse = result.raw_content_blocks.find(block => 
        block.type === 'tool_use' && block.name === SEARCH_GRUNDSATZ_DOCUMENTS_TOOL
      );
      
      if (grundsatzToolUse && grundsatzToolUse.input) {
        log.debug('[deep-research] Executing Grundsatz search:', grundsatzToolUse.input.query);
        grundsatzResults = await executeGrundsatzSearch(grundsatzToolUse.input.query);
      }
    }

    // Step 2: Generate research questions (excluding Green Party position)
    const researchSystemPrompt = `Du bist ein Recherche-Experte. Generiere 4-5 strategische Forschungsfragen für eine umfassende Webrecherche.

WICHTIG: Generiere KEINE Frage zur "Grünen Position" oder "Position von Bündnis 90/Die Grünen", da diese bereits durch eine separate Grundsatz-Suche abgedeckt ist.

Die Fragen sollten diese Aspekte abdecken:
1. Hintergrund/Kontext: Was ist der grundlegende Sachverhalt?
2. Aktuelle Entwicklungen: Was passiert gerade zu diesem Thema?
3. Auswirkungen: Welche gesellschaftlichen, ökologischen oder politischen Auswirkungen gibt es?
4. Alternative Perspektiven: Welche anderen Standpunkte gibt es?
5. Zukunftsausblick: Wie könnte sich das Thema entwickeln?

Verwende das generate_research_questions Tool.`;

    const researchPrompt = `Erstelle 4-5 strategische Forschungsfragen für das Thema: "${query}"

WICHTIG: Erstelle KEINE Frage zur Grünen Position, da diese bereits separat recherchiert wurde. Fokussiere dich auf externe Quellen und verschiedene Perspektiven.`;

    result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: researchSystemPrompt,
      messages: [{ role: "user", content: researchPrompt }],
      options: { tools }
    });
    
    performanceMetrics.aiCalls++;
    performanceMetrics.estimatedTokens += researchSystemPrompt.length + researchPrompt.length + 300;

    if (!result.success) {
      throw new Error(result.error);
    }

    // Extract research questions
    let researchQuestions = [];
    if (result.stop_reason === 'tool_use' && result.raw_content_blocks) {
      const toolUse = result.raw_content_blocks.find(block => 
        block.type === 'tool_use' && block.name === GENERATE_RESEARCH_QUESTIONS_TOOL
      );
      
      if (toolUse && toolUse.input && toolUse.input.research_questions) {
        researchQuestions = toolUse.input.research_questions;
        log.debug('[deep-research] Generated research questions:', researchQuestions);
      }
    }

    if (researchQuestions.length === 0) {
      // Fallback: generate default questions (without Green Party position)
      researchQuestions = [
        { question: `${query} - Hintergrund und Kontext`, category: 'Hintergrund' },
        { question: `${query} - aktuelle Entwicklungen`, category: 'Aktuelle Entwicklungen' },
        { question: `${query} - gesellschaftliche Auswirkungen`, category: 'Auswirkungen' },
        { question: `${query} - alternative Perspektiven`, category: 'Alternative Perspektiven' }
      ];
      log.debug('[deep-research] Using fallback questions:', researchQuestions);
    }

    // Step 2: Execute intelligent searches for each question
    log.debug('[deep-research] Executing intelligent searches for', researchQuestions.length, 'questions');
    const searchPromises = researchQuestions.map(async (rq, index) => {
      try {
        log.debug(`[deep-research] Searching for question ${index + 1}:`, rq.question);
        
        // Determine search parameters based on question category and content
        const searchOptions = getIntelligentSearchOptions(rq.question, rq.category);
        
        // Optimize search query for better relevance
        const optimizedQueries = optimizeSearchQuery(rq.question);
        
        // Handle both single query and array of sub-queries
        const queriesToExecute = Array.isArray(optimizedQueries) ? optimizedQueries : [optimizedQueries];
        
        // Execute all queries (sub-queries) for this research question
        const subSearchPromises = queriesToExecute.map(async (query, subIndex) => {
          try {
            log.debug(`[deep-research] Executing sub-query ${subIndex + 1}/${queriesToExecute.length}: "${query}"`);

            const agentType = searchOptions.topic === 'news' ? 'news' : 'withSources';
            const searchResults = await mistralWebSearchService.performWebSearch(query, agentType);

            const formattedResults = searchResults.sources.map(source => ({
              title: source.title,
              url: source.url,
              content: source.snippet,
              score: source.relevance
            }));

            return {
              query,
              results: formattedResults,
              answer: searchResults.textContent || null
            };
          } catch (error) {
            log.error(`[deep-research] Error in sub-query ${subIndex + 1}:`, error);
            return {
              query,
              results: [],
              answer: null,
              error: error.message
            };
          }
        });
        
        const subSearchResults = await Promise.all(subSearchPromises);
        
        // Combine results from all sub-queries
        const combinedResults = [];
        const combinedAnswers = [];
        
        subSearchResults.forEach(subResult => {
          if (subResult.results) combinedResults.push(...subResult.results);
          if (subResult.answer) combinedAnswers.push(subResult.answer);
        });
        
        return {
          question: rq.question,
          category: rq.category,
          results: combinedResults,
          answer: combinedAnswers.length > 0 ? combinedAnswers.join(' ') : null,
          subQueries: queriesToExecute,
          subSearchCount: queriesToExecute.length
        };
      } catch (error) {
        log.error(`[deep-research] Error searching for question ${index + 1}:`, error);
        return {
          question: rq.question,
          category: rq.category,
          results: [],
          answer: null,
          error: error.message
        };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    log.debug('[deep-research] All searches completed');

    // Step 3: Deduplicate sources across all searches
    const allSources = [];
    const sourceMap = new Map(); // URL -> source object
    
    searchResults.forEach(result => {
      result.results.forEach(source => {
        if (!sourceMap.has(source.url)) {
          sourceMap.set(source.url, {
            ...source,
            categories: [result.category],
            questions: [result.question],
            // Include content snippets from Mistral Web Search
            content_snippets: source.content || null,
            raw_content: source.raw_content || null
          });
          allSources.push(sourceMap.get(source.url));
        } else {
          // Add category and question to existing source
          const existingSource = sourceMap.get(source.url);
          if (!existingSource.categories.includes(result.category)) {
            existingSource.categories.push(result.category);
          }
          if (!existingSource.questions.includes(result.question)) {
            existingSource.questions.push(result.question);
          }
          // Merge content if available and different
          if (source.content && source.content !== existingSource.content_snippets) {
            existingSource.content_snippets = existingSource.content_snippets 
              ? `${existingSource.content_snippets}\n\n${source.content}` 
              : source.content;
          }
        }
      });
    });

    log.debug('[deep-research] Deduplicated to', allSources.length, 'unique sources');

    // Step 4: Filter data and generate comprehensive dossier using Claude
    const filteredData = filterDataForAI(searchResults, allSources, grundsatzResults);
    
    // Track data reduction efficiency
    const originalDataSize = JSON.stringify({ searchResults, allSources, grundsatzResults }).length;
    const filteredDataSize = JSON.stringify(filteredData).length;
    performanceMetrics.dataReductionPercent = Math.round((1 - filteredDataSize/originalDataSize) * 100);

    const dossierSystemPrompt = `Du bist ein Experte für politische Recherche und erstellst faktische, tiefgreifende Dossiers basierend auf verfügbaren Daten.

WICHTIG: 
- BEANTWORTE DIE NUTZERFRAGE DIREKT: Fokussiere dich primär darauf, die konkrete Frage des Nutzers zu beantworten
- Verwende FAKTEN aus den Quellen, keine Spekulationen
- Vermeide oberflächliche Stichpunkt-Listen 
- Schreibe in zusammenhängenden, analytischen Absätzen
- Zitiere konkrete Daten, Zahlen und Aussagen aus den Quellen
- Keine Fantasie oder Vermutungen - nur das, was die Quellen hergeben

${MARKDOWN_FORMATTING_INSTRUCTIONS}

Struktur des Dossiers:
1. **Executive Summary** - DIREKTE Beantwortung der Nutzerfrage basierend auf verfügbaren Erkenntnissen
2. **Position von Bündnis 90/Die Grünen** - Konkrete Aussagen aus Grundsatzprogrammen zur Frage
3. **Faktenlage nach Themenbereichen** - Detaillierte Analyse der verfügbaren Informationen zur Beantwortung der Frage
4. **Quellenbasierte Erkenntnisse** - Tiefere Analyse konkreter Daten und Aussagen die zur Antwort beitragen

Erstelle eine faktische, tiefgreifende Analyse die die Nutzerfrage beantwortet. Verwende zusammenhängende Absätze statt Aufzählungen.`;

    const dossierPrompt = `Erstelle ein faktisches Recherche-Dossier zur FRAGE: "${query}"

WICHTIGE ANWEISUNG: Die Nutzerfrage lautet "${query}" - BEANTWORTE DIESE FRAGE DIREKT mit den verfügbaren Daten!

## Verfügbare Forschungsergebnisse:
${JSON.stringify(filteredData.searchResults, null, 2)}

## Verfügbare Quellen mit Inhalten:
${JSON.stringify(filteredData.sources, null, 2)}

## Verfügbare Grundsatz-Position:
${JSON.stringify(filteredData.grundsatz, null, 2)}

ANWEISUNG: 
- BEANTWORTE DIE KONKRETE FRAGE: "${query}" - das ist das Hauptziel!
- Analysiere diese Daten gründlich und faktisch um die Frage zu beantworten
- Schreibe in zusammenhängenden Absätzen, nicht in Listen
- Zitiere konkrete Aussagen und Daten aus den Quellen die zur Antwort beitragen
- Entwickle tiefere Erkenntnisse aus den verfügbaren Informationen zur Beantwortung der Frage
- Verzichte auf Spekulationen oder allgemeine Aussagen ohne Quellenbeleg
- Fokussiere auf das, was die Quellen zur Beantwortung der Frage tatsächlich aussagen`;

    result = await req.app.locals.aiWorkerPool.processRequest({
      type: 'text_adjustment',
      systemPrompt: dossierSystemPrompt,
      messages: [{ role: "user", content: dossierPrompt }],
      options: {
        max_tokens: 6000,
        temperature: 0.7
      }
    });
    
    performanceMetrics.aiCalls++;
    performanceMetrics.estimatedTokens += dossierSystemPrompt.length + dossierPrompt.length + 6000;

    if (!result.success) {
      throw new Error(result.error);
    }

    let dossier = result.content;

    // Step 5: Categorize sources by theme and include Grundsatz results (moved before methodology)
    const categorizedSources = {};
    
    // Add Grundsatz results as official documents if available
    if (grundsatzResults && grundsatzResults.success && grundsatzResults.results.length > 0) {
      categorizedSources['Offizielle Dokumente (Bündnis 90/Die Grünen)'] = grundsatzResults.results.map(result => ({
        title: result.title,
        url: `#grundsatz-${result.document_id}`, // Internal reference
        content: result.content,
        source_type: 'official_document',
        document_id: result.document_id,
        filename: result.filename,
        similarity_score: result.similarity_score,
        categories: ['Offizielle Dokumente (Bündnis 90/Die Grünen)']
      }));
    }
    
    // Add external sources by category
    allSources.forEach(source => {
      source.categories.forEach(category => {
        if (!categorizedSources[category]) {
          categorizedSources[category] = [];
        }
        categorizedSources[category].push({
          ...source,
          source_type: 'external',
          content_snippets: source.content_snippets,
          raw_content: source.raw_content
        });
      });
    });

    // Add methodology section (client-side generated to save tokens)
    const methodologySection = `

---

## Methodology

Diese Deep Research wurde mit folgender Methodik durchgeführt:

1. **Grundsatz-Recherche**: Suche in offiziellen Grundsatzprogrammen von Bündnis 90/Die Grünen (${grundsatzResults?.results?.length || 0} Dokumente gefunden)
2. **Strategische Fragengenerierung**: ${researchQuestions.length} Forschungsfragen zu verschiedenen Aspekten des Themas
3. **Optimierte Webrecherche**: Mistral Web Search mit intelligenter Quellenauswahl und regionaler Filterung (${allSources.length} Quellen analysiert)
4. **Query-Optimierung**: Automatische Anpassung für deutsche Suchbegriffe und <400 Zeichen Limit
5. **KI-Synthese**: Professionelle Analyse und Strukturierung durch Claude AI

**Datenquellen:**
- Offizielle Grundsatzprogramme: ${grundsatzResults?.results?.length || 0} Treffer
- Externe Webquellen: ${allSources.length} Quellen
- Kategorien: ${Object.keys(categorizedSources).length}
- Forschungsfragen: ${researchQuestions.length}

**Qualitätssicherung:** Mistral Web Search mit intelligenter Quellenauswahl und regionaler Filterung für maximale Relevanz.`;

    dossier += methodologySection;

    // Complete performance metrics
    performanceMetrics.endTime = Date.now();
    performanceMetrics.totalDuration = performanceMetrics.endTime - performanceMetrics.startTime;
    performanceMetrics.estimatedTokenSavings = Math.round(performanceMetrics.estimatedTokens * (performanceMetrics.dataReductionPercent / 100));
    
    log.debug('[deep-research] Generated dossier, responding with results');
    log.debug('[deep-research] Performance metrics:', {
      duration: `${performanceMetrics.totalDuration}ms`,
      aiCalls: performanceMetrics.aiCalls,
      estimatedTokens: performanceMetrics.estimatedTokens,
      dataReduction: `${performanceMetrics.dataReductionPercent}%`,
      estimatedTokenSavings: performanceMetrics.estimatedTokenSavings
    });

    res.json({
      status: 'success',
      dossier,
      researchQuestions,
      searchResults,
      sources: allSources,
      categorizedSources,
      grundsatzResults: grundsatzResults || null,
      metadata: {
        totalSources: allSources.length + (grundsatzResults?.results?.length || 0),
        externalSources: allSources.length,
        officialSources: grundsatzResults?.results?.length || 0,
        categories: Object.keys(categorizedSources),
        questionsCount: researchQuestions.length,
        hasOfficialPosition: !!(grundsatzResults && grundsatzResults.success && grundsatzResults.results.length > 0),
        // Performance metrics for monitoring
        performance: {
          duration: performanceMetrics.totalDuration,
          aiCalls: performanceMetrics.aiCalls,
          estimatedTokens: performanceMetrics.estimatedTokens,
          dataReductionPercent: performanceMetrics.dataReductionPercent,
          estimatedTokenSavings: performanceMetrics.estimatedTokenSavings
        }
      }
    });

  } catch (error) {
    log.error('[deep-research] Error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Fehler bei der Deep Research',
      details: error.message
    });
  }
});

/**
 * Optimize search query for better Mistral web search results following best practices
 * - Keep queries under 400 characters
 * - Add German synonyms and regional terms
 * - Remove unnecessary words
 */
function optimizeSearchQuery(query) {
  log.debug(`[deep-research] Optimizing query: "${query}"`);
  
  // If query is already short enough, apply basic optimization
  if (query.length <= 400) {
    return applyGermanOptimization(query);
  }
  
  // Break down complex queries into focused sub-queries
  const subQueries = breakDownComplexQuery(query);
  log.debug(`[deep-research] Broke down query into ${subQueries.length} sub-queries`);
  
  return subQueries.map(subQuery => applyGermanOptimization(subQuery));
}

/**
 * Apply German language and regional optimization to search query
 */
function applyGermanOptimization(query) {
  let optimizedQuery = query.trim();
  
  // German synonym expansion for key terms
  const synonymMap = {
    'verkehrswende': 'verkehrswende mobilität nachhaltiger verkehr',
    'nahverkehr': 'nahverkehr öpnv öffentlicher verkehr',
    'radverkehr': 'radverkehr fahrrad radwege',
    'klimaschutz': 'klimaschutz umweltschutz nachhaltigkeit',
    'energie': 'energie erneuerbare energien energiewende',
    'wohnen': 'wohnen wohnungsbau mietrecht',
    'bildung': 'bildung schule universität ausbildung',
    'gesundheit': 'gesundheit medizin gesundheitswesen',
    'wirtschaft': 'wirtschaft ökonomie unternehmen',
    'digitalisierung': 'digitalisierung digital technologie'
  };
  
  // Apply synonym expansion
  Object.entries(synonymMap).forEach(([term, synonyms]) => {
    if (optimizedQuery.toLowerCase().includes(term)) {
      optimizedQuery = optimizedQuery.replace(
        new RegExp(term, 'gi'), 
        synonyms
      );
    }
  });
  
  // Add regional context for Rhein-Sieg-Kreis queries
  if (optimizedQuery.toLowerCase().includes('rhein-sieg')) {
    optimizedQuery += ' nrw nordrhein-westfalen bonn köln';
  }
  
  // Remove unnecessary words to keep under 400 chars
  const stopWords = ['der', 'die', 'das', 'und', 'oder', 'aber', 'wenn', 'dann', 'also', 'sehr', 'mehr', 'kann', 'soll', 'wird', 'ist', 'sind', 'ein', 'eine'];
  const words = optimizedQuery.split(' ');
  const filteredWords = words.filter(word => 
    word.length > 2 && !stopWords.includes(word.toLowerCase())
  );
  
  optimizedQuery = filteredWords.join(' ');
  
  // Ensure query stays under 400 characters
  if (optimizedQuery.length > 400) {
    optimizedQuery = optimizedQuery.substring(0, 397) + '...';
  }
  
  log.debug(`[deep-research] Optimized query: "${optimizedQuery}" (${optimizedQuery.length} chars)`);
  return optimizedQuery;
}

/**
 * Break down complex queries into focused sub-queries under 400 characters
 */
function breakDownComplexQuery(query) {
  const subQueries = [];
  
  // Split by common separators
  const separators = [' - ', ' und ', ' sowie ', ' oder ', ' aber ', ' jedoch ', ' außerdem ', ' zusätzlich '];
  let parts = [query];
  
  separators.forEach(separator => {
    const newParts = [];
    parts.forEach(part => {
      if (part.includes(separator)) {
        newParts.push(...part.split(separator));
      } else {
        newParts.push(part);
      }
    });
    parts = newParts;
  });
  
  // Clean up and validate sub-queries
  parts.forEach(part => {
    const cleaned = part.trim();
    if (cleaned.length > 10 && cleaned.length <= 400) {
      subQueries.push(cleaned);
    } else if (cleaned.length > 400) {
      // Further break down if still too long
      const words = cleaned.split(' ');
      const midPoint = Math.floor(words.length / 2);
      const firstHalf = words.slice(0, midPoint).join(' ');
      const secondHalf = words.slice(midPoint).join(' ');
      
      if (firstHalf.length <= 400) subQueries.push(firstHalf);
      if (secondHalf.length <= 400) subQueries.push(secondHalf);
    }
  });
  
  // Fallback: if no good sub-queries, use original truncated
  if (subQueries.length === 0) {
    subQueries.push(query.substring(0, 397) + '...');
  }
  
  return subQueries;
}

/**
 * Filter and optimize data for AI processing to reduce token usage
 */
function filterDataForAI(searchResults, allSources, grundsatzResults) {
  log.debug('[deep-research] Filtering data for AI processing...');
  
  // Filter search results - keep only essential data
  const filteredSearchResults = searchResults.map(result => ({
    question: result.question,
    category: result.category,
    answer: result.answer ? result.answer.substring(0, 300) + (result.answer.length > 300 ? '...' : '') : null,
    resultsCount: result.results?.length || 0,
    hasResults: (result.results?.length || 0) > 0
  }));

  // Filter sources - top 5 per category, truncated content
  const filteredSources = {};
  Object.entries(allSources.reduce((acc, source) => {
    source.categories.forEach(cat => {
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(source);
    });
    return acc;
  }, {})).forEach(([category, sources]) => {
    // Sort by score and take top 5
    const topSources = sources
      .sort((a, b) => (b.score || 0) - (a.score || 0))
      .slice(0, 5)
      .map(source => ({
        title: source.title,
        url: source.url,
        score: source.score,
        content_snippet: source.content_snippets 
          ? source.content_snippets.substring(0, 150) + (source.content_snippets.length > 150 ? '...' : '')
          : null
      }));
    filteredSources[category] = topSources;
  });

  // Filter Grundsatz results - keep only key information
  const filteredGrundsatz = grundsatzResults && grundsatzResults.success 
    ? {
        hasResults: grundsatzResults.results.length > 0,
        resultCount: grundsatzResults.results.length,
        keyFindings: grundsatzResults.results.slice(0, 3).map(result => ({
          title: result.title,
          content: result.content.substring(0, 200) + (result.content.length > 200 ? '...' : ''),
          filename: result.filename,
          similarity_score: result.similarity_score
        }))
      }
    : { hasResults: false, resultCount: 0, keyFindings: [] };

  const originalSize = JSON.stringify({ searchResults, allSources, grundsatzResults }).length;
  const filteredSize = JSON.stringify({ filteredSearchResults, filteredSources, filteredGrundsatz }).length;
  
  log.debug(`[deep-research] Data filtering: ${originalSize} -> ${filteredSize} chars (${Math.round((1 - filteredSize/originalSize) * 100)}% reduction)`);

  return {
    searchResults: filteredSearchResults,
    sources: filteredSources,
    grundsatz: filteredGrundsatz
  };
}

/**
 * Execute Grundsatz document search using DocumentSearchService
 */
async function executeGrundsatzSearch(searchQuery) {
  try {
    log.debug(`[deep-research] Searching Grundsatz documents for: "${searchQuery}"`);
    
    const documentSearchService = new DocumentSearchService();
    
    const searchResults = await documentSearchService.search({
      query: searchQuery,
      user_id: 'deep-research', // Anonymous user for deep research
      searchCollection: 'grundsatz_documents',
      limit: 3,
      mode: 'hybrid'
    });
    
    const formattedResults = (searchResults.results || []).map((result, index) => {
      const title = result.title || result.document_title;
      const content = result.relevant_content || result.chunk_text;
      
      return {
        document_id: result.document_id,
        title: title,
        content: content,
        similarity_score: result.similarity_score,
        filename: result.filename,
        chunk_index: result.chunk_index || 0,
        relevance_info: result.relevance_info,
        source_type: 'official_document'
      };
    });
    
    return {
      success: true,
      results: formattedResults,
      searchType: searchResults.searchType,
      query: searchQuery
    };
    
  } catch (error) {
    log.error('[deep-research] Grundsatz search error:', error);
    return {
      success: false,
      results: [],
      error: error.message,
      query: searchQuery
    };
  }
}

export default router;