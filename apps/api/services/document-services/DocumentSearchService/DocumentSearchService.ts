/**
 * DocumentSearchService - Unified document vector search service
 *
 * Merges vectorSearchService and qdrantDocumentService functionality.
 * Extends BaseSearchService for shared utilities and template methods.
 *
 * Key Responsibilities:
 * - Document vector storage and retrieval
 * - Semantic search using vector embeddings
 * - Hybrid search combining vector and text
 * - Document text reconstruction from chunks
 * - User statistics and management
 */

import { isSystemQdrantCollection } from '../../../config/systemCollectionsConfig.js';
import { vectorConfig } from '../../../config/vectorConfig.js';
import { QdrantOperations } from '../../../database/services/QdrantOperations.js';
import { getQdrantInstance } from '../../../database/services/QdrantService.js';
import { InputValidator } from '../../../utils/validation/index.js';
import { BaseSearchService } from '../../BaseSearchService/index.js';
import { mistralEmbeddingService } from '../../mistral/index.js';

import * as docRetrieval from './documentRetrieval.js';
import * as scoring from './scoring.js';
import * as searchOps from './searchOperations.js';
import * as vectorOps from './vectorOperations.js';

import type {
  DocumentSearchParams,
  DocumentSearchOptions,
  HybridConfig,
  ChunkWithMetadata,
  VectorMetadata,
  VectorStoreResult,
  SearchUserDocumentsOptions,
  UserDocumentSearchResult,
  DeleteResult,
  UserVectorStats,
  DocumentFullTextResult,
  DocumentChunksResult,
  ChunkWithContextResult,
  InspectDocumentChunksResult,
  BulkDocumentResult,
  FirstChunksResult,
  BundestagSearchOptions,
  BundestagSearchResult,
  DocumentRawChunk,
  DocumentChunkData,
  DocumentTransformedChunk,
  DocumentEnhancedScore,
  FindSimilarChunksParams,
  FindHybridChunksParams,
  QdrantFilter,
} from './types.js';
import type { QdrantFilter as QdrantServiceFilter } from '../../../database/services/QdrantService/types.js';
import type { QdrantService } from '../../../database/services/QdrantService.js';
import type { SearchParamsInput } from '../../../utils/validation/types.js';
import type { SearchParams, SearchResponse, DocumentData } from '../../BaseSearchService/types.js';

/**
 * Main DocumentSearchService class
 *
 * Provides comprehensive document search and management functionality
 * with support for vector, text, and hybrid search modes.
 */
// System collection mapping - maps collection IDs to Qdrant collection names
const SYSTEM_COLLECTION_MAP: Record<string, string> = {
  'grundsatz-system': 'grundsatz_documents',
  'bundestagsfraktion-system': 'bundestag_content',
  'gruene-de-system': 'gruene_de_documents',
  'oesterreich-gruene-system': 'oesterreich_gruene_documents',
  'kommunalwiki-system': 'kommunalwiki_documents',
  'gruene-at-system': 'gruene_at_documents',
  'boell-stiftung-system': 'boell_stiftung_documents',
  'satzungen-system': 'satzungen_documents',
  'hamburg-system': 'landesverbaende_documents',
  wahlprogramm: 'wahlprogramm_documents',
  // Fallback shortened names
  grundsatz: 'grundsatz_documents',
  bundestag: 'bundestag_content',
  gruene_de: 'gruene_de_documents',
};

export class DocumentSearchService extends BaseSearchService {
  private qdrant: QdrantService;
  private qdrantOps: QdrantOperations | null;
  private initialized: boolean;
  private qdrantAvailable: boolean;
  private hybridConfig: HybridConfig;

  constructor() {
    super({
      serviceName: 'DocumentSearch',
      defaultLimit: 5,
      defaultThreshold: 0.3,
    });

    this.qdrant = getQdrantInstance();
    this.qdrantOps = null;
    this.initialized = false;
    this.qdrantAvailable = false;
    this.hybridConfig = vectorConfig.get('hybrid');
  }

