/**
 * DocumentContentService - Main orchestration class
 * Handles intelligent document content search and extraction
 */

import { getPostgresDocumentService } from '../PostgresDocumentService/index.js';
import { getQdrantDocumentService } from '../DocumentSearchService/index.js';
import type { ContentSearchOptions, ContentSearchResponse } from './types.js';
import { getAccessibleDocuments, getAccessibleDocumentIds } from './accessControl.js';
import {
  determineContentStrategy,
  createIntelligentExcerpt,
  extractRelevantText,
} from './contentExtraction.js';
import {
  performVectorSearch,
  processVectorSearchResults,
  fillMissingDocuments,
  createSearchResponse,
} from './searchOperations.js';

/**
 * Main DocumentContentService class
 * Delegates operations to specialized modules
 */
export class DocumentContentService {
  private postgresDocumentService: any;
  private documentSearchService: any;

  constructor() {
    this.postgresDocumentService = getPostgresDocumentService();
    this.documentSearchService = getQdrantDocumentService();
  }

  /**
   * Search for relevant content within specific documents using vector search
   * This endpoint is used for intelligent document content extraction in forms
   */
  async searchDocumentContent(
    userId: string,
    options: ContentSearchOptions
  ): Promise<ContentSearchResponse> {
    const startTime = Date.now();
    const { query, documentIds, limit = 5, mode = 'hybrid' } = options;

    try {
      const trimmedQuery = query.trim();

      console.log(
        `[DocumentContentService] Content search request: query="${trimmedQuery}", documentIds=[${documentIds.length} docs], user=${userId}`
      );

      // Step 1: Verify user owns the requested documents
      const accessibleDocuments = await getAccessibleDocuments(
        this.postgresDocumentService,
        userId,
        documentIds
      );

      const accessibleDocumentIds = getAccessibleDocumentIds(accessibleDocuments);

      // Step 2: Perform vector search with document filtering
      const searchResults = await performVectorSearch(
        this.documentSearchService,
        userId,
        trimmedQuery,
        accessibleDocumentIds,
        limit,
        mode
      );

      // Step 3: Process results and create intelligent content extracts
      const documentContents = processVectorSearchResults(searchResults, accessibleDocuments);

      // Step 4: For documents not found in vector search, get full text
      await fillMissingDocuments(
        this.documentSearchService,
        userId,
        trimmedQuery,
        accessibleDocuments,
        documentContents
      );

      // Step 5: Create and return response
      return createSearchResponse(
        documentContents,
        trimmedQuery,
        mode,
        userId,
        searchResults.length,
        startTime
      );
    } catch (error) {
      console.error('[DocumentContentService] Error in searchDocumentContent:', error);
      throw error;
    }
  }

  /**
   * Determine the best content strategy for a document based on multiple factors
   */
  determineContentStrategy(doc: any, query: string): boolean {
    return determineContentStrategy(doc, query);
  }

  /**
   * Create an intelligent excerpt from document text based on search query
   * Falls back when vector search is not available
   */
  createIntelligentExcerpt(text: string, query: string, maxLength: number = 1500): string {
    return createIntelligentExcerpt(text, query, maxLength);
  }

  /**
   * Helper function to extract relevant text around search terms
   */
  extractRelevantText(text: string, query: string, maxLength: number = 300): string {
    return extractRelevantText(text, query, maxLength);
  }
}
