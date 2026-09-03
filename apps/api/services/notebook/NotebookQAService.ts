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

import {
  buildDraftPromptGrundsatz,
  buildDraftPromptGeneral,
  buildFastModePrompt,
} from '../../agents/langgraph/prompts.js';
import { env } from '../../config/env.js';
import {
  applyDepthProfile,
  getNotebookDepthProfile,
  type NotebookDepthProfile,
} from '../../config/notebookDepthProfiles.js';
import {
  SYSTEM_COLLECTIONS,
  getSystemCollectionConfig,
  buildSystemCollectionObject,
  getDefaultMultiCollectionIds,
  getSearchParams,
  buildSubcategoryFilter,
  applyDefaultFilter,
  type SubcategoryFilters,
} from '../../config/systemCollectionsConfig.js';
import { checkNotebookAccess } from '../../routes/notebook/notebookAccess.js';
import { createLogger } from '../../utils/logger.js';
import { aiText } from '../ai/generate.js';
import { getEnrichedPersonSearchService } from '../bundestag/index.js';
import { DocumentSearchService } from '../document-services/index.js';
import { queryIntentService } from '../QueryIntentService/QueryIntentService.js';
import { type QdrantFilter } from '../QueryIntentService/types.js';
import { buildContextSummary } from '../search/contextSummary.js';
import {
  expandResultsToChunks,
  deduplicateResults,
  buildReferencesMap,
  validateAndInjectCitations,
  renumberCitationsInOrder,
  filterAndSortResults,
  selectAcrossQueryGroups,
  sourceTextForPrompt,
  splitCompositeQuestion,
  toClientSource,
  groupSourcesByCollection,
  formatDe,
} from '../search/index.js';

import { inspectCorpusState } from './corpusState.js';

import type { CorpusStateInspection } from './corpusState.js';
import type {
  QAMultiCollectionParams,
  QASingleCollectionParams,
  QAResponse,
  Citation,
  InternalSearchOptions,
  DocumentScope,
  MultiCollectionMetadata,
  SingleCollectionMetadata,
  PersonQueryMetadata,
  RequestFilters,
  SearchContext,
  GetSearchContextParams,
} from './types.js';
import type {
  EnrichedPersonSearchResult,
  ContentMention,
  FormattedDrucksache,
  FormattedAktivitaet,
} from '../bundestag/types.js';
import type {
  SearchResultInput,
  CollectionConfig,
  ReferencesMap,
  ExpandedChunkResult,
} from '../search/types.js';

const log = createLogger('NotebookQAService');
const documentSearchService = new DocumentSearchService();

/**
 * Engt eine Suche auf EIN Programm der Sammlung `grundsatz_documents` ein.
 *
 * `primary_category` und nicht `title`, und das ist die Reparatur eines
 * gemessenen Totalausfalls: der Titelfilter setzte einen EXAKTEN Match mit
 * einem PRÄFIX des gespeicherten Titels ('Grundsatzprogramm 2020' gegen
 * 'Grundsatzprogramm 2020 – Veränderung schafft Halt'). Am 19.08.2026 live
 * gegen Qdrant nachgezählt: alle drei Muster trafen 0 von 968 Punkten, jede
 * programm-namentliche Notebook-Frage bekam eine Geisterantwort — während
 * dieselbe Sammlung der Chat-Oberfläche ungefiltert 90 Treffer lieferte.
 *
 * `primary_category` ist in `systemCollectionsConfig` als filterbar deklariert,
 * in Qdrant indiziert und partitioniert die Sammlung vollständig
 * (231/402/335 = 968). Der Titel ist Prosa und ändert sich mit dem Untertitel;
 * die Kategorie ist der stabile Schlüssel.
 */
function withProgramFilter(
  filter: QdrantFilter | undefined,
  primaryCategory: string | null | undefined
): QdrantFilter | undefined {
  if (!primaryCategory) return filter;
  const clause = { key: 'primary_category', match: { value: primaryCategory } };
  return {
    ...(filter ?? {}),
    must: [...(filter?.must ?? []), clause],
  } as QdrantFilter;
}

/**
 * Per-source budget for the fast-mode prompt. Smaller than
 * PROMPT_SOURCE_MAX_CHARS because fast mode packs 15 sources and answers
 * briefly — but still the matched passage, not the chunk's opening.
 */
const FAST_DRAFT_SOURCE_MAX_CHARS = 900;

export class NotebookQAService {
  /**
   * Ask a question across multiple system collections
   * @param params - Multi-collection query parameters
   * @returns QA response with answer, citations, sources
   */
  async askMultiCollection({
    question,
    collectionIds,
    requestFilters,
    fastMode,
  }: QAMultiCollectionParams): Promise<QAResponse> {
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
      ...(detectedScope.detectedPhrase && { detectedPhrase: detectedScope.detectedPhrase }),
      ...(detectedScope.documentCategoryFilter && {
        documentCategoryFilter: detectedScope.documentCategoryFilter,
      }),
    };
    const effectiveCollectionIds = documentScope.detectedPhrase
      ? documentScope.collections.filter((c) =>
          (collectionIds || getDefaultMultiCollectionIds()).includes(c)
        )
      : collectionIds || getDefaultMultiCollectionIds();

