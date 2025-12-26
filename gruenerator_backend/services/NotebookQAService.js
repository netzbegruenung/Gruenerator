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

import { DocumentSearchService } from './DocumentSearchService.js';
import { queryIntentService } from './QueryIntentService.js';
import { getEnrichedPersonSearchService } from './EnrichedPersonSearchService.js';
import {
    expandResultsToChunks,
    deduplicateResults,
    buildReferencesMap,
    validateAndInjectCitations,
    renumberCitationsInOrder,
    filterAndSortResults,
    groupSourcesByCollection
} from './SearchResultProcessor.js';
import {
    SYSTEM_COLLECTIONS,
    isSystemCollectionId,
    getSystemCollectionConfig,
    buildSystemCollectionObject,
    getDefaultMultiCollectionIds,
    getSearchParams,
    buildSubcategoryFilter
} from '../config/systemCollectionsConfig.js';
import { buildDraftPromptGrundsatz, buildDraftPromptGeneral } from '../agents/langgraph/prompts.mjs';
import { createLogger } from '../utils/logger.js';

const log = createLogger('NotebookQAService');
const documentSearchService = new DocumentSearchService();

class NotebookQAService {
    /**
     * Ask a question across multiple system collections
     * @param {Object} params
     * @param {string} params.question - The user's question
     * @param {string[]} [params.collectionIds] - Collection IDs to search (defaults to all system collections)
     * @param {Object} [params.requestFilters] - Filters from request body
     * @param {Object} params.aiWorkerPool - AI worker pool for draft generation
     * @returns {Promise<Object>} QA response with answer, citations, sources
     */
    async askMultiCollection({ question, collectionIds, requestFilters, aiWorkerPool }) {
        const startTime = Date.now();
        const trimmedQuestion = (question || '').trim();

        if (!trimmedQuestion) {
            throw new Error('Question is required');
        }

        // Detect document scope and subcategory filters from natural language
        const documentScope = queryIntentService.detectDocumentScope(trimmedQuestion);
        const effectiveCollectionIds = documentScope.detectedPhrase
            ? documentScope.collections.filter(c => (collectionIds || getDefaultMultiCollectionIds()).includes(c))
            : (collectionIds || getDefaultMultiCollectionIds());

        // Merge request filters with detected filters
        const effectiveFilters = {
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
                metadata: this._buildMetadata(startTime, effectiveCollectionIds, documentScope, effectiveFilters, 0, 0)
            };
        }

        // Build references and generate draft
        const referencesMap = buildReferencesMap(sortedResults);
        const draft = await this._generateDraft(trimmedQuestion, referencesMap, aiWorkerPool, true);

