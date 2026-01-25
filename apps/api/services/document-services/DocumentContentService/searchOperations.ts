/**
 * Search operations
 * Handles vector search and content aggregation
 */

import type { DocumentRecord } from '../PostgresDocumentService/types.js';
import type {
  DocumentContentResult,
  ContentSearchResponse,
  ContentSearchMetadata,
} from './types.js';
import { createIntelligentExcerpt } from './contentExtraction.js';

/**
 * Perform vector search within user's accessible documents
 */
export async function performVectorSearch(
  documentSearchService: any,
  userId: string,
  query: string,
  documentIds: string[],
  limit: number,
  mode: string
): Promise<any[]> {
  try {
    const searchResponse = await documentSearchService.search({
      query: query,
      user_id: userId,
      documentIds: documentIds,
      limit: limit * 2, // Get more results for better aggregation
      mode: mode,
    });

    const results = searchResponse.results || [];
    console.log(`[DocumentContentService] Vector search found ${results.length} results`);
    return results;
  } catch (searchError) {
    console.error('[DocumentContentService] Vector search error:', searchError);
    return [];
  }
}

/**
 * Process vector search results into document content map
 */
export function processVectorSearchResults(
  searchResults: any[],
  accessibleDocuments: DocumentRecord[]
): Map<string, DocumentContentResult> {
  const documentContents = new Map<string, DocumentContentResult>();

  searchResults.forEach((result: any) => {
    const docId = result.document_id;
    const content = result.relevant_content || result.chunk_text || '';

    if (!documentContents.has(docId)) {
      const docInfo = accessibleDocuments.find((d) => d.id === docId);

      documentContents.set(docId, {
        document_id: docId,
        title: docInfo?.title || result.title || 'Untitled',
        filename: docInfo?.filename || result.filename || null,
        vector_count: docInfo?.vector_count || 0,
        content_type: 'vector_search',
        content: content,
        similarity_score: result.similarity_score,
        search_info: result.relevance_info || 'Vector search found relevant content',
      });
    } else {
      // Append additional content if we have more chunks from the same document
      const existing = documentContents.get(docId)!;
      existing.content += '\n\n---\n\n' + content;
      // Keep the higher similarity score
      if (result.similarity_score > existing.similarity_score!) {
        existing.similarity_score = result.similarity_score;
      }
    }
  });

  return documentContents;
}

/**
 * Fill in missing documents with full text or excerpts
 */
export async function fillMissingDocuments(
  documentSearchService: any,
  userId: string,
  query: string,
  accessibleDocuments: DocumentRecord[],
  documentContents: Map<string, DocumentContentResult>
): Promise<void> {
  for (const doc of accessibleDocuments) {
    if (!documentContents.has(doc.id)) {
      try {
        const qdrantResult = await documentSearchService.getDocumentFullText(userId, doc.id);
        let content = '';
        let contentType: DocumentContentResult['content_type'] = 'full_text_from_vectors';

        if (qdrantResult.success && qdrantResult.fullText) {
          const fullText = qdrantResult.fullText;

          // Create intelligent excerpt if document is large
          if (fullText.length > 2000) {
            content = createIntelligentExcerpt(fullText, query, 1500);
            contentType = 'intelligent_excerpt_from_vectors';
          } else {
            content = fullText;
          }
        }

        documentContents.set(doc.id, {
          document_id: doc.id,
          title: doc.title,
          filename: doc.filename || null,
          vector_count: doc.vector_count || 0,
          content_type: contentType,
          content: content,
          similarity_score: null,
          search_info:
            contentType === 'full_text_from_vectors'
              ? 'Full text retrieved from vectors'
              : 'Intelligent excerpt created from vectors',
        });
      } catch (qdrantError) {
        console.error(
          `[DocumentContentService] Failed to get full text for document ${doc.id}:`,
          qdrantError
        );
        // Add empty entry to indicate document was processed
        documentContents.set(doc.id, {
          document_id: doc.id,
          title: doc.title,
          filename: doc.filename || null,
          vector_count: doc.vector_count || 0,
          content_type: 'no_content',
          content: '',
          similarity_score: null,
          search_info: 'No content available',
        });
      }
    }
  }
}

/**
 * Create search response with metadata
 */
export function createSearchResponse(
  documentContents: Map<string, DocumentContentResult>,
  query: string,
  mode: string,
  userId: string,
  vectorSearchResultCount: number,
  startTime: number
): ContentSearchResponse {
  const results = Array.from(documentContents.values());
  const responseTime = Date.now() - startTime;

  // Count different content types for metadata
  const contentTypeCounts: Record<string, number> = {};
  results.forEach((result) => {
    const type = result.content_type || 'unknown';
    contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
  });

  const metadata: ContentSearchMetadata = {
    response_time_ms: responseTime,
    documents_processed: results.length,
    vector_search_results: vectorSearchResultCount,
    content_type_breakdown: contentTypeCounts,
    processing_version: '3.0_postgres_qdrant',
    user_id: userId,
  };

  console.log(
    `[DocumentContentService] Returning ${results.length} document contents (${responseTime}ms)`
  );

  return {
    success: true,
    results: results,
    query: query,
    search_mode: mode,
    metadata: metadata,
  };
}
