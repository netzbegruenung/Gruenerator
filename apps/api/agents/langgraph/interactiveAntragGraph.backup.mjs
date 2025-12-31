/**
 * Interactive Antrag Generator Graph using LangGraph
 *
 * Multi-step conversation flow:
 * 1. User provides thema, details, requestType
 * 2. Web search (SearXNG)
 * 3. AI generates 5 intelligent questions
 * 4. Graph interrupts to await user answers
 * 5. User answers questions, graph resumes
 * 6. Document enrichment (URL crawl, DocQnA, knowledge)
 * 7. Final generation with all context
 */

import { StateGraph, Annotation, MemorySaver, interrupt, Command } from "@langchain/langgraph";
import searxngService from '../../services/searxngWebSearchService.js';
import { urlCrawlerService } from '../../services/urlCrawlerService.js';
import { enrichRequest } from '../../utils/requestEnrichment.js';
import { assemblePromptGraphAsync } from './promptAssemblyGraph.js';
import { loadPromptConfig, SimpleTemplateEngine } from './promptProcessor.js';
import {
  extractStructuredAnswers
} from '../chat/informationRequestHandler.js';
import {
  setExperimentalSession,
  getExperimentalSession,
  updateExperimentalSession
} from '../../services/chatMemoryService.js';
import { getQuestionsForType } from '../../config/antragQuestions.js';
import { RedisCheckpointer } from './RedisCheckpointer.mjs';
import redisClient from '../../utils/redisClient.js';

// State schema for interactive Antrag flow
const InteractiveAntragState = Annotation.Root({
  // Session identifiers
  sessionId: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  userId: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Conversation state
  conversationState: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // User input
  thema: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  details: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  requestType: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  locale: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Web search results
  searchResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Intelligent crawling support
  crawlDecisions: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  enrichedSearchResults: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  crawlMetadata: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Question-answer flow
  questionRound: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  questions: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  answers: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),
  allAnswers: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  needsFollowUp: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Enrichment context
  enrichedContext: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // AI-generated summary of Q&A
  answerSummary: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Generation
  finalResult: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // AI worker pool
  aiWorkerPool: Annotation({
    reducer: (x, y) => y ?? x,
  }),
  req: Annotation({
    reducer: (x, y) => y ?? x,
  }),

  // Metadata
  metadata: Annotation({
    reducer: (x, y) => ({ ...x, ...y }),
  }),

  // Error handling
  error: Annotation({
    reducer: (x, y) => y ?? x,
  })
});

/**
 * Helper: Format search results for Mistral prompt
 * Groups results by purpose for better context
 */
function formatSearchResultsForPrompt(searchResults) {
  if (!searchResults || !searchResults.results || searchResults.results.length === 0) {
    return 'Keine Suchergebnisse verfügbar.';
  }

  const purposeLabels = {
    facts: '📊 Fakten & Statistiken',
    party_position: '🌻 Grüne Positionen',
    legal: '⚖️ Rechtliche Grundlagen',
    news: '📰 Aktuelle Nachrichten',
    examples: '💡 Erfolgreiche Beispiele',
    general: '🔍 Allgemeine Ergebnisse'
  };

  const results = searchResults.results;

  // Check if results have purpose tags (new format)
  const hasPurposeTags = results.some(r => r.searchPurpose);

  if (hasPurposeTags) {
    // Group by purpose
    const grouped = results.reduce((acc, r) => {
      const purpose = r.searchPurpose || 'general';
      if (!acc[purpose]) acc[purpose] = [];
      acc[purpose].push(r);
      return acc;
    }, {});

    return Object.entries(grouped)
      .map(([purpose, items]) => {
        const label = purposeLabels[purpose] || purpose;
        const formatted = items.slice(0, 3)
          .map((r, i) => `  ${i + 1}. ${r.title}\n     ${r.content_snippets || r.snippet || ''}`)
          .join('\n');
        return `${label}:\n${formatted}`;
      })
      .join('\n\n');
  }

  // Fallback: simple list format (old format)
  const topResults = results.slice(0, 5);
  return topResults
    .map((result, index) => `${index + 1}. ${result.title}\n   ${result.content_snippets || result.snippet || ''}`)
    .join('\n\n');
}

/**
 * Helper: Deduplicate and interleave search results by purpose
 * Uses round-robin to ensure balanced representation from each search type
 */
