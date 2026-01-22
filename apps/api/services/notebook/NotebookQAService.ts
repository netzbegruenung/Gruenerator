/**
 * NotebookQAService - Unified service for all notebook QA operations
 *
 * Single entry point for:
 * - Single collection queries (system or user collections)
 * - Multi-collection queries
 * - Filter handling (both request-based and natural language detected)
 * - Response generation with citations
 *
 * Delegates to:
 * - DocumentSearchService for vector/hybrid search
 * - QueryIntentService for intent and filter detection
 * - SearchResultProcessor for result processing
 * - AI worker pool for draft generation
 */

import { DocumentSearchService } from '../document-services/index.js';
import { queryIntentService } from '../QueryIntentService/QueryIntentService.js';
import { getEnrichedPersonSearchService } from '../bundestag/index.js';
import type { EnrichedPersonSearchResult, PersonProfile, ContentMention, FormattedDrucksache, FormattedAktivitaet } from '../bundestag/types.js';
import {
  expandResultsToChunks,
  deduplicateResults,
  buildReferencesMap,
  validateAndInjectCitations,
  renumberCitationsInOrder,
  filterAndSortResults,
  groupSourcesByCollection
} from '../search/index.js';
import {
  SYSTEM_COLLECTIONS,
  isSystemCollectionId,
  getSystemCollectionConfig,
  buildSystemCollectionObject,
  getDefaultMultiCollectionIds,
  getSearchParams,
  buildSubcategoryFilter
} from '../../config/systemCollectionsConfig.js';
import { buildDraftPromptGrundsatz, buildDraftPromptGeneral, buildFastModePrompt } from '../../agents/langgraph/prompts.js';
import { createLogger } from '../../utils/logger.js';
import type {
  QAMultiCollectionParams,
  QASingleCollectionParams,
  QAResponse,
  Citation,
  SearchParams,
  InternalSearchOptions,
  DocumentScope,
  MultiCollectionMetadata,
  SingleCollectionMetadata,
  PersonQueryMetadata,
  RequestFilters,
  PersonInfo
} from './types.js';
import type { ExpandedChunkResult, SourcesByCollection as SearchSourcesByCollection } from '../search/types.js';

const log = createLogger('NotebookQAService');
const documentSearchService = new DocumentSearchService();

export class NotebookQAService {
  /**
   * Ask a question across multiple system collections
   * @param params - Multi-collection query parameters
   * @returns QA response with answer, citations, sources
   */
  async askMultiCollection({ question, collectionIds, requestFilters, aiWorkerPool, fastMode }: QAMultiCollectionParams): Promise<QAResponse> {
    const startTime = Date.now();
    const trimmedQuestion = (question || '').trim();

    if (!trimmedQuestion) {
      throw new Error('Question is required');
    }

    // Detect document scope and subcategory filters from natural language
    const detectedScope = queryIntentService.detectDocumentScope(trimmedQuestion);
    const documentScope: DocumentScope = {
      collections: detectedScope.collections,
      subcategoryFilters: detectedScope.subcategoryFilters,
      detectedPhrase: detectedScope.detectedPhrase ?? undefined,
      documentTitleFilter: detectedScope.documentTitleFilter ?? undefined
    };
    const effectiveCollectionIds = documentScope.detectedPhrase
      ? documentScope.collections.filter(c => (collectionIds || getDefaultMultiCollectionIds()).includes(c))
      : (collectionIds || getDefaultMultiCollectionIds());

    // Merge request filters with detected filters
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters
    };

    if (Object.keys(effectiveFilters).length > 0) {
      log.debug(`[QA Multi] Subcategory filters: ${JSON.stringify(effectiveFilters)}`);
    }

    // Search all system collections in parallel
    const searchPromises = effectiveCollectionIds.map(collectionId =>
      this._searchCollection(collectionId, trimmedQuestion, documentScope, effectiveFilters)
    );

    const searchResultsArrays = await Promise.all(searchPromises);
    let allResults = searchResultsArrays.flat();

    // Deduplicate and filter
    const dedupedResults = deduplicateResults(allResults, true);
    const sortedResults = filterAndSortResults(dedupedResults, { threshold: 0.35, limit: 40 });