  /**
   * Initialize service and Qdrant operations
   *
   * Ensures Qdrant client is connected and operations are ready.
   * Called automatically before search operations.
   */
  async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      await this.qdrant.init();
      this.qdrantAvailable = !!this.qdrant?.client && !!this.qdrant?.isConnected;

      if (this.qdrantAvailable && this.qdrant.client) {
        this.qdrantOps = new QdrantOperations(this.qdrant.client);
      } else {
        console.warn(
          '[DocumentSearchService] Qdrant not available; vector searches will be skipped'
        );
        this.qdrantOps = null;
      }
      this.initialized = true;
    }
  }

  /**
   * Validate and normalize search parameters
   *
   * Supports both flat and nested parameter structures for backward compatibility.
   * Handles system collection searches that don't require user ID.
   *
   * @param params - Raw search parameters
   * @returns Validated and normalized parameters
   */
  override validateSearchParams(params: SearchParams): DocumentSearchParams {
    const p = params as unknown as Record<string, unknown>;
    const pFilters = p.filters as Record<string, unknown> | undefined;
    const pOptions = p.options as Record<string, unknown> | undefined;
    if (p && (p.userId || pFilters || pOptions)) {
      const query = InputValidator.validateSearchQuery(p.query);
      const searchCollection = (pFilters?.searchCollection || pOptions?.searchCollection) as
        string | undefined;
      const isSystemSearch =
        typeof searchCollection === 'string' && isSystemQdrantCollection(searchCollection);
      const userId =
        isSystemSearch && (p.userId === null || p.userId === undefined)
          ? null
          : InputValidator.validateUserId(p.userId as string);

      const documentIds =
        pFilters?.documentIds || pOptions?.documentIds
          ? InputValidator.validateDocumentIds(pFilters?.documentIds || pOptions?.documentIds)
          : undefined;
      const sourceType = pFilters?.sourceType as string | undefined;
      const group_id = pFilters?.group_id as string | undefined;
      const titleFilter = (pFilters?.titleFilter || pOptions?.titleFilter) as string | undefined;
      const additionalFilter = (pFilters?.additionalFilter || pOptions?.additionalFilter) as
        QdrantFilter | undefined;

      const limit = InputValidator.validateNumber(pOptions?.limit || this.defaultLimit, 'limit', {
        min: 1,
        max: 100,
      });
      const threshold = InputValidator.validateNumber(pOptions?.threshold, 'threshold', {
        min: 0,
        max: 1,
        allowNull: true,
      });

      // `mode` and `recallLimit` have to survive: search() routes on the former,
      // so dropping it downgraded every caller taking this branch to vector-only.
      // The flat and legacy branches below always carried both.
      const validatedOptions = {
        limit: limit ?? this.defaultLimit,
        threshold: threshold ?? this.defaultThreshold,
        useCache: pOptions?.useCache !== false,
        mode: pOptions?.mode as DocumentSearchParams['options']['mode'],
        vectorWeight: pOptions?.vectorWeight as number | undefined,
        textWeight: pOptions?.textWeight as number | undefined,
        useRRF: pOptions?.useRRF as boolean | undefined,
        rrfK: pOptions?.rrfK as number | undefined,
        qualityMin: typeof pOptions?.qualityMin === 'number' ? pOptions.qualityMin : undefined,
        ...(typeof pOptions?.recallLimit === 'number' ? { recallLimit: pOptions.recallLimit } : {}),
        ...(pOptions?.rerankChunks === true && { rerankChunks: true }),
      };

      return {
        query,
        userId,
        filters: {
          documentIds,
          sourceType,
          group_id,
          searchCollection,
          titleFilter,
          additionalFilter,
        },
        options: validatedOptions,
      };
    }

    const isSystemCollection =
      p && typeof p.searchCollection === 'string' && isSystemQdrantCollection(p.searchCollection);
    if (isSystemCollection && (p.user_id === null || p.user_id === undefined)) {
      const query = InputValidator.validateSearchQuery(p.query);
      const limit = InputValidator.validateNumber(p.limit || this.defaultLimit, 'limit', {
        min: 1,
        max: 100,
      });
      const threshold = InputValidator.validateNumber(p.threshold, 'threshold', {
        min: 0,
        max: 1,
        allowNull: true,
      });
      let documentIds;
      if (p.documentIds) {
        documentIds = InputValidator.validateDocumentIds(p.documentIds);
      }
      let vectorWeightOpt;
      let textWeightOpt;
      try {
        if (typeof p.vectorWeight === 'number') {
          vectorWeightOpt = InputValidator.validateNumber(p.vectorWeight, 'vectorWeight', {
            min: 0,
            max: 1,
          });
        }
        if (typeof p.textWeight === 'number') {
          textWeightOpt = InputValidator.validateNumber(p.textWeight, 'textWeight', {
            min: 0,
            max: 1,
          });
        }
      } catch (_e) {
        // ignore invalid weights
      }
      return {
        query,
        userId: null,
        filters: {
          documentIds,
          sourceType: p.sourceType as string | undefined,
          group_id: p.group_id as string | undefined,
          searchCollection: p.searchCollection as string | undefined,
          titleFilter: p.titleFilter as string | undefined,
          additionalFilter: p.additionalFilter as QdrantFilter | undefined,
        },
        options: {
          limit: limit ?? this.defaultLimit,
          threshold: threshold ?? this.defaultThreshold,
          useCache: true,
          mode: p.mode as DocumentSearchParams['options']['mode'],
          ...(typeof vectorWeightOpt === 'number' && { vectorWeight: vectorWeightOpt }),
          ...(typeof textWeightOpt === 'number' && { textWeight: textWeightOpt }),
          ...(typeof p.qualityMin === 'number' ? { qualityMin: p.qualityMin } : {}),
          ...(typeof p.recallLimit === 'number' ? { recallLimit: p.recallLimit } : {}),
        },
      };
    }

    const validated = InputValidator.validateSearchParams(p as unknown as SearchParamsInput);
    let vectorWeightOpt;
    let textWeightOpt;
    try {
      if (typeof p.vectorWeight === 'number') {
        vectorWeightOpt = InputValidator.validateNumber(p.vectorWeight, 'vectorWeight', {
          min: 0,
          max: 1,
        });
      }
      if (typeof p.textWeight === 'number') {
        textWeightOpt = InputValidator.validateNumber(p.textWeight, 'textWeight', {
          min: 0,
          max: 1,
        });
      }
    } catch (_e) {
      // ignore
    }
    return {
      query: validated.query,
      userId: validated.user_id,
      filters: {
        documentIds: validated.documentIds,
        sourceType: validated.sourceType,
        group_id: validated.group_id,
        searchCollection: p.searchCollection as string | undefined,
        titleFilter: p.titleFilter as string | undefined,
        additionalFilter: p.additionalFilter as QdrantFilter | undefined,
      },
      options: {
        limit: validated.limit,
        threshold: validated.threshold ?? this.defaultThreshold,
        useCache: true,
        mode: validated.mode,
        ...(typeof vectorWeightOpt === 'number' && { vectorWeight: vectorWeightOpt }),
        ...(typeof textWeightOpt === 'number' && { textWeight: textWeightOpt }),
        ...(typeof p.qualityMin === 'number' ? { qualityMin: p.qualityMin } : {}),
        ...(typeof p.recallLimit === 'number' ? { recallLimit: p.recallLimit } : {}),
      },
    };
  }

  /**
   * Main search method - implements BaseSearchService template
   *
   * Routes to appropriate search mode based on options:
   * - 'hybrid': Combined vector and text search
   * - 'vector': Semantic similarity search (default)
   * - 'text': Keyword-only search
   *
   * @param searchParams - Search parameters
   * @returns Search response with ranked results
   */
  override async search(searchParams: SearchParams): Promise<SearchResponse> {
    try {
      await this.ensureInitialized();

      const validated = this.validateSearchParams(searchParams);
      const mode = validated.options?.mode || 'vector';

      if (mode === 'hybrid') {
        console.log('[DocumentSearchService] Executing hybrid search mode');
        return await this.performHybridSearch(validated as SearchParams);
      }

      if (mode === 'text' || mode === 'keyword') {
        console.log('[DocumentSearchService] Executing full-text search mode');
        return await this.performTextOnlySearch(validated as SearchParams);
      }

      return await this.performSimilaritySearch(validated as SearchParams);
    } catch (error) {
      const _errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DocumentSearchService] Search error:', error);
      return this.createErrorResponse(error as Error, searchParams.query);
    }
  }

  /**
   * Full-text (keyword-only) search routed from {@link search} for `mode: 'text'`.
   *
   * Mirrors performSimilaritySearch's param extraction so that
   * searchCollection + additionalFilter (Landesverband scoping for system
   * collections) reach the text primitive. Without this, `text` mode fell
   * through to vector search and the "Volltext" toggle had no effect.
   */
  private async performTextOnlySearch(params: SearchParams): Promise<SearchResponse> {
    const validated = this.validateSearchParams(params);
    const { query, userId, filters, options } = validated;

    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }

    return await searchOps.performTextSearch(
      this.qdrantOps,
      query,
      userId ?? '',
      {
        ...options,
        documentIds: filters.documentIds,
        sourceType: filters.sourceType,
        searchCollection: filters.searchCollection,
        additionalFilter: filters.additionalFilter,
      },
      this.chunkMultiplier,
      this.groupAndRankHybridResults.bind(this)
    );
  }

  /**
   * Full-text (keyword-only) search over document chunks
   *
   * @param query - Search query
   * @param userId - User ID
   * @param options - Search options
   * @returns Search response
   */
  async textSearch(
    query: string,
    userId: string,
    options: DocumentSearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      await this.ensureInitialized();

      if (!this.qdrantOps) {
        throw new Error('Qdrant not available');
      }

      return await searchOps.performTextSearch(
        this.qdrantOps,
        query,
        userId,
        options,
        this.chunkMultiplier,
        this.groupAndRankHybridResults.bind(this)
      );
    } catch (error) {
      const _errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DocumentSearchService] Text search error:', error);
      return this.createErrorResponse(error as Error, query);
    }
  }

  /**
   * Hybrid search combining vector similarity with text matching
   *
   * @param query - Search query
   * @param userId - User ID
   * @param options - Search options
   * @returns Search response
   */
  async hybridSearch(
    query: string,
    userId: string,
    options: DocumentSearchOptions = {}
  ): Promise<SearchResponse> {
    try {
      await this.ensureInitialized();

      if (vectorConfig.isVerboseMode()) {
        console.log(
          `[DocumentSearchService] Hybrid search config - Dynamic thresholds: ${this.hybridConfig.enableDynamicThresholds}, Quality gate: ${this.hybridConfig.enableQualityGate}, Confidence weighting: ${this.hybridConfig.enableConfidenceWeighting}`
        );
      }

      return await this.performHybridSearch({
        query,
        userId,
        filters: {
          documentIds: options.documentIds,
          sourceType: options.sourceType,
          searchCollection: options.searchCollection,
        },
        options: {
          limit: options.limit || this.defaultLimit,
          threshold: options.threshold,
          vectorWeight: options.vectorWeight || 0.7,
          textWeight: options.textWeight || 0.3,
          useRRF: options.useRRF !== false,
          rrfK: options.rrfK || 60,
          useCache: true,
          hybridConfig: this.hybridConfig,
        },
      });
    } catch (error) {
      const _errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[DocumentSearchService] Hybrid search error:', error);
      return this.createErrorResponse(error as Error, query);
    }
  }

  // ========== Vector Storage Operations ==========

  async storeDocumentVectors(
    userId: string,
    documentId: string,
    chunks: ChunkWithMetadata[],
    embeddings: number[][],
    metadata: VectorMetadata = {},
    onBatchUpserted?: (upserted: number, total: number) => Promise<void> | void
  ): Promise<VectorStoreResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.storeDocumentVectors(
      this.qdrantOps,
      userId,
      documentId,
      chunks,
      embeddings,
      metadata,
      onBatchUpserted
    );
  }

  async searchUserDocuments(
    userId: string,
    queryVector: number[],
    options: SearchUserDocumentsOptions = {}
  ): Promise<UserDocumentSearchResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.searchUserDocuments(this.qdrantOps, userId, queryVector, options);
  }

  async deleteDocumentVectors(
    documentId: string,
    userId: string | null = null
  ): Promise<DeleteResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.deleteDocumentVectors(this.qdrantOps, documentId, userId);
  }

  async countVectorsByDocument(documentIds: readonly string[]): Promise<Map<string, number>> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.countVectorsByDocument(this.qdrantOps, documentIds);
  }

  async deleteUserDocuments(userId: string): Promise<DeleteResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.deleteUserDocuments(this.qdrantOps, userId);
  }

  async getUserVectorStats(userId: string): Promise<UserVectorStats> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await vectorOps.getUserVectorStats(this.qdrantOps, userId);
  }

  // ========== Document Text Retrieval ==========

  async getDocumentFullText(userId: string, documentId: string): Promise<DocumentFullTextResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await docRetrieval.getDocumentFullText(this.qdrantOps, userId, documentId);
  }

  async getDocumentChunks(
    userId: string,
    documentId: string,
    options?: { qdrantCollection?: string }
  ): Promise<DocumentChunksResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await docRetrieval.getDocumentChunks(this.qdrantOps, userId, documentId, options);
  }

  /** Admin-Inspektor: alle Felder aus dem Punkt, ohne Eigentümerbindung. */
  async inspectDocumentChunks(
    documentId: string,
    qdrantCollection: string,
    options: { offset: number; limit: number }
  ): Promise<InspectDocumentChunksResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await docRetrieval.inspectDocumentChunks(
      this.qdrantOps,
      documentId,
      qdrantCollection,
      options
    );
  }

  async getMultipleDocumentsFullText(
    userId: string,
    documentIds: string[]
  ): Promise<BulkDocumentResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await docRetrieval.getMultipleDocumentsFullText(this.qdrantOps, userId, documentIds);
  }

  async getDocumentFirstChunks(userId: string, documentIds: string[]): Promise<FirstChunksResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      throw new Error('Qdrant not available');
    }
    return await docRetrieval.getDocumentFirstChunks(this.qdrantOps, userId, documentIds);
  }

  /**
   * Get full text for a system collection document by source_url.
   *
   * Strategy:
   * 1. Look for `full_text` payload on chunk_index=0
   * 2. Fallback: concatenate all chunks for that URL
   */
  async getSystemDocumentFullTextByUrl(
    qdrantCollection: string,
    sourceUrl: string,
    defaultFilter?: QdrantServiceFilter
  ): Promise<DocumentFullTextResult & { title?: string }> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      return { success: false, fullText: '', chunkCount: 0, error: 'Qdrant not available' };
    }

    try {
      // Step 1: Try to get full_text from chunk_index=0
      const chunk0Filter: QdrantServiceFilter = {
        must: [
          { key: 'source_url', match: { value: sourceUrl } },
          { key: 'chunk_index', match: { value: 0 } },
          ...(defaultFilter?.must || []),
        ],
      };

      const chunk0Results = await this.qdrantOps.scrollDocuments(qdrantCollection, chunk0Filter, {
        limit: 1,
        withPayload: true,
        withVector: false,
      });

      if (chunk0Results && chunk0Results.length > 0) {
        const payload = chunk0Results[0].payload;
        const fullText = payload.full_text;
        if (typeof fullText === 'string' && fullText.length > 0) {
          return {
            success: true,
            fullText,
            chunkCount: 1,
            ...(typeof payload.title === 'string' && { title: payload.title }),
          };
        }
      }

      // Step 2: Fallback — scroll all chunks for this URL and concatenate
      const allChunksFilter: QdrantServiceFilter = {
        must: [{ key: 'source_url', match: { value: sourceUrl } }, ...(defaultFilter?.must || [])],
      };

      const allChunks = await this.qdrantOps.scrollDocuments(qdrantCollection, allChunksFilter, {
        limit: 500,
        withPayload: true,
        withVector: false,
      });

      if (!allChunks || allChunks.length === 0) {
        return { success: false, fullText: '', chunkCount: 0, error: 'Document not found' };
      }

      const title =
        typeof allChunks[0].payload.title === 'string' ? allChunks[0].payload.title : undefined;

      const sorted = allChunks
        .sort((a, b) => {
          const idxA = typeof a.payload.chunk_index === 'number' ? a.payload.chunk_index : 0;
          const idxB = typeof b.payload.chunk_index === 'number' ? b.payload.chunk_index : 0;
          return idxA - idxB;
        })
        .map((c) => (typeof c.payload.chunk_text === 'string' ? c.payload.chunk_text : ''))
        .filter((t) => t.trim().length > 0);

      return {
        success: true,
        fullText: sorted.join('\n\n'),
        chunkCount: sorted.length,
        ...(title && { title }),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[DocumentSearchService] getSystemDocumentFullTextByUrl error: ${message}`);
      return { success: false, fullText: '', chunkCount: 0, error: message };
    }
  }

  /**
   * Get a chunk with surrounding context for citation display
   *
   * @param userId - User ID
   * @param documentId - Document ID
   * @param chunkIndex - Target chunk index
   * @param options - Context options (window size)
   * @returns Context chunks with center chunk highlighted
   */
  async getChunkWithContext(
    userId: string,
    documentId: string,
    chunkIndex: number,
    options: { window?: number } = {}
  ): Promise<ChunkWithContextResult> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      return { success: false, error: 'Qdrant not available' };
    }
    return await docRetrieval.getChunkWithContext(
      this.qdrantOps,
      userId,
      documentId,
      chunkIndex,
      options
    );
  }

  /**
   * Get a chunk with surrounding context for system documents (grundsatz, bundestag, etc.)
   *
   * @param collectionType - Collection type: 'grundsatz', 'bundestag', 'gruene_de', etc.
   * @param documentId - Document ID or title in the collection
   * @param chunkIndex - Target chunk index
   * @param options - Context options (window size)
   * @returns Context chunks with center chunk highlighted
   */
  async getSystemChunkWithContext(
    collectionType: string,
    documentId: string,
    chunkIndex: number,
    options: { window?: number } = {}
  ): Promise<{
    success: boolean;
    centerChunk?: { text: string; chunkIndex: number };
    contextChunks?: Array<{ text: string; chunkIndex: number; isCenter: boolean }>;
    error?: string;
  }> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      return { success: false, error: 'Qdrant not available' };
    }

    const collectionName = SYSTEM_COLLECTION_MAP[collectionType] || `${collectionType}_documents`;
    const windowSize = options.window ?? 2;

    try {
      // Find the point by document_id (or title for some collections) and chunk_index
      const filter = {
        must: [
          { key: 'document_id', match: { value: documentId } },
          { key: 'chunk_index', match: { value: chunkIndex } },
        ],
      };

      let scrollResult = await this.qdrantOps.scrollDocuments(collectionName, filter, {
        limit: 1,
        withPayload: true,
      });

      // If not found by document_id, try with title field
      if (!scrollResult || scrollResult.length === 0) {
        const titleFilter = {
          must: [
            { key: 'title', match: { value: documentId } },
            { key: 'chunk_index', match: { value: chunkIndex } },
          ],
        };

        scrollResult = await this.qdrantOps.scrollDocuments(collectionName, titleFilter, {
          limit: 1,
          withPayload: true,
        });

        if (!scrollResult || scrollResult.length === 0) {
          return { success: false, error: 'Chunk not found in collection' };
        }
      }

      const centerPoint = scrollResult[0];

      // Get context using existing method
      const contextResult = await this.qdrantOps.getChunkWithContext(
        collectionName,
        { id: centerPoint.id, payload: centerPoint.payload },
        { window: windowSize }
      );

      if (!contextResult.center) {
        return { success: false, error: 'Failed to retrieve context' };
      }

      const centerChunk = {
        text: (contextResult.center.payload.chunk_text as string) || '',
        chunkIndex: (contextResult.center.payload.chunk_index as number) ?? chunkIndex,
      };

      const contextChunks = contextResult.context.map((chunk) => ({
        text: (chunk.payload.chunk_text as string) || '',
        chunkIndex: (chunk.payload.chunk_index as number) ?? 0,
        isCenter: chunk.id === contextResult.center?.id,
      }));

      return {
        success: true,
        centerChunk,
        contextChunks,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[DocumentSearchService] getSystemChunkWithContext error: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Detect which system collection contains a document by ID
   * Scans known system collections to find where the document exists
   */
  async detectSystemCollectionForDocument(documentId: string): Promise<string> {
    await this.ensureInitialized();
    if (!this.qdrantOps) {
      return 'user';
    }

    // Get unique collection names from the map (filter out shorthand duplicates)
    const seenCollections = new Set<string>();
    const systemCollections: Array<{ type: string; collection: string }> = [];
    for (const [type, collection] of Object.entries(SYSTEM_COLLECTION_MAP)) {
      if (!seenCollections.has(collection)) {
        seenCollections.add(collection);
        systemCollections.push({ type, collection });
      }
    }

    for (const { type, collection } of systemCollections) {
      try {
        const filter = {
          should: [
            { key: 'document_id', match: { value: documentId } },
            { key: 'title', match: { value: documentId } },
          ],
        };

        const result = await this.qdrantOps.scrollDocuments(collection, filter, {
          limit: 1,
          withPayload: false,
        });

        if (result && result.length > 0) {
          console.log(
            `[DocumentSearchService] Found document '${documentId}' in collection '${collection}'`
          );
          return type;
        }
      } catch {
        // Collection might not exist, continue to next
      }
    }

    return 'user';
  }

  // ========== Bundestag Search ==========

  async searchBundestagContent(
    query: string,
    options: BundestagSearchOptions = {}
  ): Promise<BundestagSearchResult> {
    await this.ensureInitialized();
    return await searchOps.searchBundestagContent(
      this.qdrant,
      mistralEmbeddingService,
      query,
      options
    );
  }

  // ========== BaseSearchService Abstract Method Implementations ==========

  override async findSimilarChunks(
    params: FindSimilarChunksParams
  ): Promise<DocumentTransformedChunk[]> {
    return await searchOps.findSimilarChunks(this.qdrantOps, this.qdrantAvailable, params);
  }

  override async findHybridChunks(
    params: FindHybridChunksParams
  ): Promise<DocumentTransformedChunk[]> {
    return await searchOps.findHybridChunks(this.qdrantOps, this.qdrantAvailable, params);
  }

  override extractChunkData(chunk: DocumentRawChunk): DocumentChunkData {
    return scoring.extractChunkData(chunk);
  }

  override buildRelevanceInfo(doc: DocumentData, enhancedScore: DocumentEnhancedScore): string {
    return scoring.buildRelevanceInfo(
      { similarity_score: doc.maxSimilarity || doc.avgSimilarity || 0 },
      enhancedScore
    );
  }

  override getSearchType(): string {
    return 'document_vector';
  }

  // ========== Legacy Methods for Backward Compatibility ==========

  async searchDocuments(
    query: string,
    userId: string,
    options: {
      documentIds?: string[];
      searchCollection?: string;
      limit?: number;
      mode?: string;
      threshold?: number;
    } = {}
  ): Promise<SearchResponse> {
    return await this.search({
      query,
      userId: userId,
      filters: {
        documentIds: options.documentIds,
      },
      options: {
        limit: options.limit || 5,
        threshold: options.threshold,
      },
    });
  }

  async getDocumentStats(userId: string): Promise<UserVectorStats> {
    return await this.getUserVectorStats(userId);
  }

  async isReady(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.qdrantOps) {
        return false;
      }
      return await this.qdrantOps.healthCheck();
    } catch (error) {
      console.error('[DocumentSearchService] Service not ready:', error);
      return false;
    }
  }
}

/**
 * Export service factory function for dependency injection
 */
export function getQdrantDocumentService(): DocumentSearchService {
  return new DocumentSearchService();
}
