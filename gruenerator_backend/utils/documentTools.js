import { supabaseService } from './supabaseClient.js';
import { vectorSearchService } from '../services/vectorSearchService.js';

/**
 * Document search tool for AI integration
 * Allows AI to search through user's uploaded documents for relevant information
 */
export const documentTools = {
  search_documents: {
    name: 'search_documents',
    description: 'Search through the user\'s uploaded documents for relevant information. Use this when the user asks about specific information that might be in their documents.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'Search query to find relevant content in documents'
        },
        limit: {
          type: 'integer',
          description: 'Maximum number of document excerpts to return (default: 3, max: 10)',
          minimum: 1,
          maximum: 10,
          default: 3
        }
      },
      required: ['query']
    }
  }
};

/**
 * Execute document search tool
 * @param {string} toolName - Name of the tool
 * @param {Object} parameters - Tool parameters
 * @param {string} userId - User ID for access control
 * @returns {Object} Search results
 */
export async function executeDocumentTool(toolName, parameters, userId) {
  try {
    console.log(`[DocumentTools] Executing ${toolName} for user ${userId} with parameters:`, parameters);

    if (toolName !== 'search_documents') {
      throw new Error(`Unknown document tool: ${toolName}`);
    }

    return await searchDocuments(parameters, userId);
  } catch (error) {
    console.error(`[DocumentTools] Error executing ${toolName}:`, error);
    return {
      success: false,
      error: error.message,
      results: []
    };
  }
}

/**
 * Search documents for relevant content using vector similarity
 */
async function searchDocuments(parameters, userId) {
  const { query, limit = 3 } = parameters;

  if (!query || !query.trim()) {
    return {
      success: false,
      error: 'Search query is required',
      results: []
    };
  }

  const searchLimit = Math.min(Math.max(1, limit), 10);

  try {
    console.log(`[DocumentTools] Searching documents for user ${userId} with query: "${query}"`);

    // Use vector search service
    const searchResult = await vectorSearchService.searchDocuments(
      query.trim(), 
      userId, 
      { 
        limit: searchLimit,
        threshold: 0.6, // Lower threshold for better recall in AI context
        includeKeywordSearch: true // Always allow fallback
      }
    );

    if (!searchResult.success) {
      console.error('[DocumentTools] Vector search failed:', searchResult.error);
      return {
        success: false,
        error: searchResult.error || 'Search failed',
        results: [],
        query: query.trim()
      };
    }

    if (!searchResult.results || searchResult.results.length === 0) {
      console.log(`[DocumentTools] No documents found matching query: "${query}"`);
      return {
        success: true,
        message: 'No relevant documents found',
        results: [],
        query: query.trim(),
        searchType: searchResult.searchType
      };
    }

    // Format results for AI consumption
    const results = searchResult.results.map(doc => ({
      document_id: doc.document_id,
      title: doc.title,
      filename: doc.filename,
      relevant_content: doc.relevant_content,
      created_at: doc.created_at,
      similarity_score: doc.similarity_score,
      relevance_info: doc.relevance_info || `Content found in document "${doc.title}" (${doc.filename})`
    }));

    console.log(`[DocumentTools] Found ${results.length} relevant documents for query: "${query}" using ${searchResult.searchType} search`);

    return {
      success: true,
      message: `Found ${results.length} relevant document(s)`,
      results: results,
      query: query.trim(),
      searchType: searchResult.searchType,
      total_documents_searched: results.length
    };

  } catch (error) {
    console.error('[DocumentTools] Search error:', error);
    return {
      success: false,
      error: error.message,
      results: [],
      query: query.trim()
    };
  }
}

/**
 * Extract relevant text excerpt around search terms
 */
function extractRelevantExcerpt(text, query, maxLength = 500) {
  if (!text || !query) return '';

  const queryLower = query.toLowerCase();
  const textLower = text.toLowerCase();
  
  // Find all occurrences of query terms
  const queryWords = queryLower.split(/\s+/).filter(word => word.length > 2);
  let bestMatch = { index: -1, score: 0 };
  
  // Find the best matching section
  for (let i = 0; i < text.length - maxLength; i += 50) {
    const section = textLower.substring(i, i + maxLength);
    let score = 0;
    
    for (const word of queryWords) {
      const matches = (section.match(new RegExp(word, 'g')) || []).length;
      score += matches;
    }
    
    if (score > bestMatch.score) {
      bestMatch = { index: i, score };
    }
  }
  
  // If no good match found, try exact phrase
  if (bestMatch.score === 0) {
    const exactIndex = textLower.indexOf(queryLower);
    if (exactIndex !== -1) {
      bestMatch.index = exactIndex;
    }
  }
  
  // Extract the relevant section
  let startIndex, endIndex;
  
  if (bestMatch.index !== -1) {
    // Center the excerpt around the match
    const matchCenter = bestMatch.index + Math.floor(queryLower.length / 2);
    startIndex = Math.max(0, matchCenter - Math.floor(maxLength / 2));
    endIndex = Math.min(text.length, startIndex + maxLength);
    
    // Adjust start if we're at the end
    if (endIndex - startIndex < maxLength) {
      startIndex = Math.max(0, endIndex - maxLength);
    }
  } else {
    // No match found, return beginning
    startIndex = 0;
    endIndex = Math.min(maxLength, text.length);
  }
  
  let excerpt = text.substring(startIndex, endIndex);
  
  // Add ellipsis if needed
  if (startIndex > 0) excerpt = '...' + excerpt;
  if (endIndex < text.length) excerpt = excerpt + '...';
  
  // Highlight query terms for better readability (simple approach)
  for (const word of queryLower.split(/\s+/).filter(w => w.length > 2)) {
    const regex = new RegExp(`(${word})`, 'gi');
    excerpt = excerpt.replace(regex, '**$1**');
  }
  
  return excerpt.trim();
}

/**
 * Tool definition for AI systems
 */
export const documentToolDefinitions = [documentTools.search_documents];

/**
 * Get available document tools for a user
 */
export async function getAvailableDocumentTools(userId) {
  try {
    // Check if user has any completed documents
    const { data: documents, error } = await supabaseService
      .from('documents')
      .select('id')
      .eq('user_id', userId)
      .eq('status', 'completed')
      .limit(1);

    if (error) {
      console.error('[DocumentTools] Error checking user documents:', error);
      return [];
    }

    // Only return document tools if user has documents
    if (documents && documents.length > 0) {
      return documentToolDefinitions;
    }

    return [];
  } catch (error) {
    console.error('[DocumentTools] Error getting available tools:', error);
    return [];
  }
}