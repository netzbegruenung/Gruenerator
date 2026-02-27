/**
 * Search Streaming Controller
 * SSE-based streaming for normal web search and deep research.
 * Runs WebSearchGraph nodes individually with progress events,
 * then streams AI-generated summaries/dossiers via text_delta events.
 */

import { streamText } from 'ai';

import {
  plannerNode,
  searxngNode,
  intelligentCrawlerNode,
  contentEnricherNode,
  grundsatzNode,
  aggregatorNode,
  extractKeyParagraphs,
  filterDataForAI,
  buildDossierSystemPrompt,
  buildDossierPrompt,
  buildMethodologySection,
} from '../../agents/langgraph/WebSearchGraph/index.js';
import {
  extractLocaleFromRequest,
  localizePlaceholders,
} from '../../services/localization/index.js';
import {
  validateAndInjectCitations,
  normalizeSearchResult,
  dedupeAndDiversify,
  buildReferencesMap,
  summarizeReferencesForPrompt,
} from '../../services/search/index.js';
import { createLogger } from '../../utils/logger.js';
import { getModel } from '../chat/agents/providers.js';
import { createSSEStream } from '../chat/services/sseHelpers.js';

import type {
  WebSearchState,
  SearchOptions,
  SearchResult,
  EnrichedResult,
} from '../../agents/langgraph/WebSearchGraph/types.js';
import type { AuthenticatedRequest } from '../../middleware/types.js';
import type { ReferencesMap } from '../../services/search/types.js';
import type { Response } from 'express';

const log = createLogger('search-stream');

function getUserId(req: AuthenticatedRequest): string {
  return req.user?.id || req.user?.keycloak_id || 'anonymous';
}

function mergeState(state: WebSearchState, partial: Partial<WebSearchState>): WebSearchState {
  return {
    ...state,
    ...partial,
    metadata: { ...state.metadata, ...partial.metadata },
  };
}

// ============================================================================
// Summary prompt builder (mirrors SummaryNode logic)
// ============================================================================

interface SummaryPromptResult {
  systemPrompt: string;
  userPrompt: string;
  references: Array<{
    id: number;
    title: string;
    content: string;
    type: 'primary' | 'supplementary';
    source: string;
  }>;
}

function buildSummaryPrompt(state: WebSearchState): SummaryPromptResult | null {
  let resultsToUse: EnrichedResult[] | SearchResult[] | undefined = state.enrichedResults;
  if (!resultsToUse || resultsToUse.length === 0) {
    const firstWebSearch = state.webResults?.[0];
    resultsToUse = firstWebSearch?.results || [];
  }

  if (!resultsToUse || resultsToUse.length === 0) return null;

  const fullContentResults = (resultsToUse as EnrichedResult[]).filter(
    (r) => r.crawled && r.fullContent
  );
  const snippetResults = (resultsToUse as EnrichedResult[]).filter(
    (r) => !r.crawled || !r.fullContent
  );

  const references: SummaryPromptResult['references'] = [];
  let refIndex = 1;

  for (const result of fullContentResults.slice(0, 3)) {
    const keyContent = extractKeyParagraphs(result.fullContent || result.content, state.query, 400);
    references.push({
      id: refIndex++,
      title: result.title,
      content: keyContent,
      type: 'primary',
      source: result.url,
    });
  }

  for (const result of snippetResults.slice(0, 5)) {
    references.push({
      id: refIndex++,
      title: result.title,
      content: result.snippet || result.content || 'No preview available',
      type: 'supplementary',
      source: result.url,
    });
  }

  if (references.length === 0) return null;

  const referencesText = references
    .map((r) => {
      const typeLabel = r.type === 'primary' ? '(VOLLTEXT)' : '(Snippet)';
      return `[${r.id}] ${r.title} ${typeLabel}: ${r.content.slice(0, 300)}`;
    })
    .join('\n\n');

  const systemPrompt = `Du bist ein Experte für intelligente Web-Zusammenfassungen. Du erhältst sowohl Volltext-Quellen als auch Snippets.

HIERARCHIE:
- VOLLTEXT-Quellen [1-${fullContentResults.length}]: Primärquellen mit vollständigem Inhalt
- Snippet-Quellen [${fullContentResults.length + 1}-${references.length}]: Ergänzende Kurzzusammenfassungen

ANWEISUNGEN:
- MAX. 800 Zeichen (ca. 3-4 Sätze)
- PRIORISIERE Volltext-Quellen für Zitationen
- Verwende [1], [2], [3] für alle wichtigen Aussagen
- NIEMALS "Quelle:", "laut", "nach" - NUR [1], [2], [3]
- Zusammenhängende Absätze, keine Listen

BEISPIEL: "Kommunaler Klimaschutz zeigt konkrete Erfolge [1]. Pop-up-Radwege werden dauerhaft übernommen [2]. Freiburg dient als Vorbild für andere Städte [3]."`;

  const userPrompt = `Erstelle eine präzise Zusammenfassung zu: "${state.query}"

MAX. 800 Zeichen! Fokussiere auf die wichtigsten Erkenntnisse mit [1], [2], [3] Zitationen.

Verfügbare Quellen (VOLLTEXT-Quellen bevorzugen):
${referencesText}

Crawl-Statistik: ${state.crawlMetadata?.crawledUrls || 0} erfolgreich gecrawlt`;

  return { systemPrompt, userPrompt, references };
}