function deduplicateAndInterleaveResults(allResults) {
  const seen = new Set();

  // Group by purpose
  const byPurpose = {};
  for (const result of allResults) {
    const purpose = result.searchPurpose || 'general';
    if (!byPurpose[purpose]) byPurpose[purpose] = [];

    // Deduplicate within each purpose group
    if (!seen.has(result.url)) {
      seen.add(result.url);
      byPurpose[purpose].push(result);
    }
  }

  // Round-robin interleave
  const purposes = Object.keys(byPurpose);
  const interleaved = [];
  let index = 0;
  let hasMore = true;

  while (hasMore) {
    hasMore = false;
    for (const purpose of purposes) {
      if (byPurpose[purpose][index]) {
        interleaved.push(byPurpose[purpose][index]);
        hasMore = true;
      }
    }
    index++;
  }

  return interleaved;
}

/**
 * Helper: Generate AI-powered search queries
 */
async function generateSearchQueries(state) {
  const config = loadPromptConfig('interactive_antrag_search_queries');

  const userPrompt = SimpleTemplateEngine.render(config.generationPrompt, {
    thema: state.thema,
    details: state.details,
    requestType: state.requestType
  });

  const tools = [config.toolSchema];

  const result = await state.aiWorkerPool.processRequest({
    type: 'search_query_generation',
    systemPrompt: config.systemPrompt,
    messages: [{ role: 'user', content: userPrompt }],
    options: {
      ...config.options,
      tools
    }
  }, state.req);

  if (result.tool_calls && result.tool_calls.length > 0) {
    const toolCall = result.tool_calls[0];
    const functionArgs = typeof toolCall.input === 'string'
      ? JSON.parse(toolCall.input)
      : toolCall.input;

    return {
      queries: functionArgs.queries,
      config: config.searchDefaults
    };
  }

  return null;
}

/**
 * Helper: Get tool schema for generating clarifying questions
 */
function getQuestionGenerationTool(config) {
  return config.toolSchema;
}

/**
 * Node 1: Initiate Session
 * Validates input and creates session in Redis
 */