        // Process citations
        const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, referencesMap);
        const { cleanDraft, citations, sources } = validateAndInjectCitations(renumberedDraft, newReferencesMap);

        // Group sources by collection
        const collectionsConfig = {};
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
            metadata: this._buildMetadata(startTime, effectiveCollectionIds, documentScope, effectiveFilters, sortedResults.length, citations.length)
        };
    }

    /**
     * Ask a question to a single collection (system or user)
     * @param {Object} params
     * @param {string} params.collectionId - Collection ID
     * @param {string} params.question - The user's question
     * @param {string} params.userId - User ID for user collections
     * @param {Object} [params.requestFilters] - Filters from request body
     * @param {Object} params.aiWorkerPool - AI worker pool for draft generation
     * @param {Function} [params.getCollectionFn] - Function to get user collection details
     * @param {Function} [params.getDocumentIdsFn] - Function to get document IDs for user collection
     * @returns {Promise<Object>} QA response
     */
    async askSingleCollection({ collectionId, question, userId, requestFilters, aiWorkerPool, getCollectionFn, getDocumentIdsFn }) {
        const startTime = Date.now();
        const trimmedQuestion = (question || '').trim();

        if (!trimmedQuestion) {
            throw new Error('Question is required');
        }

        // Try enriched person search for bundestagsfraktion collection
        if (collectionId === 'bundestagsfraktion-system') {
            const personResult = await this._tryEnrichedPersonSearch(trimmedQuestion, aiWorkerPool, startTime);
            if (personResult) {
                log.info(`[QA Single] Returning enriched person search result for: ${personResult.metadata?.extractedName || 'unknown'}`);
                return personResult;
            }
        }

        const systemConfig = getSystemCollectionConfig(collectionId);
        const isSystem = !!systemConfig;

        // Get collection details
        let collection;
        let documentIds;

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
        const documentScope = queryIntentService.detectDocumentScope(trimmedQuestion);
        const effectiveFilters = {
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
                metadata: this._buildSingleMetadata(startTime, collectionId, collection.name, effectiveFilters, 0, 0)
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
            metadata: this._buildSingleMetadata(startTime, collectionId, collection.name, effectiveFilters, sorted.length, citations.length)
        };
    }

    /**
     * Search a single collection
     */
    async _searchCollection(collectionId, question, documentScope, filters) {
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
                user_id: null,
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
            });

            return expandResultsToChunks(resp.results || [], collectionId, config.name);
        } catch (error) {
            log.error(`[QA] Search error for ${collectionId}:`, error);
            return [];
        }
    }

    /**
     * Perform a search with given parameters
     */
    async _performSearch({ query, searchCollection, userId, documentIds, titleFilter, additionalFilter, searchParams }) {
        const resp = await documentSearchService.search({
            query,
            user_id: userId,
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
        });

        return resp.results || [];
    }

    /**
     * Generate AI draft with citations
     */
    async _generateDraft(question, referencesMap, aiWorkerPool, isSystemCollection) {
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
            ? aiResult.raw_content_blocks.map(b => b.text || '').join('')
            : '');
    }

    /**
     * Build metadata for multi-collection response
     */
    _buildMetadata(startTime, collectionIds, documentScope, filters, totalResults, citationsCount) {
        return {
            response_time_ms: Date.now() - startTime,
            collections_queried: collectionIds,
            document_scope_detected: documentScope.detectedPhrase || null,
            document_title_filter: documentScope.documentTitleFilter || null,
            subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null,
            total_results: totalResults,
            citations_count: citationsCount
        };
    }

    /**
     * Build metadata for single collection response
     */
    _buildSingleMetadata(startTime, collectionId, collectionName, filters, totalResults, citationsCount) {
        return {
            collection_id: collectionId,
            collection_name: collectionName,
            response_time_ms: Date.now() - startTime,
            sources_count: totalResults,
            citations_count: citationsCount,
            subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null
        };
    }

    /**
     * Try enriched person search for MP-related queries
     * Returns formatted QA response if person detected, null otherwise
     */
    async _tryEnrichedPersonSearch(question, aiWorkerPool, startTime) {
        try {
            const enrichedService = getEnrichedPersonSearchService();
            const result = await enrichedService.search(question);

            if (!result.isPersonQuery) {
                return null;
            }

            const { person, contentMentions, drucksachen, aktivitaeten, metadata } = result;

            // Generate AI summary using the enriched data
            const contextSummary = enrichedService.generateActivitySummary(result);
            const answer = await this._generatePersonAnswer(question, contextSummary, aiWorkerPool);

            // Build citations from the enriched sources
            const citations = this._buildPersonCitations(contentMentions, drucksachen, aktivitaeten);

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
                metadata: {
                    collection_id: 'bundestagsfraktion-system',
                    collection_name: 'Bundestagsfraktion',
                    response_time_ms: Date.now() - startTime,
                    sources_count: citations.length,
                    citations_count: citations.length,
                    extractedName: metadata.extractedName,
                    detectionConfidence: metadata.detectionConfidence,
                    detectionSource: metadata.detectionSource,
                    contentMentionsCount: metadata.contentMentionsCount,
                    drucksachenCount: metadata.drucksachenCount,
                    aktivitaetenCount: metadata.aktivitaetenCount
                }
            };
        } catch (error) {
            log.error('[QA] Enriched person search failed:', error);
            return null;
        }
    }

    /**
     * Generate AI answer for person query using enriched context
     */
    async _generatePersonAnswer(question, contextSummary, aiWorkerPool) {
        const systemPrompt = `Du bist ein Experte für die Grüne Bundestagsfraktion. Beantworte Fragen über Abgeordnete basierend auf den bereitgestellten Informationen. Antworte auf Deutsch, präzise und sachlich. Wenn du Informationen aus den Quellen verwendest, zitiere sie mit [1], [2] etc.`;

        const userPrompt = `Frage: ${question}\n\nKontext über die Person:\n${contextSummary}`;

        const aiResult = await aiWorkerPool.processRequest({
            type: 'qa_draft',
            messages: [{ role: 'user', content: userPrompt }],
            systemPrompt,
            options: { max_tokens: 2000, temperature: 0.3, top_p: 0.9 }
        });

        return aiResult.content || (Array.isArray(aiResult.raw_content_blocks)
            ? aiResult.raw_content_blocks.map(b => b.text || '').join('')
            : '');
    }

    /**
     * Build citations from enriched person search results
     */
    _buildPersonCitations(contentMentions, drucksachen, aktivitaeten) {
        const citations = [];
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
export { NotebookQAService };