function buildSummaryReferencesMap(references: SummaryPromptResult['references']): ReferencesMap {
  const referencesMap: ReferencesMap = {};
  references.forEach((ref) => {
    referencesMap[String(ref.id)] = {
      title: ref.title,
      snippets: [[ref.content]],
      description: null,
      date: new Date().toISOString(),
      source: ref.type === 'primary' ? 'full_content' : 'web_snippet',
      document_id: `web-${ref.id}`,
      source_url: ref.source,
      filename: null,
      similarity_score: 1.0,
      chunk_index: 0,
      page_number: null,
    };
  });
  return referencesMap;
}

// ============================================================================
// Normal Search Streaming
// ============================================================================

export async function streamNormalSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const sse = createSSEStream(res);
  const abortController = new AbortController();
  const startTime = Date.now();

  req.on('close', () => abortController.abort());

  try {
    const {
      query,
      maxResults = 10,
      language = 'de-DE',
      timeRange,
      safesearch = 0,
      categories = 'general',
    } = req.body;

    const userId = getUserId(req);

    const searchOptions: SearchOptions = {
      maxResults: Math.min(Math.max(1, parseInt(String(maxResults)) || 10), 20),
      language: language || 'de-DE',
      safesearch: Math.min(Math.max(0, parseInt(String(safesearch)) || 0), 2),
      categories: categories || 'general',
      time_range: timeRange,
    };

    let state: WebSearchState = {
      query: query.trim(),
      mode: 'normal',
      user_id: userId,
      searchOptions,
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req,
      metadata: { startTime, searchMode: 'normal' },
    };

    // Step 1: Planner
    sse.sendRaw('progress', {
      stage: 'planning',
      message: 'Optimiere Suchanfrage...',
    });
    state = mergeState(state, await plannerNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 2: SearXNG Search
    sse.sendRaw('progress', {
      stage: 'searching',
      message: 'Durchsuche das Web...',
    });
    state = mergeState(state, await searxngNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 3: Intelligent Crawler
    sse.sendRaw('progress', {
      stage: 'analyzing',
      message: 'Analysiere Quellen...',
    });
    state = mergeState(state, await intelligentCrawlerNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 4: Content Enricher
    sse.sendRaw('progress', {
      stage: 'crawling',
      message: 'Lese relevante Seiten...',
    });
    state = mergeState(state, await contentEnricherNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Get web results for the final response
    const webResultsForResponse = state.webResults?.[0]?.results || [];

    // Step 5: Build prompt and stream summary
    sse.sendRaw('progress', {
      stage: 'generating',
      message: 'Erstelle Zusammenfassung...',
    });

    const promptResult = buildSummaryPrompt(state);

    if (!promptResult) {
      sse.sendRaw('done', {
        content: 'Keine Suchergebnisse zum Zusammenfassen verfügbar.',
        metadata: {
          success: true,
          query: state.query,
          results: webResultsForResponse,
          resultCount: webResultsForResponse.length,
          citations: [],
          sources: [],
          processingTimeMs: Date.now() - startTime,
        },
      });
      sse.end();
      return;
    }

    const { systemPrompt, userPrompt, references } = promptResult;

    // Stream the AI summary
    const model = getModel('litellm', 'gpt-oss:120b');
    const streamResult = streamText({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      maxOutputTokens: 500,
      temperature: 0.2,
      abortSignal: abortController.signal,
    });

    let fullText = '';
    try {
      for await (const chunk of streamResult.textStream) {
        fullText += chunk;
        sse.sendRaw('text_delta', { text: chunk });
      }
    } catch (streamError: unknown) {
      if (abortController.signal.aborted) {
        sse.end();
        return;
      }
      throw streamError;
    }

    // Post-process citations
    const referencesMap = buildSummaryReferencesMap(references);
    const { cleanDraft, citations, sources, errors } = validateAndInjectCitations(
      fullText,
      referencesMap
    );

    if (errors && errors.length > 0) {
      log.warn('[Search Stream] Summary citation errors:', errors);
    }

    const processingTime = Date.now() - startTime;
    log.debug(
      `[Search Stream] Normal search completed: ${webResultsForResponse.length} results, ${processingTime}ms`
    );

    sse.sendRaw('done', {
      content: cleanDraft,
      metadata: {
        success: true,
        query: state.query,
        results: webResultsForResponse,
        resultCount: webResultsForResponse.length,
        citations,
        sources,
        processingTimeMs: processingTime,
      },
    });
    sse.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[Search Stream] Normal search error:', errorMessage);

    if (!sse.isEnded()) {
      sse.sendRaw('error', { error: 'Websuche fehlgeschlagen' });
      sse.end();
    }
  }
}

// ============================================================================
// Deep Research Streaming
// ============================================================================

export async function streamDeepSearch(req: AuthenticatedRequest, res: Response): Promise<void> {
  const sse = createSSEStream(res);
  const abortController = new AbortController();
  const startTime = Date.now();

  req.on('close', () => abortController.abort());

  try {
    const { query } = req.body;
    const userId = getUserId(req);

    let state: WebSearchState = {
      query: query.trim(),
      mode: 'deep',
      user_id: userId,
      searchOptions: { maxResults: 10, language: 'de-DE' },
      aiWorkerPool: req.app.locals.aiWorkerPool,
      req,
      metadata: { startTime, searchMode: 'deep' },
    };

    // Step 1: Planner (generates research questions + subqueries)
    sse.sendRaw('progress', {
      stage: 'planning',
      message: 'Generiere Forschungsfragen...',
    });
    state = mergeState(state, await plannerNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 2: Parallel — SearXNG + Grundsatz search
    sse.sendRaw('progress', {
      stage: 'searching',
      message: 'Durchsuche das Web...',
    });

    const [searxngResult, grundsatzResult] = await Promise.all([
      searxngNode(state),
      grundsatzNode(state),
    ]);
    state = mergeState(state, searxngResult);
    state = mergeState(state, grundsatzResult);

    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    if (state.grundsatzResults?.success) {
      sse.sendRaw('progress', {
        stage: 'documents',
        message: `${state.grundsatzResults.results?.length || 0} Grundsatzprogramm-Ergebnisse gefunden`,
      });
    }

    // Step 3: Intelligent Crawler
    sse.sendRaw('progress', {
      stage: 'crawling',
      message: 'Lese relevante Seiten...',
    });
    state = mergeState(state, await intelligentCrawlerNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 4: Content Enricher
    state = mergeState(state, await contentEnricherNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 5: Aggregator
    sse.sendRaw('progress', {
      stage: 'aggregating',
      message: 'Aggregiere alle Quellen...',
    });
    state = mergeState(state, await aggregatorNode(state));
    if (abortController.signal.aborted) {
      sse.end();
      return;
    }

    // Step 6: Build prompt and stream dossier (replaces dossierNode)
    sse.sendRaw('progress', {
      stage: 'generating',
      message: 'Erstelle Forschungsdossier...',
    });

    // Combine all sources (mirrors DossierNode logic)
    const allSources: any[] = [];

    if (state.aggregatedResults && state.aggregatedResults.length > 0) {
      allSources.push(...state.aggregatedResults.map(normalizeSearchResult));
    }

    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      const normalizedGrundsatz = state.grundsatzResults.results.map((result) => ({
        ...normalizeSearchResult(result),
        source_type: 'official_document',
      }));
      allSources.push(...normalizedGrundsatz);
    }

    if (allSources.length === 0) {
      sse.sendRaw('done', {
        content: 'Keine Quellen für die Deep Research verfügbar.',
        metadata: {
          status: 'success',
          citations: [],
          citationSources: [],
          categorizedSources: state.categorizedSources || {},
          researchQuestions: state.subqueries || [],
          sources: [],
          processingTimeMs: Date.now() - startTime,
        },
      });
      sse.end();
      return;
    }

    const deduplicatedSources = dedupeAndDiversify(allSources, {
      limitPerDoc: 4,
      maxTotal: 12,
    });

    const mappedSources: SearchResult[] = deduplicatedSources.map((source) => ({
      url: source.source_url || '',
      title: source.title,
      content: source.snippet,
      snippet: source.snippet,
      domain: source.source_url ? new URL(source.source_url).hostname : undefined,
      score: source.similarity,
    }));

    const referencesMap = buildReferencesMap(deduplicatedSources);
    const refsSummary = summarizeReferencesForPrompt(referencesMap);

    const locale = extractLocaleFromRequest(state.req);
    const systemPromptBase = localizePlaceholders(buildDossierSystemPrompt(), locale);
    const filteredData = filterDataForAI(
      state.webResults,
      state.aggregatedResults,
      state.grundsatzResults
    );
    const userPromptBase = buildDossierPrompt(state.query, filteredData);

    const enhancedSystemPrompt = `${systemPromptBase}

Verwende NUR die folgenden Quellenreferenzen:
${refsSummary}

WICHTIG: Verwende nur die Referenz-IDs [1], [2], [3] etc. die in der obigen Liste stehen.`;

    const enhancedUserPrompt = `${userPromptBase}

Verwende dabei Quellenangaben [1], [2], [3] etc. bei wichtigen Aussagen.

Verfügbare Quellenreferenzen:
${refsSummary}`;

    // Stream the dossier
    const model = getModel('litellm', 'gpt-oss:120b');
    const streamResult = streamText({
      model,
      messages: [
        { role: 'system', content: enhancedSystemPrompt },
        { role: 'user', content: enhancedUserPrompt },
      ],
      maxOutputTokens: 6000,
      temperature: 0.3,
      abortSignal: abortController.signal,
    });

    let fullText = '';
    try {
      for await (const chunk of streamResult.textStream) {
        fullText += chunk;
        sse.sendRaw('text_delta', { text: chunk });
      }
    } catch (streamError: unknown) {
      if (abortController.signal.aborted) {
        sse.end();
        return;
      }
      throw streamError;
    }

    // Post-process citations
    const { cleanDraft, citations, sources, errors } = validateAndInjectCitations(
      fullText,
      referencesMap
    );

    if (errors && errors.length > 0) {
      log.warn('[Search Stream] Dossier citation errors:', errors);
    }

    // Append methodology section
    const methodologySection = localizePlaceholders(
      buildMethodologySection(
        state.grundsatzResults,
        state.subqueries,
        state.aggregatedResults,
        state.categorizedSources
      ),
      locale
    );

    const completeDossier = cleanDraft + methodologySection;

    const processingTime = Date.now() - startTime;
    log.debug(`[Search Stream] Deep research completed: ${processingTime}ms`);

    sse.sendRaw('done', {
      content: completeDossier,
      metadata: {
        status: 'success',
        citations,
        citationSources: sources,
        categorizedSources: state.categorizedSources || {},
        researchQuestions: state.subqueries || [],
        sources: mappedSources,
        processingTimeMs: processingTime,
      },
    });
    sse.end();
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    log.error('[Search Stream] Deep research error:', errorMessage);

    if (!sse.isEnded()) {
      sse.sendRaw('error', { error: 'Deep Research fehlgeschlagen' });
      sse.end();
    }
  }
}