async function initiateNode(state) {
  try {
    // Validate required fields
    if (!state.thema || !state.details || !state.requestType) {
      throw new Error('Missing required fields: thema, details, requestType');
    }

    if (!state.userId) {
      throw new Error('Missing userId');
    }

    // Use sessionId from state if provided, otherwise generate new one
    const sessionId = state.sessionId || `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Create session data
    const sessionData = {
      sessionId, // Include sessionId in data
      conversationState: 'initiated',
      thema: state.thema,
      details: state.details,
      requestType: state.requestType,
      locale: state.locale || 'de-DE',
      questionRound: 0,
      questions: [],
      answers: {},
      metadata: {
        startTime: Date.now()
      }
    };

    // Create session in Redis (setExperimentalSession uses sessionId from sessionData)
    await setExperimentalSession(state.userId, sessionData);

    return {
      sessionId,
      conversationState: 'initiated',
      metadata: {
        startTime: Date.now()
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in initiate node:', error);
    return {
      conversationState: 'error',
      error: error.message
    };
  }
}

/**
 * Node 2: Web Search
 * Uses AI to generate targeted search queries, then executes them in parallel
 */
async function webSearchNode(state) {
  console.log('[InteractiveAntragGraph] Performing AI-powered web search');

  try {
    // Step 1: Generate AI-powered search queries
    let searchQueries = null;
    let searchConfig = { maxResultsPerQuery: 5, language: 'de-DE', totalMaxResults: 15 };

    try {
      console.log('[InteractiveAntragGraph] Generating AI search queries...');
      const queryResult = await generateSearchQueries(state);

      if (queryResult && queryResult.queries && queryResult.queries.length > 0) {
        searchQueries = queryResult.queries;
        searchConfig = { ...searchConfig, ...queryResult.config };
        console.log(`[InteractiveAntragGraph] AI generated ${searchQueries.length} search queries:`,
          searchQueries.map(q => `[${q.purpose}] ${q.query}`));
      }
    } catch (aiError) {
      console.warn('[InteractiveAntragGraph] AI query generation failed, using fallback:', aiError.message);
    }

    // Fallback to simple query if AI fails
    if (!searchQueries || searchQueries.length === 0) {
      console.log('[InteractiveAntragGraph] Using fallback search query');
      searchQueries = [{
        query: `${state.thema} ${state.details} Bündnis 90 Die Grünen`,
        purpose: 'general',
        category: 'general'
      }];
    }

    // Step 2: Execute all searches in parallel
    console.log(`[InteractiveAntragGraph] Executing ${searchQueries.length} searches in parallel...`);

    const searchPromises = searchQueries.map(async (sq) => {
      try {
        const result = await searxngService.performWebSearch(sq.query, {
          maxResults: searchConfig.maxResultsPerQuery,
          language: searchConfig.language,
          categories: sq.category
        });

        if (result.success && result.results) {
          return result.results.map(r => ({
            ...r,
            searchPurpose: sq.purpose,
            searchQuery: sq.query
          }));
        }
        return [];
      } catch (err) {
        console.warn(`[InteractiveAntragGraph] Search failed for "${sq.query}":`, err.message);
        return [];
      }
    });

    const searchResultArrays = await Promise.all(searchPromises);
    const allResults = searchResultArrays.flat();

    // Step 3: Deduplicate and interleave results by purpose (round-robin)
    const deduplicatedResults = deduplicateAndInterleaveResults(allResults);

    // Step 4: Limit total results
    const limitedResults = deduplicatedResults.slice(0, searchConfig.totalMaxResults);

    console.log(`[InteractiveAntragGraph] Search completed: ${allResults.length} total → ${deduplicatedResults.length} unique → ${limitedResults.length} final`);

    // Format results for question generation
    const formattedResults = {
      queries: searchQueries,
      results: limitedResults,
      summary: `Found ${limitedResults.length} unique results from ${searchQueries.length} searches`,
      sources: limitedResults.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.content_snippets || r.snippet,
        purpose: r.searchPurpose
      })),
      byPurpose: searchQueries.reduce((acc, sq) => {
        acc[sq.purpose] = limitedResults.filter(r => r.searchPurpose === sq.purpose).length;
        return acc;
      }, {})
    };

    console.log('[InteractiveAntragGraph] Results by purpose:', formattedResults.byPurpose);

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        searchResults: formattedResults
      });
    }

    return {
      searchResults: formattedResults
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in web search node:', error);
    return {
      searchResults: {
        queries: [],
        results: [],
        success: false,
        error: error.message
      }
    };
  }
}

/**
 * Node 2.5: Intelligent Crawler Agent
 * AI decides which URLs to crawl for full content based on snippet analysis
 */
async function intelligentCrawlerNode(state) {
  console.log('[InteractiveAntragGraph] Running intelligent crawler agent');

  try {
    const results = state.searchResults?.results || [];

    if (results.length === 0) {
      console.log('[InteractiveAntragGraph] No search results to analyze for crawling');
      return {
        crawlDecisions: [],
        crawlMetadata: { noResultsToAnalyze: true }
      };
    }

    // Configuration: crawl top 3 URLs for richer context
    const maxCrawls = 3;
    const timeout = 5000;

    // Build analysis content for AI
    const analysisContent = results.slice(0, 10).map((r, i) => `
[${i+1}] ${r.title}
URL: ${r.url}
Domain: ${r.domain || 'unknown'}
Purpose: ${r.searchPurpose || 'general'}
Snippet: ${r.snippet || r.content || 'No preview available'}
`).join('\n');

    console.log(`[InteractiveAntragGraph] Analyzing ${Math.min(results.length, 10)} results to select max ${maxCrawls} for crawling`);

    const crawlDecision = await state.aiWorkerPool.processRequest({
      type: 'crawler_agent',
      systemPrompt: `Du bist ein intelligenter Web-Recherche-Agent. Basierend auf Suchergebnis-Snippets entscheidest du, welche URLs für vollständigen Inhalt gecrawlt werden sollen.

Bewertungskriterien:
- RELEVANZ: Wie direkt adressiert das Snippet das Thema?
- AUTORITÄT: Ist dies eine glaubwürdige Quelle? (Regierung, Verbände, Fachmedien)
- EINZIGARTIGKEIT: Bietet dies einzigartige Informationen?
- TIEFE: Deutet das Snippet auf reichhaltigen, detaillierten Inhalt hin?
- ZUGÄNGLICHKEIT: Vermeide Paywall-Seiten

Wähle maximal ${maxCrawls} URLs aus, die den größten Mehrwert bieten.
Priorisiere Qualität über Quantität.`,

      messages: [{
        role: "user",
        content: `Thema: "${state.thema}"
Details: "${state.details}"

Verfügbare Suchergebnisse:
${analysisContent}

Analysiere diese Ergebnisse und wähle die ${maxCrawls} wertvollsten URLs zum Crawlen aus.

Antworte mit JSON:
{
  "selections": [
    {
      "index": 1,
      "url": "...",
      "reason": "Kurze Begründung",
      "expectedValue": "high|medium|low"
    }
  ],
  "reasoning": "Gesamtstrategie für diese Auswahl"
}`
      }],
      options: {
        provider: 'litellm',
        model: 'gpt-oss:120b',
        max_tokens: 600,
        temperature: 0.1
      }
    }, state.req);

    if (!crawlDecision.success) {
      throw new Error(`AI crawler agent failed: ${crawlDecision.error}`);
    }

    let decision;
    try {
      decision = JSON.parse(crawlDecision.content);
    } catch (parseError) {
      console.warn('[InteractiveAntragGraph] Failed to parse AI decision, using top results');
      decision = {
        selections: results.slice(0, maxCrawls).map((r, i) => ({
          index: i + 1,
          url: r.url,
          reason: 'Fallback - top ranked result',
          expectedValue: 'medium'
        })),
        reasoning: 'Fallback due to JSON parsing error'
      };
    }

    console.log(`[InteractiveAntragGraph] Selected ${decision.selections.length} URLs to crawl: ${decision.reasoning}`);

    return {
      crawlDecisions: decision.selections,
      crawlMetadata: {
        strategy: decision.reasoning,
        totalResultsAnalyzed: Math.min(results.length, 10),
        maxCrawlsAllowed: maxCrawls,
        selectedCount: decision.selections.length,
        timeout
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Intelligent crawler agent error:', error);
    return {
      crawlDecisions: [],
      crawlMetadata: { failed: true, error: error.message }
    };
  }
}

/**
 * Node 2.6: Content Enricher
 * Performs actual crawling of selected URLs for full content
 */
async function contentEnricherNode(state) {
  console.log('[InteractiveAntragGraph] Running content enricher');

  try {
    if (!state.crawlDecisions || state.crawlDecisions.length === 0) {
      console.log('[InteractiveAntragGraph] No URLs selected for crawling');
      return {
        enrichedSearchResults: state.searchResults,
        crawlMetadata: {
          ...state.crawlMetadata,
          crawledCount: 0,
          nothingToCrawl: true
        }
      };
    }

    const searchResults = state.searchResults?.results || [];
    const timeout = state.crawlMetadata?.timeout || 5000;

    console.log(`[InteractiveAntragGraph] Starting parallel crawl of ${state.crawlDecisions.length} URLs`);

    const crawlPromises = state.crawlDecisions.map(async (decision) => {
      try {
        const originalResult = searchResults[decision.index - 1];
        if (!originalResult) {
          console.warn(`[InteractiveAntragGraph] Invalid index ${decision.index}, skipping`);
          return null;
        }

        console.log(`[InteractiveAntragGraph] Crawling: ${originalResult.url}`);

        const crawlResult = await urlCrawlerService.crawlUrl(originalResult.url, {
          timeout,
          maxContentLength: 50000
        });

        if (crawlResult.success && crawlResult.data?.content) {
          return {
            ...originalResult,
            content: crawlResult.data.content,
            fullContent: crawlResult.data.content,
            contentType: 'full',
            selectionReason: decision.reason,
            expectedValue: decision.expectedValue,
            crawlSuccess: true,
            wordCount: crawlResult.data.wordCount
          };
        } else {
          console.warn(`[InteractiveAntragGraph] Crawl failed for ${originalResult.url}`);
          return {
            ...originalResult,
            contentType: 'snippet',
            crawlSuccess: false
          };
        }
      } catch (error) {
        console.warn(`[InteractiveAntragGraph] Crawl error:`, error.message);
        return null;
      }
    });

    const crawlResults = await Promise.all(crawlPromises);
    const validResults = crawlResults.filter(r => r !== null);
    const successfulCrawls = validResults.filter(r => r.crawlSuccess).length;

    // Merge crawled results with original results
    const enrichedResults = searchResults.map(originalResult => {
      const crawled = validResults.find(c => c.url === originalResult.url);
      if (crawled) {
        return crawled;
      }
      return {
        ...originalResult,
        contentType: 'snippet',
        content: originalResult.snippet || originalResult.content || ''
      };
    });

    console.log(`[InteractiveAntragGraph] Crawl completed: ${successfulCrawls}/${state.crawlDecisions.length} successful`);

    // Update searchResults with enriched content
    const enrichedSearchResults = {
      ...state.searchResults,
      results: enrichedResults,
      crawlStats: {
        attempted: state.crawlDecisions.length,
        successful: successfulCrawls,
        fullContentResults: successfulCrawls
      }
    };

    return {
      enrichedSearchResults,
      searchResults: enrichedSearchResults,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledCount: successfulCrawls,
        failedCount: state.crawlDecisions.length - successfulCrawls,
        totalEnriched: enrichedResults.length
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Content enricher error:', error);
    return {
      enrichedSearchResults: state.searchResults,
      crawlMetadata: {
        ...state.crawlMetadata,
        crawledCount: 0,
        failed: true
      }
    };
  }
}

/**
 * Node 3: Generate Clarifying Questions
 * AI generates 2-3 context-aware questions with answer options
 */
async function generateQuestionsNode(state) {
  console.log('[InteractiveAntragGraph] Generating AI clarifying questions');

  try {
    const config = loadPromptConfig('interactive_antrag_questions');
    const searchSummary = formatSearchResultsForPrompt(state.searchResults);

    const userPrompt = SimpleTemplateEngine.render(config.generationPrompt, {
      thema: state.thema,
      details: state.details,
      searchSummary
    });

    const tools = [getQuestionGenerationTool(config)];

    console.log('[InteractiveAntragGraph] Calling AI to generate questions...');

    const result = await state.aiWorkerPool.processRequest({
      type: 'antrag_question_generation',
      systemPrompt: config.systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      options: {
        ...config.options,
        tools
      }
    }, state.req);

    let questions = [];

    if (result.tool_calls && result.tool_calls.length > 0) {
      const toolCall = result.tool_calls[0];
      const functionArgs = typeof toolCall.input === 'string'
        ? JSON.parse(toolCall.input)
        : toolCall.input;

      questions = functionArgs.questions.map((q, index) => ({
        id: q.id || `q${index + 1}`,
        text: q.text,
        type: 'ai_generated',
        questionFormat: config.questionDefaults.questionFormat,
        options: q.options,
        optionEmojis: q.emojis,
        allowCustom: config.questionDefaults.allowCustom,
        allowMultiSelect: config.questionDefaults.allowMultiSelect,
        skipOption: config.questionDefaults.skipOption
      }));

      console.log(`[InteractiveAntragGraph] Generated ${questions.length} AI questions`);
    } else {
      console.warn('[InteractiveAntragGraph] No tool call returned, using fallback');
      questions = getQuestionsForType(state.requestType, 1);
    }

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'questions_generated',
        questionRound: 1,
        questions
      });
    }

    return {
      conversationState: 'questions_generated',
      questionRound: 1,
      questions
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error generating questions:', error);
    const fallbackQuestions = getQuestionsForType(state.requestType, 1);
    return {
      conversationState: 'questions_generated',
      questionRound: 1,
      questions: fallbackQuestions
    };
  }
}

/**
 * Node 3.5: Await User Answers
 * Interrupts the graph to wait for user input, then resumes with answers
 *
 * IMPORTANT: Code after interrupt() is NEVER executed. When the graph resumes
 * via Command({ update }), it continues to the NEXT node (analyze_answers).
 * User answers are injected into state via Command({ update: { answers } }).
 */
async function awaitAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Awaiting user answers');

  // Update Redis session to indicate we're waiting for answers
  if (state.sessionId && state.userId) {
    await updateExperimentalSession(state.userId, state.sessionId, {
      conversationState: 'questions_asked',
      questionRound: state.questionRound || 1,
      questions: state.questions
    });
  }

  console.log('[InteractiveAntragGraph] Interrupting graph - will resume at next node');

  // Graph execution terminates here. When resumed via Command({ update }),
  // the graph continues to the next node (analyze_answers) with updated state.
  // The answers will be injected via Command({ update: { answers } }).
  interrupt({
    conversationState: 'questions_asked',
    questionRound: state.questionRound || 1,
    questions: state.questions,
    sessionId: state.sessionId
  });

  // Code below this point is NEVER executed - interrupt() terminates the node
}

/**
 * Node 4: Analyze Answers
 * Proceeds directly to enrichment after receiving answers
 */
async function analyzeAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Resumed after interrupt - analyzing answers');
  console.log('[InteractiveAntragGraph] Answers received:', {
    hasAnswers: !!state.answers,
    hasRound1: !!state.answers?.round1,
    answerCount: Object.keys(state.answers?.round1 || {}).length
  });

  try {
    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'answers_received',
        needsFollowUp: false
      });
    }

    return {
      conversationState: 'answers_received',
      needsFollowUp: false
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error processing answers:', error);
    return {
      conversationState: 'answers_received',
      needsFollowUp: false,
      metadata: {
        ...state.metadata,
        analysisError: error.message
      }
    };
  }
}

/**
 * Node 4.5: Summarize Answers
 * Uses AI to create a comprehensive summary of all Q&A for the final generation
 */
async function summarizeAnswersNode(state) {
  console.log('[InteractiveAntragGraph] Summarizing Q&A with AI');

  try {
    const questions = state.questions || [];
    const answers = state.answers?.round1 || {};

    // Build Q&A pairs for the AI
    const qaPairs = questions
      .filter(q => answers[q.id] && answers[q.id] !== 'Überspringen')
      .map(q => `Frage: ${q.text}\nAntwort: ${answers[q.id]}`)
      .join('\n\n');

    if (!qaPairs) {
      console.log('[InteractiveAntragGraph] No Q&A pairs to summarize');
      return { answerSummary: '' };
    }

    const systemPrompt = `Du bist ein Assistent, der detaillierte Kontextinformationen aus einem Gespräch über einen politischen Antrag aufbereitet.
Erstelle eine umfassende Zusammenfassung aller Fragen und Antworten, die als vollständiger Kontext für die Antragserstellung dient.
Strukturiere die Informationen klar und übersichtlich. Kürze NICHT - jedes Detail ist wichtig.
Schreibe in der dritten Person und nutze eine sachliche, professionelle Sprache.`;

    const userPrompt = `Thema des Antrags: ${state.thema}
Details: ${state.details}

Beantwortete Fragen aus dem Verständnisgespräch:
${qaPairs}

Erstelle eine vollständige, strukturierte Zusammenfassung dieser Informationen. Erfasse ALLE Details aus den Antworten.
Die Zusammenfassung soll dem Textgenerator alle notwendigen Informationen liefern, um einen passenden Antrag zu erstellen.
Gib die Informationen in logischer Reihenfolge wieder:
1. Art des gewünschten Dokuments/Beschlusses
2. Das konkrete Problem oder Anliegen
3. Betroffene Zielgruppen
4. Finanzielle Aspekte (falls genannt)
5. Relevante Vorgeschichte oder Hintergründe
6. Dringlichkeit und Zeitrahmen`;

    const result = await state.aiWorkerPool.processRequest({
      type: 'antrag_qa_summary',
      systemPrompt,
      messages: [{ role: 'user', content: userPrompt }],
      options: {
        max_tokens: 1500,
        temperature: 0.3
      }
    }, state.req);

    const summary = result.content || '';
    console.log('[InteractiveAntragGraph] Q&A summary generated:', summary.length, 'chars');
    console.log('[InteractiveAntragGraph] === Q&A SUMMARY START ===');
    console.log(summary);
    console.log('[InteractiveAntragGraph] === Q&A SUMMARY END ===');

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        answerSummary: summary
      });
    }

    return { answerSummary: summary };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error summarizing answers:', error);
    return { answerSummary: '' };
  }
}

/**
 * Node 5: Document Enrichment
 * Applies full enrichment pipeline (URL crawl, DocQnA, knowledge)
 */
async function documentEnrichmentNode(state) {
  console.log('[InteractiveAntragGraph] Applying document enrichment');

  try {
    // Extract structured answers from all rounds
    const allQuestions = state.questions || [];

    // Flatten all answers from all rounds
    let allAnswers = {};
    if (state.answers) {
      // If answers are organized by round
      if (state.answers.round1 || state.answers.round2) {
        allAnswers = {
          ...(state.answers.round1 || {}),
          ...(state.answers.round2 || {})
        };
      } else {
        // If answers are flat
        allAnswers = state.answers;
      }
    }

    const structuredAnswers = extractStructuredAnswers(allAnswers, allQuestions);

    console.log('[InteractiveAntragGraph] Extracted structured answers:', {
      hasScope: structuredAnswers.scope?.length > 0,
      hasAudience: !!structuredAnswers.audience,
      hasFacts: structuredAnswers.facts?.length > 0,
      hasTone: !!structuredAnswers.tone
    });

    const enrichmentRequest = {
      thema: state.thema,
      details: state.details,
      requestType: state.requestType,
      userClarifications: structuredAnswers
    };

    // Apply enrichment (URL crawl, DocQnA, knowledge)
    const enrichedContext = await enrichRequest(enrichmentRequest, state.userId);

    console.log('[InteractiveAntragGraph] Enrichment completed:', {
      documentsAdded: enrichedContext.documents?.length || 0,
      knowledgeAdded: enrichedContext.knowledge?.length || 0,
      urlsCrawled: enrichedContext.urlsCrawled?.length || 0
    });

    // Update session
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'generating',
        enrichedContext,
        allAnswers: structuredAnswers
      });
    }

    return {
      conversationState: 'generating',
      enrichedContext,
      allAnswers: structuredAnswers
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in enrichment:', error);
    // Continue without enrichment
    return {
      conversationState: 'generating',
      enrichedContext: {},
      metadata: {
        ...state.metadata,
        enrichmentError: error.message
      }
    };
  }
}

/**
 * Node 6: Final Generation
 * Assembles full context and generates the Antrag/Anfrage
 */
async function finalGenerationNode(state) {
  console.log('[InteractiveAntragGraph] Generating final result');

  try {
    // Load configuration from antrag_experimental.json
    const config = loadPromptConfig('antrag_experimental');

    // Build system role from config
    let systemRole = config.systemRole || 'Du bist ein Experte für politische Anträge bei Bündnis 90/Die Grünen.';

    // Apply request type extension if exists
    if (config.systemRoleExtensions) {
      const extension = config.systemRoleExtensions[state.requestType] || config.systemRoleExtensions.default;
      if (extension) {
        systemRole += ' ' + extension;
      }
    }

    // Add appendix
    if (config.systemRoleAppendix) {
      systemRole += ' ' + config.systemRoleAppendix;
    }

    console.log('[InteractiveAntragGraph] Using systemRole from config');

    // Use AI-generated summary from summarizeAnswersNode
    const userClarificationsFormatted = state.answerSummary
      ? `\n\n## Präzisierungen aus dem Verständnisgespräch\n\n${state.answerSummary}`
      : '';

    console.log('[InteractiveAntragGraph] User clarifications included:', userClarificationsFormatted.length, 'chars');
    if (userClarificationsFormatted) {
      console.log('[InteractiveAntragGraph] === CLARIFICATIONS FOR PROMPT ===');
      console.log(userClarificationsFormatted);
      console.log('[InteractiveAntragGraph] === END CLARIFICATIONS ===');
    }

    const promptContext = {
      systemRole,
      request: {
        thema: state.thema,
        details: state.details,
        requestType: state.requestType,
        userClarifications: userClarificationsFormatted,
        locale: state.locale || 'de-DE'
      },
      documents: state.enrichedContext?.documents || [],
      knowledge: state.enrichedContext?.knowledge || [],
      locale: state.locale || 'de-DE'
    };

    console.log('[InteractiveAntragGraph] Assembling prompt with context:', {
      hasDocuments: promptContext.documents.length > 0,
      hasKnowledge: promptContext.knowledge.length > 0,
      hasClarifications: !!state.allAnswers
    });

    // Assemble prompt using existing infrastructure
    const assembledPrompt = await assemblePromptGraphAsync(promptContext);

    // Generate final text using AI worker pool
    const generationResult = await state.aiWorkerPool.processRequest({
      type: state.requestType,
      systemPrompt: assembledPrompt.system,
      messages: assembledPrompt.messages,
      options: {
        max_tokens: config.options?.max_tokens || 4000,
        temperature: config.options?.temperature || 0.3,
        ...(assembledPrompt.tools?.length > 0 && { tools: assembledPrompt.tools })
      }
    }, state.req);

    if (!generationResult.success) {
      throw new Error('Generation failed: ' + generationResult.error);
    }

    const finalResult = generationResult.content;

    console.log('[InteractiveAntragGraph] Generation completed:', {
      length: finalResult?.length || 0,
      hasResult: !!finalResult
    });

    // Update session with final result
    if (state.sessionId && state.userId) {
      await updateExperimentalSession(state.userId, state.sessionId, {
        conversationState: 'completed',
        finalResult,
        metadata: {
          ...state.metadata,
          completedAt: Date.now(),
          duration: Date.now() - (state.metadata?.startTime || Date.now())
        }
      });
    }

    return {
      conversationState: 'completed',
      finalResult,
      metadata: {
        ...state.metadata,
        completedAt: Date.now(),
        duration: Date.now() - (state.metadata?.startTime || Date.now())
      }
    };

  } catch (error) {
    console.error('[InteractiveAntragGraph] Error in final generation:', error);
    return {
      conversationState: 'error',
      error: error.message
    };
  }
}