    if (sortedResults.length === 0) {
      return {
        success: true,
        answer: 'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden.',
        citations: [],
        sources: [],
        allSources: [],
        sourcesByCollection: {},
        metadata: this._buildMetadata(startTime, effectiveCollectionIds, documentScope, effectiveFilters, 0, 0, fastMode)
      };
    }

    // Fast mode: skip citation processing entirely
    if (fastMode) {
      const fastAnswer = await this._generateFastDraft(trimmedQuestion, sortedResults, aiWorkerPool);
      return {
        success: true,
        answer: fastAnswer,
        citations: [],
        sources: [],
        allSources: [],
        sourcesByCollection: {},
        metadata: this._buildMetadata(startTime, effectiveCollectionIds, documentScope, effectiveFilters, sortedResults.length, 0, fastMode)
      };
    }

    // Build references and generate draft
    const referencesMap = buildReferencesMap(sortedResults);
    const draft = await this._generateDraft(trimmedQuestion, referencesMap, aiWorkerPool, true);

    // Process citations
    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, referencesMap);
    const { cleanDraft, citations, sources } = validateAndInjectCitations(renumberedDraft, newReferencesMap);

    // Group sources by collection
    const collectionsConfig: Record<string, any> = {};
    for (const id of effectiveCollectionIds) {
      const config = SYSTEM_COLLECTIONS[id];
      if (config) collectionsConfig[id] = config;
    }
    const sourcesByCollection = groupSourcesByCollection(citations, sortedResults, collectionsConfig);

    return {
      success: true,
      answer: cleanDraft,
      citations,
      sources,
      allSources: sortedResults.slice(citations.length, citations.length + 10),
      sourcesByCollection,
      metadata: this._buildMetadata(startTime, effectiveCollectionIds, documentScope, effectiveFilters, sortedResults.length, citations.length, fastMode)
    };
  }

  /**
   * Ask a question to a single collection (system or user)
   * @param params - Single collection query parameters
   * @returns QA response
   */
  async askSingleCollection({ collectionId, question, userId, requestFilters, aiWorkerPool, getCollectionFn, getDocumentIdsFn, fastMode }: QASingleCollectionParams): Promise<QAResponse> {
    const startTime = Date.now();
    const trimmedQuestion = (question || '').trim();

    if (!trimmedQuestion) {
      throw new Error('Question is required');
    }

    // Try enriched person search for bundestagsfraktion collection (skip in fast mode)
    if (collectionId === 'bundestagsfraktion-system' && !fastMode) {
      const personResult = await this._tryEnrichedPersonSearch(trimmedQuestion, aiWorkerPool, startTime);
      if (personResult) {
        const extractedName = 'extractedName' in personResult.metadata ? personResult.metadata.extractedName : 'unknown';
        log.info(`[QA Single] Returning enriched person search result for: ${extractedName || 'unknown'}`);
        return personResult;
      }
    }

    const systemConfig = getSystemCollectionConfig(collectionId);
    const isSystem = !!systemConfig;

    // Get collection details
    let collection: any;
    let documentIds: string[] | undefined;

    if (isSystem) {
      collection = buildSystemCollectionObject(collectionId);
    } else {
      if (!getCollectionFn || !getDocumentIdsFn) {
        throw new Error('getCollectionFn and getDocumentIdsFn required for user collections');
      }
      collection = await getCollectionFn(collectionId);
      if (!collection || (collection.user_id !== userId && collection.user_id !== 'SYSTEM')) {
        throw new Error('Collection not found or access denied');
      }
      documentIds = await getDocumentIdsFn(collectionId);
      if (!documentIds || documentIds.length === 0) {
        throw new Error('No documents found in this collection');
      }
    }

    // Detect filters
    const detectedScopeSingle = queryIntentService.detectDocumentScope(trimmedQuestion);
    const documentScope: DocumentScope = {
      collections: detectedScopeSingle.collections,
      subcategoryFilters: detectedScopeSingle.subcategoryFilters,
      detectedPhrase: detectedScopeSingle.detectedPhrase ?? undefined,
      documentTitleFilter: detectedScopeSingle.documentTitleFilter ?? undefined
    };
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters
    };

    if (Object.keys(effectiveFilters).length > 0) {
      log.debug(`[QA Single] Subcategory filters: ${JSON.stringify(effectiveFilters)}`);
    }

    // Search
    const searchParams = getSearchParams(collectionId);
    const additionalFilter = buildSubcategoryFilter(effectiveFilters);

    const searchResults = await this._performSearch({
      query: trimmedQuestion,
      searchCollection: isSystem ? systemConfig.qdrantCollection : 'documents',
      userId: isSystem ? null : userId,
      documentIds: isSystem ? undefined : documentIds,
      titleFilter: isSystem && collectionId === 'grundsatz-system' ? documentScope.documentTitleFilter : undefined,
      additionalFilter,
      searchParams
    });

    const expanded = expandResultsToChunks(searchResults);
    const deduped = deduplicateResults(expanded, false);
    const sorted = filterAndSortResults(deduped, { threshold: 0.35, limit: 30 });

    if (sorted.length === 0) {
      return {
        success: true,
        answer: `Leider konnte ich in der Sammlung "${collection.name}" keine passenden Stellen zu Ihrer Frage finden.`,
        citations: [],
        sources: [],
        allSources: [],
        metadata: this._buildSingleMetadata(startTime, collectionId, collection.name, effectiveFilters, 0, 0, fastMode)
      };
    }

    // Fast mode: skip citation processing entirely
    if (fastMode) {
      const fastAnswer = await this._generateFastDraft(trimmedQuestion, sorted, aiWorkerPool);
      return {
        success: true,
        answer: fastAnswer,
        citations: [],
        sources: [],
        allSources: [],
        metadata: this._buildSingleMetadata(startTime, collectionId, collection.name, effectiveFilters, sorted.length, 0, fastMode)
      };
    }

    // Generate response
    const referencesMap = buildReferencesMap(sorted);
    const draft = await this._generateDraft(trimmedQuestion, referencesMap, aiWorkerPool, isSystem);

    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, referencesMap);
    const { cleanDraft, citations, sources } = validateAndInjectCitations(renumberedDraft, newReferencesMap);

    const allSources = sorted
      .filter((_, i) => !citations.some(c => c.index === String(i + 1)))
      .slice(0, 10);

    return {
      success: true,
      answer: cleanDraft,
      citations,
      sources,
      allSources,
      metadata: this._buildSingleMetadata(startTime, collectionId, collection.name, effectiveFilters, sorted.length, citations.length, fastMode)
    };
  }

  /**
   * Search a single collection
   */
  private async _searchCollection(collectionId: string, question: string, documentScope: DocumentScope, filters: RequestFilters): Promise<ExpandedChunkResult[]> {
    const config = SYSTEM_COLLECTIONS[collectionId];
    if (!config) {
      log.warn(`[QA] Unknown collection: ${collectionId}`);
      return [];
    }

    const searchParams = getSearchParams(collectionId);
    const titleFilter = collectionId === 'grundsatz-system' ? documentScope.documentTitleFilter : undefined;
    const additionalFilter = buildSubcategoryFilter(filters);

    try {
      const resp = await documentSearchService.search({
        query: question,
        userId: undefined,
        options: {
          limit: searchParams.limit,
          mode: searchParams.mode,
          vectorWeight: searchParams.vectorWeight,
          textWeight: searchParams.textWeight,
          threshold: searchParams.threshold,
          searchCollection: config.qdrantCollection,
          recallLimit: searchParams.recallLimit,
          qualityMin: searchParams.qualityMin,
          titleFilter,
          additionalFilter
        }
      });

      return expandResultsToChunks(resp.results as unknown as Parameters<typeof expandResultsToChunks>[0] || [], collectionId, config.name);
    } catch (error: any) {
      log.error(`[QA] Search error for ${collectionId}:`, error);
      return [];
    }
  }

  /**
   * Perform a search with given parameters
   */
  private async _performSearch({ query, searchCollection, userId, documentIds, titleFilter, additionalFilter, searchParams }: InternalSearchOptions): Promise<any[]> {
    const resp = await documentSearchService.search({
      query,
      userId: userId ?? undefined,
      options: {
        documentIds,
        limit: searchParams.limit,
        mode: searchParams.mode,
        vectorWeight: searchParams.vectorWeight,
        textWeight: searchParams.textWeight,
        threshold: searchParams.threshold,
        searchCollection,
        recallLimit: searchParams.recallLimit,
        qualityMin: searchParams.qualityMin,
        titleFilter,
        additionalFilter
      }
    });

    return resp.results || [];
  }

  /**
   * Generate AI draft with citations
   */
  private async _generateDraft(question: string, referencesMap: Record<string, any>, aiWorkerPool: any, isSystemCollection: boolean): Promise<string> {
    const refsSummary = Object.keys(referencesMap).map(id => {
      const ref = referencesMap[id];
      const snippet = ref.snippets[0]?.[0] || '';
      const short = snippet.slice(0, 150).replace(/\s+/g, ' ').trim();
      const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
      return `${id}. ${collectionTag}${ref.title} — "${short}"`;
    }).join('\n');

    const { system: systemPrompt } = isSystemCollection
      ? buildDraftPromptGrundsatz('Grüne Dokumente')
      : buildDraftPromptGeneral('Ihre Dokumente');

    const userPrompt = `Frage: ${question}\n\nVerfügbare Quellen:\n${refsSummary}`;

    const aiResult = await aiWorkerPool.processRequest({
      type: 'qa_draft',
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      options: { max_tokens: 2500, temperature: 0.2, top_p: 0.8 }
    });

    return aiResult.content || (Array.isArray(aiResult.raw_content_blocks)
      ? aiResult.raw_content_blocks.map((b: any) => b.text || '').join('')
      : '');
  }

  /**
   * Generate fast mode draft without citations
   * Uses simpler prompt and faster model
   */
  private async _generateFastDraft(question: string, results: ExpandedChunkResult[], aiWorkerPool: any): Promise<string> {
    const context = results.slice(0, 15).map(r => {
      const snippet = r.snippet.slice(0, 300).replace(/\s+/g, ' ').trim();
      const collectionTag = r.collection_name ? `[${r.collection_name}] ` : '';
      return `${collectionTag}${r.title}: "${snippet}"`;
    }).join('\n\n');

    const { system: systemPrompt } = buildFastModePrompt();
    const userPrompt = `Frage: ${question}\n\nKontext:\n${context}`;

    const aiResult = await aiWorkerPool.processRequest({
      type: 'qa_draft_fast',
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      options: { max_tokens: 2000, temperature: 0.3, top_p: 0.9 }
    });

    return aiResult.content || (Array.isArray(aiResult.raw_content_blocks)
      ? aiResult.raw_content_blocks.map((b: any) => b.text || '').join('')
      : '');
  }

  /**
   * Build metadata for multi-collection response
   */
  private _buildMetadata(startTime: number, collectionIds: string[], documentScope: DocumentScope, filters: RequestFilters, totalResults: number, citationsCount: number, fastMode?: boolean): MultiCollectionMetadata {
    return {
      response_time_ms: Date.now() - startTime,
      collections_queried: collectionIds,
      document_scope_detected: documentScope.detectedPhrase || null,
      document_title_filter: documentScope.documentTitleFilter || null,
      subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null,
      total_results: totalResults,
      citations_count: citationsCount,
      fast_mode: fastMode || false
    };
  }

  /**
   * Build metadata for single collection response
   */
  private _buildSingleMetadata(startTime: number, collectionId: string, collectionName: string, filters: RequestFilters, totalResults: number, citationsCount: number, fastMode?: boolean): SingleCollectionMetadata {
    return {
      collection_id: collectionId,
      collection_name: collectionName,
      response_time_ms: Date.now() - startTime,
      sources_count: totalResults,
      citations_count: citationsCount,
      subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null,
      fast_mode: fastMode || false
    };
  }

  /**
   * Try enriched person search for MP-related queries
   * Returns formatted QA response if person detected, null otherwise
   */
  private async _tryEnrichedPersonSearch(question: string, aiWorkerPool: any, startTime: number): Promise<QAResponse | null> {
    try {
      const enrichedService = getEnrichedPersonSearchService();
      const result: EnrichedPersonSearchResult = await enrichedService.search(question);

      if (!result.isPersonQuery || !result.person) {
        return null;
      }

      const { person, contentMentions = [], drucksachen = [], aktivitaeten = [], metadata } = result;

      // Generate AI summary using the enriched data
      const contextSummary = enrichedService.generateActivitySummary(result);
      const answer = await this._generatePersonAnswer(question, contextSummary || '', aiWorkerPool);

      // Build citations from the enriched sources
      const citations = this._buildPersonCitations(contentMentions, drucksachen, aktivitaeten);

      const personMetadata: PersonQueryMetadata = {
        collection_id: 'bundestagsfraktion-system',
        collection_name: 'Bundestagsfraktion',
        response_time_ms: Date.now() - startTime,
        sources_count: citations.length,
        citations_count: citations.length,
        subcategory_filters_applied: null,
        extractedName: metadata?.extractedName,
        detectionConfidence: metadata?.detectionConfidence || 0,
        detectionSource: metadata?.detectionSource,
        contentMentionsCount: metadata?.contentMentionsCount || 0,
        drucksachenCount: metadata?.drucksachenCount || 0,
        aktivitaetenCount: metadata?.aktivitaetenCount || 0
      };

      return {
        success: true,
        answer,
        citations,
        sources: citations.slice(0, 5),
        allSources: citations.slice(5, 15),
        isPersonQuery: true,
        person: {
          name: person.name,
          fraktion: person.fraktion,
          wahlkreis: person.wahlkreis,
          biografie: person.biografie
        },
        metadata: personMetadata
      };
    } catch (error: any) {
      log.error('[QA] Enriched person search failed:', error);
      return null;
    }
  }

  /**
   * Generate AI answer for person query using enriched context
   */
  private async _generatePersonAnswer(question: string, contextSummary: string, aiWorkerPool: any): Promise<string> {
    const systemPrompt = `Du bist ein Experte für die Grüne Bundestagsfraktion. Beantworte Fragen über Abgeordnete basierend auf den bereitgestellten Informationen. Antworte auf Deutsch, präzise und sachlich. Wenn du Informationen aus den Quellen verwendest, zitiere sie mit [1], [2] etc.`;

    const userPrompt = `Frage: ${question}\n\nKontext über die Person:\n${contextSummary}`;

    const aiResult = await aiWorkerPool.processRequest({
      type: 'qa_draft',
      messages: [{ role: 'user', content: userPrompt }],
      systemPrompt,
      options: { max_tokens: 2000, temperature: 0.3, top_p: 0.9 }
    });

    return aiResult.content || (Array.isArray(aiResult.raw_content_blocks)
      ? aiResult.raw_content_blocks.map((b: any) => b.text || '').join('')
      : '');
  }

  /**
   * Build citations from enriched person search results
   */
  private _buildPersonCitations(contentMentions: ContentMention[], drucksachen: FormattedDrucksache[], aktivitaeten: FormattedAktivitaet[]): Citation[] {
    const citations: Citation[] = [];
    let index = 1;

    // Add content mentions (gruene-bundestag.de)
    for (const mention of (contentMentions || []).slice(0, 5)) {
      citations.push({
        index: String(index++),
        title: mention.title,
        url: mention.url,
        snippet: mention.snippet,
        source: 'gruene-bundestag.de',
        type: 'content_mention'
      });
    }

    // Add Drucksachen (Anträge etc.)
    for (const drucksache of (drucksachen || []).slice(0, 5)) {
      citations.push({
        index: String(index++),
        title: drucksache.titel,
        url: `https://dip.bundestag.de/drucksache/${drucksache.dokumentnummer}`,
        snippet: `${drucksache.drucksachetyp} ${drucksache.dokumentnummer} vom ${drucksache.datum}`,
        source: 'DIP Bundestag',
        type: 'drucksache'
      });
    }

    // Add Aktivitäten (Reden, Anfragen)
    for (const aktivitaet of (aktivitaeten || []).slice(0, 5)) {
      citations.push({
        index: String(index++),
        title: aktivitaet.titel || aktivitaet.aktivitaetsart,
        url: null,
        snippet: `${aktivitaet.aktivitaetsart} vom ${aktivitaet.datum}`,
        source: 'DIP Bundestag',
        type: 'aktivitaet'
      });
    }

    return citations;
  }
}

export const notebookQAService = new NotebookQAService();
