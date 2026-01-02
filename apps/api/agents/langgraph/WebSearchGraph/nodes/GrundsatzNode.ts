/**
 * Grundsatz Node for WebSearchGraph
 * Searches official Green Party Grundsatz documents (deep mode only)
 */

import type { WebSearchState } from '../types.js';
import { DocumentSearchService } from '../../../../services/document-services/index.js';

const documentSearchService = new DocumentSearchService();

/**
 * Grundsatz Node: Search official Grundsatz documents
 */
export async function grundsatzNode(state: WebSearchState): Promise<Partial<WebSearchState>> {
  if (state.mode !== 'deep') {
    return { grundsatzResults: null };
  }

  console.log('[WebSearchGraph] Searching Grundsatz documents');

  try {
    // Use original query for Grundsatz search (more focused)
    const searchResults = await documentSearchService.search({
      query: state.query,
      userId: 'deep-research',
      filters: {
        searchCollection: 'grundsatz_documents'
      },
      options: {
        limit: 3,
        mode: 'hybrid'
      }
    });

    const formattedResults = (searchResults.results || []).map((result: any) => ({
      document_id: result.document_id,
      title: result.title || result.document_title,
      content: result.relevant_content || result.chunk_text,
      url: result.url || '',
      snippet: result.relevant_content || result.chunk_text || '',
      similarity_score: result.similarity_score,
      filename: result.filename,
      chunk_index: result.chunk_index || 0,
      relevance_info: result.relevance_info,
      source_type: 'official_document'
    }));

    console.log(`[WebSearchGraph] Grundsatz search found ${formattedResults.length} results`);

    return {
      grundsatzResults: {
        success: true,
        results: formattedResults,
        source: 'grundsatz'
      },
      metadata: {
        ...state.metadata,
        grundsatzResults: formattedResults.length
      }
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[WebSearchGraph] Grundsatz search error:', errorMessage);
    return {
      grundsatzResults: {
        success: false,
        results: [],
        source: 'grundsatz'
      },
      metadata: { ...state.metadata, grundsatzResults: 0 }
    };
  }
}