/**
 * Build and compile the Interactive Antrag Graph
 */
function createInteractiveAntragGraph() {
  const graph = new StateGraph(InteractiveAntragState);

  // Add all nodes
  graph.addNode("initiate", initiateNode);
  graph.addNode("web_search", webSearchNode);
  graph.addNode("intelligent_crawler", intelligentCrawlerNode);
  graph.addNode("content_enricher", contentEnricherNode);
  graph.addNode("generate_questions", generateQuestionsNode);
  graph.addNode("await_answers", awaitAnswersNode);
  graph.addNode("analyze_answers", analyzeAnswersNode);
  graph.addNode("summarize_answers", summarizeAnswersNode);
  graph.addNode("document_enrichment", documentEnrichmentNode);
  graph.addNode("final_generation", finalGenerationNode);

  // Set entry point
  graph.setEntryPoint("initiate");

  graph.addConditionalEdges(
    "initiate",
    (state) => {
      if (state.conversationState === 'error') {
        return "__end__";
      }
      return "web_search";
    }
  );
  // Web search → Intelligent crawler → Content enricher → Generate questions
  graph.addEdge("web_search", "intelligent_crawler");
  graph.addEdge("intelligent_crawler", "content_enricher");
  graph.addEdge("content_enricher", "generate_questions");
  graph.addEdge("generate_questions", "await_answers");
  graph.addEdge("await_answers", "analyze_answers");

  // Route through AI summary node before enrichment
  graph.addEdge("analyze_answers", "summarize_answers");
  graph.addEdge("summarize_answers", "document_enrichment");
  graph.addEdge("document_enrichment", "final_generation");
  graph.addEdge("final_generation", "__end__");

  return graph.compile({
    checkpointer: new RedisCheckpointer(redisClient)
  });
}

