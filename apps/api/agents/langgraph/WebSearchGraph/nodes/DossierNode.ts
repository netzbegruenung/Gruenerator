/**
 * Dossier Node for WebSearchGraph
 * Generates comprehensive research dossier (deep mode only)
 */

import {
  normalizeSearchResult,
  dedupeAndDiversify,
  buildReferencesMap,
  summarizeReferencesForPrompt,
  validateAndInjectCitations,
} from '../../../../services/search/index.js';
import { filterDataForAI } from '../utilities/dataFilter.js';
import {
  buildDossierSystemPrompt,
  buildDossierPrompt,
  buildMethodologySection,
} from '../utilities/dossierBuilder.js';

import type { WebSearchState, Citation, ResearchDossier, SearchResult } from '../types.js';

/**
 * Dossier Node: Generate comprehensive research dossier with citations
 */
export async function dossierNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  if (state.mode !== 'deep') {
    return { dossier: null };
  }

  console.log('[WebSearchGraph] Generating comprehensive research dossier with citations');

  try {
    // Combine all sources for citation reference building
    const allSources: any[] = [];

    // Add web search results
    if (state.aggregatedResults && state.aggregatedResults.length > 0) {
      const normalizedWebSources = state.aggregatedResults.map(normalizeSearchResult);
      allSources.push(...normalizedWebSources);
    }

    // Add Grundsatz document results
    if (state.grundsatzResults?.success && state.grundsatzResults.results?.length > 0) {
      const normalizedGrundsatzSources = state.grundsatzResults.results.map((result) => ({
        ...normalizeSearchResult(result),
        source_type: 'official_document',
      }));
      allSources.push(...normalizedGrundsatzSources);
    }

    if (allSources.length === 0) {
      return {
        dossier: {
          query: state.query,
          executiveSummary: 'Keine Quellen für die Deep Research verfügbar.',
          detailedAnalysis: '',
          methodology: '',
          sources: [],
        } as ResearchDossier,
        metadata: { ...state.metadata, dossierGenerated: false },
      };
    }

    // Deduplicate and limit sources for citations
    const deduplicatedSources = dedupeAndDiversify(allSources, {
      limitPerDoc: 4,
      maxTotal: 12,
    });

    // Map ExpandedChunkResult to SearchResult format for dossier
    const mappedSources: SearchResult[] = deduplicatedSources.map((source) => ({
      url: source.source_url || '',
      title: source.title,
      content: source.snippet,
      snippet: source.snippet,
      domain: source.source_url ? new URL(source.source_url).hostname : undefined,
      score: source.similarity,
    }));

    // Build references map for citations
    const referencesMap = buildReferencesMap(deduplicatedSources);
    const refsSummary = summarizeReferencesForPrompt(referencesMap);

    // Get system and user prompts
    const systemPrompt = buildDossierSystemPrompt();
    const filteredData = filterDataForAI(
      state.webResults,
      state.aggregatedResults,
      state.grundsatzResults
    );
    const userPrompt = buildDossierPrompt(state.query, filteredData);

    // Enhanced dossier prompt with citations
    const enhancedSystemPrompt = `${systemPrompt}

Verwende NUR die folgenden Quellenreferenzen:
${refsSummary}

WICHTIG: Verwende nur die Referenz-IDs [1], [2], [3] etc. die in der obigen Liste stehen.`;

    const enhancedUserPrompt = `${userPrompt}

Verwende dabei Quellenangaben [1], [2], [3] etc. bei wichtigen Aussagen.

Verfügbare Quellenreferenzen:
${refsSummary}`;

    const result = await state.aiWorkerPool.processRequest(
      {
        type: 'text_adjustment',
        systemPrompt: enhancedSystemPrompt,
        messages: [{ role: 'user', content: enhancedUserPrompt }],
        options: {
          provider: 'litellm',
          model: 'gpt-oss:120b',
          max_tokens: 6000,
          temperature: 0.3,
        },
      },
      state.req
    );

    if (!result.success) {
      throw new Error(result.error);
    }

    // Process the AI response for citations
    const { cleanDraft, citations, sources, errors } = validateAndInjectCitations(
      result.content,
      referencesMap
    );

    // Log citation validation errors if any
    if (errors && errors.length > 0) {
      console.warn('[WebSearchGraph] Dossier citation validation errors:', errors);
    }

    // Add methodology section (without citations)
    const methodologySection = buildMethodologySection(
      state.grundsatzResults,
      state.subqueries,
      state.aggregatedResults,
      state.categorizedSources
    );

    const completeDossier = cleanDraft + methodologySection;

    console.log('[WebSearchGraph] Dossier generation with citations completed');

    return {
      dossier: {
        query: state.query,
        executiveSummary: cleanDraft.split('\n\n')[0] || '',
        detailedAnalysis: cleanDraft,
        methodology: methodologySection,
        sources: mappedSources,
      } as ResearchDossier,
      referencesMap,
      citations,
      citationSources: sources,
      metadata: {
        ...state.metadata,
        dossierGenerated: true,
        dossierLength: completeDossier.length,
        citationsCount: citations?.length || 0,
        sourcesCount: sources?.length || 0,
        citationErrors: errors?.length || 0,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Dossier generation error:', errorMessage);
    return {
      dossier: {
        query: state.query,
        executiveSummary: `Fehler bei der Deep Research: ${errorMessage}`,
        detailedAnalysis: '',
        methodology: '',
        sources: [],
      } as ResearchDossier,
      error: `Dossier generation failed: ${errorMessage}`,
      metadata: { ...state.metadata, dossierGenerated: false },
    };
  }
}