    // Merge request filters with detected filters
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters,
    };

    if (Object.keys(effectiveFilters).length > 0) {
      log.debug(`[QA Multi] Subcategory filters: ${JSON.stringify(effectiveFilters)}`);
    }

    // Search all system collections in parallel
    // Extract per-collection filters: if requestFilters contains keys matching collection IDs,
    // those are per-collection filter overrides (e.g. { "hamburg-system": { content_type: ["presse"] } })
    const searchPromises = effectiveCollectionIds.map((collectionId) => {
      const filtersForCollection = this._extractCollectionFilters(
        collectionId,
        effectiveFilters,
        effectiveCollectionIds
      );
      return this._searchCollection(
        collectionId,
        trimmedQuestion,
        documentScope,
        filtersForCollection
      );
    });

    const searchResultsArrays = await Promise.all(searchPromises);
    const allResults = searchResultsArrays.flat();

    // Deduplicate and filter
    const dedupedResults = deduplicateResults(allResults, true);
    const sortedResults = filterAndSortResults(dedupedResults, { threshold: 0.35, limit: 40 });

    if (sortedResults.length === 0) {
      return {
        success: true,
        answer:
          'Leider konnte ich in den verfügbaren Quellen keine passenden Informationen zu Ihrer Frage finden.',
        citations: [],
        sources: [],
        allSources: [],
        sourcesByCollection: {},
        metadata: this._buildMetadata(
          startTime,
          effectiveCollectionIds,
          documentScope,
          effectiveFilters,
          0,
          0,
          fastMode
        ),
      };
    }

    // Fast mode: skip citation processing entirely
    if (fastMode) {
      const fastAnswer = await this._generateFastDraft(trimmedQuestion, sortedResults);
      return {
        success: true,
        answer: fastAnswer,
        citations: [],
        sources: [],
        allSources: [],
        sourcesByCollection: {},
        metadata: this._buildMetadata(
          startTime,
          effectiveCollectionIds,
          documentScope,
          effectiveFilters,
          sortedResults.length,
          0,
          fastMode
        ),
      };
    }

    // Build references and generate draft
    const referencesMap = buildReferencesMap(sortedResults);
    const draft = await this._generateDraft(trimmedQuestion, referencesMap, true);

    // Process citations
    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, referencesMap);
    const { cleanDraft, citations, sources } = validateAndInjectCitations(
      renumberedDraft,
      newReferencesMap
    );

    // Group sources by collection
    const collectionsConfig: { [collectionId: string]: CollectionConfig } = {};
    for (const id of effectiveCollectionIds) {
      const config = SYSTEM_COLLECTIONS[id];
      if (config) collectionsConfig[id] = { name: config.name };
    }
    const sourcesByCollection = groupSourcesByCollection(
      citations,
      sortedResults,
      collectionsConfig
    );

    return {
      success: true,
      answer: cleanDraft,
      citations,
      sources,
      allSources: sortedResults.slice(citations.length, citations.length + 10).map(toClientSource),
      sourcesByCollection,
      metadata: this._buildMetadata(
        startTime,
        effectiveCollectionIds,
        documentScope,
        effectiveFilters,
        sortedResults.length,
        citations.length,
        fastMode
      ),
    };
  }

  /**
   * Ask a question to a single collection (system or user)
   * @param params - Single collection query parameters
   * @returns QA response
   */
  async askSingleCollection({
    collectionId,
    question,
    userId,
    requestFilters,
    getCollectionFn,
    getDocumentIdsFn,
    fastMode,
  }: QASingleCollectionParams): Promise<QAResponse> {
    const startTime = Date.now();
    const trimmedQuestion = (question || '').trim();

    if (!trimmedQuestion) {
      throw new Error('Question is required');
    }

    // Try enriched person search for bundestagsfraktion collection (skip in fast mode)
    if (collectionId === 'bundestagsfraktion-system' && !fastMode) {
      const personResult = await this._tryEnrichedPersonSearch(trimmedQuestion, startTime);
      if (personResult) {
        const extractedName =
          'extractedName' in personResult.metadata
            ? personResult.metadata.extractedName
            : 'unknown';
        log.info(
          `[QA Single] Returning enriched person search result for: ${extractedName || 'unknown'}`
        );
        return personResult;
      }
    }

    const systemConfig = getSystemCollectionConfig(collectionId);
    const isSystem = !!systemConfig;

    // Get collection details
    let collection: { name: string; user_id: string | null } | null;
    let documentIds: string[] | undefined;

    if (isSystem) {
      collection = buildSystemCollectionObject(collectionId);
    } else {
      if (!getCollectionFn || !getDocumentIdsFn) {
        throw new Error('getCollectionFn and getDocumentIdsFn required for user collections');
      }
      collection = await getCollectionFn(collectionId);
      if (!collection) {
        throw new Error('Collection not found or access denied');
      }
      // SYSTEM-owned rows bypass the user-scoped check (built-in collections
      // surfaced under user-collection plumbing). Everything else goes through
      // the canonical access predicate, which honours owner / share_mode='authenticated'
      // (+ group memberships when applicable).
      if (collection.user_id !== 'SYSTEM') {
        const access = await checkNotebookAccess(collectionId, userId ?? null);
        if (!access.canRead) {
          throw new Error('Collection not found or access denied');
        }
      }
      documentIds = await getDocumentIdsFn(collectionId);
      if (!documentIds || documentIds.length === 0) {
        throw new Error('No documents found in this collection');
      }
    }

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Detect filters
    const detectedScopeSingle = queryIntentService.detectDocumentScope(trimmedQuestion);
    const documentScope: DocumentScope = {
      collections: detectedScopeSingle.collections,
      subcategoryFilters: detectedScopeSingle.subcategoryFilters,
      ...(detectedScopeSingle.detectedPhrase && {
        detectedPhrase: detectedScopeSingle.detectedPhrase,
      }),
      ...(detectedScopeSingle.documentCategoryFilter && {
        documentCategoryFilter: detectedScopeSingle.documentCategoryFilter,
      }),
    };
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters,
    };

    // Search
    const searchParams = getSearchParams(collectionId);
    const subcategoryFilter = buildSubcategoryFilter(effectiveFilters as SubcategoryFilters);
    const additionalFilter = isSystem
      ? applyDefaultFilter(collectionId, subcategoryFilter)
      : subcategoryFilter;

    if (Object.keys(effectiveFilters).length > 0) {
      log.info(
        `[QA Single] collection=${collectionId} filters=${JSON.stringify(effectiveFilters)} qdrantMust=${additionalFilter?.must?.length ?? 0} clauses`
      );
    }

    const searchResults = await this._performSearch({
      query: trimmedQuestion,
      searchCollection: isSystem ? systemConfig.qdrantCollection : 'documents',
      userId: isSystem ? null : userId,
      documentIds: isSystem ? undefined : documentIds,
      additionalFilter: withProgramFilter(
        additionalFilter,
        isSystem && collectionId === 'grundsatz-system'
          ? documentScope.documentCategoryFilter
          : undefined
      ),
      searchParams,
    });

    const collectionName = systemConfig?.name || collection?.name || collectionId;
    const expanded = expandResultsToChunks(searchResults, collectionId, collectionName as string);

    // Post-filter: validate results match requested source_id filter (defense-in-depth)
    const postFiltered = this._applySourceIdPostFilter(expanded, effectiveFilters);

    const deduped = deduplicateResults(postFiltered, false);
    // User collections (!isSystem) may use upload `created_at` as a real date;
    // system collections rank on `published_at` only (their created_at is index
    // time). Recency is a mild secondary factor — quality stays decisive.
    const sorted = filterAndSortResults(deduped, {
      threshold: 0.35,
      limit: 30,
      allowCreatedAt: !isSystem,
    });

    if (sorted.length === 0) {
      const corpus =
        !isSystem && documentIds ? await inspectCorpusState(documentIds, userId) : null;
      const answer = this._buildEmptyResultMessage(collection.name, corpus);
      return {
        success: true,
        answer,
        citations: [],
        sources: [],
        allSources: [],
        metadata: this._buildSingleMetadata(
          startTime,
          collectionId,
          collection.name,
          effectiveFilters,
          0,
          0,
          fastMode,
          corpus
        ),
      };
    }

    // Fast mode: skip citation processing entirely
    if (fastMode) {
      const fastAnswer = await this._generateFastDraft(trimmedQuestion, sorted);
      return {
        success: true,
        answer: fastAnswer,
        citations: [],
        sources: [],
        allSources: [],
        metadata: this._buildSingleMetadata(
          startTime,
          collectionId,
          collection.name,
          effectiveFilters,
          sorted.length,
          0,
          fastMode
        ),
      };
    }

    // Generate response
    const referencesMap = buildReferencesMap(sorted, { allowCreatedAt: !isSystem });
    const draft = await this._generateDraft(trimmedQuestion, referencesMap, isSystem);

    const { renumberedDraft, newReferencesMap } = renumberCitationsInOrder(draft, referencesMap);
    const { cleanDraft, citations, sources } = validateAndInjectCitations(
      renumberedDraft,
      newReferencesMap
    );

    const allSources = sorted
      .filter((_, i) => !citations.some((c) => c.index === String(i + 1)))
      .slice(0, 10)
      .map(toClientSource);

    return {
      success: true,
      answer: cleanDraft,
      citations,
      sources,
      allSources,
      metadata: this._buildSingleMetadata(
        startTime,
        collectionId,
        collection.name,
        effectiveFilters,
        sorted.length,
        citations.length,
        fastMode
      ),
    };
  }

  /**
   * Get search context for streaming - performs vector search and builds context
   * without generating the AI answer. Used by streaming endpoints.
   *
   * @param params - Search context parameters
   * @returns Search context with references map, system prompt, and context summary
   */
  async getSearchContext({
    question,
    collectionId,
    collectionIds,
    userId,
    requestFilters,
    depth,
    queries,
    getCollectionFn,
    getDocumentIdsFn,
  }: GetSearchContextParams): Promise<SearchContext | null> {
    const trimmedQuestion = (question || '').trim();

    if (!trimmedQuestion) {
      throw new Error('Question is required');
    }

    log.debug(
      '[NotebookQA] getSearchContext requestFilters:',
      JSON.stringify(requestFilters),
      'collectionId:',
      collectionId,
      'collectionIds:',
      collectionIds
    );

    const profile = getNotebookDepthProfile(depth ?? 'deep');

    // Two different things get searched here, and they are grouped differently
    // because they mean different things.
    //
    // Paraphrases are rewordings of ONE question — a thoroughness dial, capped
    // by the depth tier. They share a group: ranking them against each other by
    // score is exactly right, and giving each its own fair share would let a
    // weak hit from a worse rewording take a slot from a stronger hit of the
    // best one.
    //
    // Sub-questions are different questions and get a group each. They are not
    // a thoroughness dial and so do not sit under the tier's variant cap: a
    // message asking eight things has to be searched as eight things in every
    // tier, or the parts that no single averaged embedding lands near come back
    // unanswered.
    const paraphrases = (queries?.length ? queries : [trimmedQuestion]).slice(
      0,
      profile.queryVariants
    );
    const subQuestions = splitCompositeQuestion(trimmedQuestion).filter(
      (q) => !paraphrases.includes(q)
    );
    // The full message leads the first group, so the holistic search is never
    // given up even when the message decomposes cleanly.
    const queryGroups = [paraphrases, ...subQuestions.map((q) => [q])];

    if (subQuestions.length > 0) {
      log.info(
        `[NotebookQA] composite question split into ${subQuestions.length} sub-questions (${paraphrases.length + subQuestions.length} searches total)`
      );
    }

    const isMulti = !!collectionIds && collectionIds.length > 0;

    if (isMulti) {
      return this._getMultiCollectionSearchContext(
        trimmedQuestion,
        collectionIds!,
        requestFilters,
        profile,
        queryGroups
      );
    } else if (collectionId) {
      return this._getSingleCollectionSearchContext(
        trimmedQuestion,
        collectionId,
        userId,
        requestFilters,
        profile,
        queryGroups,
        getCollectionFn,
        getDocumentIdsFn
      );
    }

    throw new Error('Either collectionId or collectionIds must be provided');
  }

  /**
   * Get search context for multi-collection streaming
   */
  private async _getMultiCollectionSearchContext(
    question: string,
    collectionIds: string[],
    requestFilters: RequestFilters | undefined,
    profile: NotebookDepthProfile,
    /** One group per retrieval angle; group 0 holds the paraphrases. */
    queryGroups: string[][]
  ): Promise<SearchContext | null> {
    // Detect document scope and subcategory filters from natural language
    const detectedScope = queryIntentService.detectDocumentScope(question);
    const documentScope: DocumentScope = {
      collections: detectedScope.collections,
      subcategoryFilters: detectedScope.subcategoryFilters,
      ...(detectedScope.detectedPhrase && { detectedPhrase: detectedScope.detectedPhrase }),
      ...(detectedScope.documentCategoryFilter && {
        documentCategoryFilter: detectedScope.documentCategoryFilter,
      }),
    };

    const effectiveCollectionIds = documentScope.detectedPhrase
      ? documentScope.collections.filter((c) => collectionIds.includes(c))
      : collectionIds;

    // Merge request filters with detected filters
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters,
    };

    // Search every collection × every query formulation in parallel, keeping
    // the hits grouped per query so selectAcrossQueryGroups can give each one
    // its share of the budget.
    const resultsByGroup = await Promise.all(
      queryGroups.map(async (group) => {
        const perQuery = await Promise.all(
          group.flatMap((q) =>
            effectiveCollectionIds.map((cId) =>
              this._searchCollection(
                cId,
                q,
                documentScope,
                this._extractCollectionFilters(cId, effectiveFilters, effectiveCollectionIds),
                profile
              )
            )
          )
        );
        return deduplicateResults(perQuery.flat(), true);
      })
    );

    const sortedResults = selectAcrossQueryGroups(resultsByGroup, {
      threshold: profile.threshold,
      limit: profile.sortLimit.multi,
      maxPerDocument: env.NOTEBOOK_MAX_CHUNKS_PER_DOC,
    });

    if (sortedResults.length === 0) {
      return null;
    }

    // Build references map and context
    const referencesMap = buildReferencesMap(sortedResults);
    const { systemPrompt, contextSummary } = this._buildStreamingContext(referencesMap, true);

    return {
      referencesMap,
      sortedResults,
      systemPrompt,
      contextSummary,
      isMulti: true,
      effectiveCollectionIds,
      documentScope,
      effectiveFilters,
    };
  }

  /**
   * Get search context for single-collection streaming
   */
  private async _getSingleCollectionSearchContext(
    question: string,
    collectionId: string,
    userId: string | undefined,
    requestFilters: RequestFilters | undefined,
    profile: NotebookDepthProfile,
    /** One group per retrieval angle; group 0 holds the paraphrases. */
    queryGroups: string[][],
    getCollectionFn?: (id: string) => Promise<{ name: string; user_id: string | null } | null>,
    getDocumentIdsFn?: (id: string) => Promise<string[]>
  ): Promise<SearchContext | null> {
    const systemConfig = getSystemCollectionConfig(collectionId);
    const isSystem = !!systemConfig;

    // Get collection details
    let collection: { name: string; user_id: string | null } | null;
    let documentIds: string[] | undefined;

    if (isSystem) {
      collection = buildSystemCollectionObject(collectionId);
    } else {
      if (!getCollectionFn || !getDocumentIdsFn) {
        throw new Error('getCollectionFn and getDocumentIdsFn required for user collections');
      }
      collection = await getCollectionFn(collectionId);
      if (!collection) {
        throw new Error('Collection not found or access denied');
      }
      // SYSTEM-owned rows bypass the user-scoped check (built-in collections
      // surfaced under user-collection plumbing). Everything else goes through
      // the canonical access predicate, which honours owner / share_mode='authenticated'
      // (+ group memberships when applicable).
      if (collection.user_id !== 'SYSTEM') {
        const access = await checkNotebookAccess(collectionId, userId ?? null);
        if (!access.canRead) {
          throw new Error('Collection not found or access denied');
        }
      }
      documentIds = await getDocumentIdsFn(collectionId);
      if (!documentIds || documentIds.length === 0) {
        throw new Error('No documents found in this collection');
      }
    }

    if (!collection) {
      throw new Error(`Collection not found: ${collectionId}`);
    }

    // Detect filters
    const detectedScopeSingle = queryIntentService.detectDocumentScope(question);
    const documentScope: DocumentScope = {
      collections: detectedScopeSingle.collections,
      subcategoryFilters: detectedScopeSingle.subcategoryFilters,
      ...(detectedScopeSingle.detectedPhrase && {
        detectedPhrase: detectedScopeSingle.detectedPhrase,
      }),
      ...(detectedScopeSingle.documentCategoryFilter && {
        documentCategoryFilter: detectedScopeSingle.documentCategoryFilter,
      }),
    };
    const effectiveFilters: RequestFilters = {
      ...documentScope.subcategoryFilters,
      ...requestFilters,
    };

    // Search
    const searchParams = applyDepthProfile(getSearchParams(collectionId), profile);
    const subcategoryFilter = buildSubcategoryFilter(effectiveFilters as SubcategoryFilters);
    const additionalFilter = isSystem
      ? applyDefaultFilter(collectionId, subcategoryFilter)
      : subcategoryFilter;

    if (Object.keys(effectiveFilters).length > 0) {
      log.info(
        `[QA Stream] collection=${collectionId} filters=${JSON.stringify(effectiveFilters)} qdrantMust=${additionalFilter?.must?.length ?? 0} clauses`
      );
    }

    const singleCollectionName = systemConfig?.name || collection?.name || collectionId;

    // Grouped per query, not flattened — see selectAcrossQueryGroups.
    const resultsByGroup = await Promise.all(
      queryGroups.map(async (group) => {
        const perQuery = await Promise.all(
          group.map(async (q) => {
            const searchResults = await this._performSearch({
              query: q,
              searchCollection: isSystem ? systemConfig.qdrantCollection : 'documents',
              userId: isSystem ? null : (userId ?? null),
              documentIds: isSystem ? undefined : documentIds,
              additionalFilter: withProgramFilter(
                additionalFilter,
                isSystem && collectionId === 'grundsatz-system'
                  ? documentScope.documentCategoryFilter
                  : undefined
              ),
              searchParams,
            });

            const expanded = expandResultsToChunks(
              searchResults,
              collectionId,
              singleCollectionName
            );
            // Post-filter: validate results match requested source_id filter
            // (defense-in-depth)
            return this._applySourceIdPostFilter(expanded, effectiveFilters);
          })
        );
        return deduplicateResults(perQuery.flat(), false);
      })
    );

    const sortedResults = selectAcrossQueryGroups(resultsByGroup, {
      threshold: profile.threshold,
      limit: profile.sortLimit.single,
      allowCreatedAt: !isSystem,
      maxPerDocument: env.NOTEBOOK_MAX_CHUNKS_PER_DOC,
    });

    if (sortedResults.length === 0) {
      return null;
    }

    // Build references map and context
    const referencesMap = buildReferencesMap(sortedResults, { allowCreatedAt: !isSystem });
    const { systemPrompt, contextSummary } = this._buildStreamingContext(referencesMap, isSystem);

    return {
      referencesMap,
      sortedResults,
      systemPrompt,
      contextSummary,
      collectionName: collection?.name ?? collectionId,
      isMulti: false,
      effectiveCollectionIds: [collectionId],
      documentScope,
      effectiveFilters,
    };
  }

  /**
   * Build system prompt and context summary for streaming
   */
  private _buildStreamingContext(
    referencesMap: ReferencesMap,
    isSystemCollection: boolean
  ): { systemPrompt: string; contextSummary: string } {
    const contextSummary = buildContextSummary(referencesMap);

    const { system: systemPrompt } = isSystemCollection
      ? buildDraftPromptGrundsatz('Grüne Dokumente')
      : buildDraftPromptGeneral('Ihre Dokumente');

    return { systemPrompt, contextSummary };
  }

  /**
   * Search a single collection
   */
  private async _searchCollection(
    collectionId: string,
    question: string,
    documentScope: DocumentScope,
    filters: RequestFilters,
    profile?: NotebookDepthProfile
  ): Promise<ExpandedChunkResult[]> {
    const config = SYSTEM_COLLECTIONS[collectionId];
    if (!config) {
      log.warn(`[QA] Unknown collection: ${collectionId}`);
      return [];
    }

    const searchParams = applyDepthProfile(getSearchParams(collectionId), profile);
    const subcategoryFilter = buildSubcategoryFilter(filters as SubcategoryFilters);
    const additionalFilter = withProgramFilter(
      applyDefaultFilter(collectionId, subcategoryFilter),
      collectionId === 'grundsatz-system' ? documentScope.documentCategoryFilter : undefined
    );

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
          additionalFilter,
        },
      });

      const expanded = expandResultsToChunks(resp.results || [], collectionId, config.name);

      // Post-filter: validate results match requested source_id filter (defense-in-depth)
      return this._applySourceIdPostFilter(expanded, filters);
    } catch (error: unknown) {
      log.error(`[QA] Search error for ${collectionId}:`, error);
      return [];
    }
  }

  /**
   * Post-filter: validate results match requested source_id filter.
   * Defense-in-depth — catches any leakage from Qdrant or hybrid search edge cases.
   */
  private _applySourceIdPostFilter(
    results: ExpandedChunkResult[],
    filters: RequestFilters
  ): ExpandedChunkResult[] {
    const sourceIdFilter = filters.source_id;
    if (!sourceIdFilter) return results;

    const allowedSourceIds = (
      Array.isArray(sourceIdFilter) ? sourceIdFilter : [sourceIdFilter]
    ) as string[];

    const before = results.length;
    const filtered = results.filter((r) => !r.source_id || allowedSourceIds.includes(r.source_id));
    if (filtered.length < before) {
      console.warn(
        `[NotebookQA] Post-filter removed ${before - filtered.length} results ` +
          `not matching source_id: ${JSON.stringify(allowedSourceIds)}`
      );
    }
    return filtered;
  }

  /**
   * Extract the appropriate filters for a specific collection from a combined filter object.
   *
   * When the frontend sends per-collection filters in multi-mode, the filter object may contain
   * keys that are collection IDs mapping to that collection's specific filters:
   *   { "hamburg-system": { "content_type": ["presse"] }, "grundsatz-system": { "primary_category": ["Klima"] } }
   *
   * This method separates collection-ID-keyed entries from flat filter fields,
   * then merges the flat filters with the collection-specific overrides.
   */
  private _extractCollectionFilters(
    collectionId: string,
    filters: RequestFilters,
    allCollectionIds: string[]
  ): RequestFilters {
    const collectionIdSet = new Set(allCollectionIds);
    // Also check SYSTEM_COLLECTIONS keys for collection IDs not in the active set
    const allSystemIds = new Set(Object.keys(SYSTEM_COLLECTIONS));

    const flatFilters: RequestFilters = {};
    let perCollectionFilters: RequestFilters | null = null;

    for (const [key, value] of Object.entries(filters)) {
      if (collectionIdSet.has(key) || allSystemIds.has(key)) {
        // This key is a collection ID — it's a per-collection filter entry
        if (key === collectionId && value && typeof value === 'object' && !Array.isArray(value)) {
          perCollectionFilters = value as RequestFilters;
        }
        // Skip other collections' filters
      } else {
        // Regular flat filter field (e.g., primary_category, content_type)
        flatFilters[key] = value;
      }
    }

    if (perCollectionFilters) {
      return { ...flatFilters, ...perCollectionFilters };
    }

    return flatFilters;
  }

  /**
   * Perform a search with given parameters
   */
  private async _performSearch({
    query,
    searchCollection,
    userId,
    documentIds,
    additionalFilter,
    searchParams,
  }: InternalSearchOptions): Promise<SearchResultInput[]> {
    const resp = await documentSearchService.search({
      query,
      ...(userId != null && { userId }),
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
        additionalFilter,
      },
    });

    return resp.results || [];
  }

  /**
   * Generate AI draft with citations
   */
  private async _generateDraft(
    question: string,
    referencesMap: ReferencesMap,
    isSystemCollection: boolean
  ): Promise<string> {
    const refKeys = Object.keys(referencesMap);
    const refsSummary = refKeys
      .map((id) => {
        const ref = referencesMap[id];
        const text = sourceTextForPrompt(ref);
        const collectionTag = ref.collection_name ? `[${ref.collection_name}] ` : '';
        const dateLabel = formatDe(ref.date);
        const datePart = dateLabel ? `(Datum: ${dateLabel}) ` : '';
        return `${id}. ${collectionTag}${datePart}${ref.title} — "${text}"`;
      })
      .join('\n');

    const { system: systemPrompt } = isSystemCollection
      ? buildDraftPromptGrundsatz('Grüne Dokumente')
      : buildDraftPromptGeneral('Ihre Dokumente');

    const validIds = refKeys.join(', ');
    const today = new Date().toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const userPrompt = `Heutiges Datum: ${today}\n\nFrage: ${question}\n\nGültige Quellen-IDs: ${validIds}\nVerwende AUSSCHLIESSLICH diese IDs für Quellenangaben.\n\nVerfügbare Quellen:\n${refsSummary}`;

    return aiText({
      lane: 'qa_draft',
      prompt: userPrompt,
      system: systemPrompt,
      temperature: 0.2,
      topP: 0.8,
    });
  }

  /**
   * Generate fast mode draft without citations
   * Uses simpler prompt and faster model
   */
  private async _generateFastDraft(
    question: string,
    results: ExpandedChunkResult[]
  ): Promise<string> {
    const context = results
      .slice(0, 15)
      .map((r) => {
        // Same reason as sourceTextForPrompt: `snippet` is the chunk's opening
        // 300 characters on a semantic hit, so answering from it reproduces
        // exactly the "not in the sources" failure this path is supposed to
        // avoid. Fast mode gets a smaller budget, not a worse excerpt.
        const text = (r.chunk_text || r.snippet)
          .slice(0, FAST_DRAFT_SOURCE_MAX_CHARS)
          .replace(/\s+/g, ' ')
          .trim();
        const collectionTag = r.collection_name ? `[${r.collection_name}] ` : '';
        const dateLabel = formatDe(r.published_at ?? r.date ?? null);
        const datePart = dateLabel ? `(Datum: ${dateLabel}) ` : '';
        return `${collectionTag}${datePart}${r.title}: "${text}"`;
      })
      .join('\n\n');

    const today = new Date().toLocaleDateString('de-DE', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const { system: systemPrompt } = buildFastModePrompt();
    const userPrompt = `Heutiges Datum: ${today}\n\nFrage: ${question}\n\nKontext:\n${context}`;

    return aiText({
      lane: 'qa_draft_fast',
      prompt: userPrompt,
      system: systemPrompt,
      temperature: 0.3,
      topP: 0.9,
    });
  }

  /**
   * Build metadata for multi-collection response
   */
  private _buildMetadata(
    startTime: number,
    collectionIds: string[],
    documentScope: DocumentScope,
    filters: RequestFilters,
    totalResults: number,
    citationsCount: number,
    fastMode?: boolean
  ): MultiCollectionMetadata {
    return {
      response_time_ms: Date.now() - startTime,
      collections_queried: collectionIds,
      document_scope_detected: documentScope.detectedPhrase || null,
      // Der Drahtname bleibt `document_title_filter` — er steht im
      // Notebook-Contract und ist damit extern eingefroren. Der Wert ist seit
      // der Reparatur die `primary_category` des gemeinten Programms; die
      // Diagnose („auf welches Dokument wurde eingegrenzt") ist dieselbe.
      document_title_filter: documentScope.documentCategoryFilter || null,
      subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null,
      total_results: totalResults,
      citations_count: citationsCount,
      fast_mode: fastMode || false,
    };
  }

  /**
   * Build metadata for single collection response
   */
  private _buildSingleMetadata(
    startTime: number,
    collectionId: string,
    collectionName: string,
    filters: RequestFilters,
    totalResults: number,
    citationsCount: number,
    fastMode?: boolean,
    corpus?: CorpusStateInspection | null
  ): SingleCollectionMetadata {
    return {
      collection_id: collectionId,
      collection_name: collectionName,
      response_time_ms: Date.now() - startTime,
      sources_count: totalResults,
      citations_count: citationsCount,
      subcategory_filters_applied: Object.keys(filters).length > 0 ? filters : null,
      fast_mode: fastMode || false,
      ...(corpus && {
        corpus_state: corpus.state,
        corpus_state_detail: {
          indexing_count: corpus.indexing.length,
          failed_count: corpus.failed.length,
          stale_count: corpus.stale.length,
          ready_count: corpus.ready.length,
          total_count: corpus.total,
        },
      }),
    };
  }

  private _buildEmptyResultMessage(
    collectionName: string,
    corpus: CorpusStateInspection | null
  ): string {
    if (corpus && corpus.indexing.length > 0) {
      const total = corpus.total || corpus.indexing.length;
      return (
        `Die Dokumente in der Sammlung "${collectionName}" werden gerade indexiert ` +
        `(${corpus.ready.length}/${total} bereit). ` +
        `Bitte probier es in ein bis zwei Minuten erneut.`
      );
    }
    if (corpus && corpus.stale.length > 0) {
      const total = corpus.total || corpus.stale.length;
      return (
        `Für ${corpus.stale.length} von ${total} Dokumenten in "${collectionName}" fehlt der ` +
        `Suchindex — die Dokumente sind noch da, aber nicht durchsuchbar. Das ist ein Fehler auf ` +
        `unserer Seite und liegt nicht an deiner Frage. Lade die betroffenen Dateien erneut hoch ` +
        `oder melde dich, damit wir den Index neu aufbauen.`
      );
    }
    if (corpus && corpus.failed.length > 0) {
      const names = corpus.failed
        .map((d) => d.title)
        .filter((t): t is string => !!t)
        .slice(0, 3);
      const namePart = names.length > 0 ? ` (${names.join(', ')})` : '';
      return (
        `Bei der Verarbeitung von ${corpus.failed.length} Dokument(en)${namePart} ist ein Fehler aufgetreten. ` +
        `Bitte lade die betroffenen Dateien erneut hoch.`
      );
    }
    return `Leider konnte ich in der Sammlung "${collectionName}" keine passenden Stellen zu deiner Frage finden.`;
  }

  /**
   * Try enriched person search for MP-related queries
   * Returns formatted QA response if person detected, null otherwise
   */
  private async _tryEnrichedPersonSearch(
    question: string,
    startTime: number
  ): Promise<QAResponse | null> {
    try {
      const enrichedService = getEnrichedPersonSearchService();
      const result: EnrichedPersonSearchResult = await enrichedService.search(question);

      if (!result.isPersonQuery || !result.person) {
        return null;
      }

      const {
        person,
        contentMentions = [],
        drucksachen = [],
        aktivitaeten = [],
        metadata,
      } = result;

      // Generate AI summary using the enriched data
      const contextSummary = enrichedService.generateActivitySummary(result);
      const answer = await this._generatePersonAnswer(question, contextSummary || '');

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
        aktivitaetenCount: metadata?.aktivitaetenCount || 0,
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
          biografie: person.biografie,
        },
        metadata: personMetadata,
      };
    } catch (error: unknown) {
      log.error('[QA] Enriched person search failed:', error);
      return null;
    }
  }

  /**
   * Generate AI answer for person query using enriched context
   */
  private async _generatePersonAnswer(question: string, contextSummary: string): Promise<string> {
    const systemPrompt = `Du bist ein Experte für die Grüne Bundestagsfraktion. Beantworte Fragen über Abgeordnete basierend auf den bereitgestellten Informationen. Antworte auf Deutsch, präzise und sachlich. Wenn du Informationen aus den Quellen verwendest, zitiere sie mit [1], [2] etc.`;

    const userPrompt = `Frage: ${question}\n\nKontext über die Person:\n${contextSummary}`;

    return aiText({
      lane: 'qa_draft',
      prompt: userPrompt,
      system: systemPrompt,
      temperature: 0.3,
      topP: 0.9,
    });
  }

  /**
   * Build citations from enriched person search results
   */
  private _buildPersonCitations(
    contentMentions: ContentMention[],
    drucksachen: FormattedDrucksache[],
    aktivitaeten: FormattedAktivitaet[]
  ): Citation[] {
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
        type: 'content_mention',
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
        type: 'drucksache',
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
        type: 'aktivitaet',
      });
    }

    return citations;
  }
}

export const notebookQAService = new NotebookQAService();