// Export the compiled graph
export const interactiveAntragGraph = createInteractiveAntragGraph();

/**
 * Execute the interactive Antrag flow - Initiate Phase
 * This starts the conversation and returns questions
 */
export async function initiateInteractiveAntrag({
  userId,
  thema,
  details,
  requestType,
  locale = 'de-DE',
  aiWorkerPool,
  req
}) {
  console.log('[InteractiveAntragGraph] Initiating interactive Antrag flow');

  const sessionId = `exp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

  try {
    const initialState = {
      userId,
      thema,
      details,
      requestType,
      locale,
      aiWorkerPool,
      req,
      sessionId,
      questionRound: 0,
      answers: {},
      metadata: {}
    };

    const result = await interactiveAntragGraph.invoke(initialState, {
      configurable: { thread_id: sessionId }
    });

    console.log('[InteractiveAntragGraph] Graph invoke returned:', {
      hasInterrupt: !!result.__interrupt__,
      conversationState: result.conversationState,
      hasQuestions: !!result.questions,
      questionCount: result.questions?.length || 0
    });

    if (result.__interrupt__ && result.__interrupt__.length > 0) {
      console.log('[InteractiveAntragGraph] Graph interrupted successfully');
      const interruptValue = result.__interrupt__[0].value;

      return {
        status: 'success',
        sessionId: sessionId,
        conversationState: interruptValue.conversationState,
        questions: interruptValue.questions,
        questionRound: interruptValue.questionRound,
        metadata: {
          searchResultsCount: 0, // Search results not in interrupt value
          questionCount: interruptValue.questions?.length || 0
        }
      };
    }

    if (result.conversationState === 'error') {
      console.error('[InteractiveAntragGraph] Graph returned error state');
      return {
        status: 'error',
        message: result.error || 'Fehler beim Starten der interaktiven Antragserstellung',
        error: result.error
      };
    }

    console.warn('[InteractiveAntragGraph] Graph completed without interrupt - unexpected');
    return {
      status: 'success',
      sessionId: sessionId,
      conversationState: result.conversationState,
      questions: result.questions,
      questionRound: result.questionRound,
      metadata: {
        searchResultsCount: result.searchResults?.results?.length || 0,
        questionCount: result.questions?.length || 0
      }
    };

  } catch (error) {
    // Real error
    console.error('[InteractiveAntragGraph] Initiate error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Starten der interaktiven Antragserstellung',
      error: error.message
    };
  }
}

/**
 * Continue the interactive Antrag flow - Answer Phase
 * This processes user answers and generates final result
 */
export async function continueInteractiveAntrag({
  userId,
  sessionId,
  answers,
  aiWorkerPool,
  req
}) {
  console.log(`[InteractiveAntragGraph] Continuing session: ${sessionId}`);

  try {
    const session = await getExperimentalSession(userId, sessionId);

    if (!session) {
      throw new Error('Session not found or expired');
    }

    await updateExperimentalSession(userId, sessionId, {
      lastAnswers: answers,
      lastUpdated: Date.now()
    });

    const result = await interactiveAntragGraph.invoke(
      new Command({
        resume: answers,
        update: {
          aiWorkerPool,
          req,
          answers: {
            round1: answers
          },
          conversationState: 'answers_received'
        }
      }),
      {
        configurable: { thread_id: sessionId }
      }
    );

    if (result.conversationState === 'completed') {
      return {
        status: 'completed',
        sessionId: sessionId,
        conversationState: result.conversationState,
        finalResult: result.finalResult,
        metadata: result.metadata
      };
    } else if (result.conversationState === 'error') {
      return {
        status: 'error',
        message: result.error || 'Fehler bei der Verarbeitung',
        error: result.error
      };
    } else {
      // Still in progress or unexpected state
      return {
        status: 'in_progress',
        sessionId: sessionId,
        conversationState: result.conversationState,
        message: 'Zwischenstatus erreicht'
      };
    }

  } catch (error) {

    // Real error
    console.error('[InteractiveAntragGraph] Continue error:', error);
    return {
      status: 'error',
      message: 'Fehler beim Fortsetzen der interaktiven Antragserstellung',
      error: error.message
    };
  }
}
