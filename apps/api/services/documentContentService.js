/**
 * Document Content Service
 * Handles intelligent document content search and extraction
 */

import { getPostgresDocumentService } from './postgresDocumentService.js';
import { getQdrantDocumentService } from './DocumentSearchService.js';

class DocumentContentService {
    constructor() {
        this.postgresDocumentService = getPostgresDocumentService();
        this.documentSearchService = getQdrantDocumentService();
    }

    /**
     * Search for relevant content within specific documents using vector search
     * This endpoint is used for intelligent document content extraction in forms
     */
    async searchDocumentContent(userId, { query, documentIds, limit = 5, mode = 'hybrid' }) {
        const startTime = Date.now();

        try {
            const trimmedQuery = query.trim();

            console.log(`[DocumentContentService] Content search request: query="${trimmedQuery}", documentIds=[${documentIds.length} docs], user=${userId}`);

            // Verify user owns the requested documents
            const accessibleDocuments = [];
            for (const docId of documentIds) {
                try {
                    const doc = await this.postgresDocumentService.getDocumentById(docId, userId);
                    if (doc) {
                        accessibleDocuments.push(doc);
                    }
                } catch (error) {
                    console.warn(`[DocumentContentService] Document ${docId} not accessible:`, error.message);
                }
            }

            if (accessibleDocuments.length === 0) {
                throw new Error('No accessible documents found');
            }

            const accessibleDocumentIds = accessibleDocuments.map(doc => doc.id);

            // Perform vector search with document filtering
            let searchResults = [];
            try {
                const searchResponse = await this.documentSearchService.search({
                    query: trimmedQuery,
                    user_id: userId,
                    documentIds: accessibleDocumentIds,
                    limit: limit * 2,
                    mode: mode
                });
                searchResults = searchResponse.results || [];

                console.log(`[DocumentContentService] Vector search found ${searchResults.length} results`);
            } catch (searchError) {
                console.error('[DocumentContentService] Vector search error:', searchError);
                searchResults = [];
            }

            // Process results and create intelligent content extracts
            const documentContents = new Map();

            if (searchResults.length > 0) {
                // Use vector search results to create intelligent content
                searchResults.forEach(result => {
                    const docId = result.document_id;
                    const content = result.relevant_content || result.chunk_text || '';

                    if (!documentContents.has(docId)) {
                        const docInfo = accessibleDocuments.find(d => d.id === docId);

                        documentContents.set(docId, {
                            document_id: docId,
                            title: docInfo?.title || result.title || 'Untitled',
                            filename: docInfo?.filename || result.filename || null,
                            vector_count: docInfo?.vector_count || 0,
                            content_type: 'vector_search',
                            content: content,
                            similarity_score: result.similarity_score,
                            search_info: result.relevance_info || 'Vector search found relevant content'
                        });
                    } else {
                        // Append additional content if we have more chunks from the same document
                        const existing = documentContents.get(docId);
                        existing.content += '\n\n---\n\n' + content;
                        // Keep the higher similarity score
                        if (result.similarity_score > existing.similarity_score) {
                            existing.similarity_score = result.similarity_score;
                        }
                    }
                });
            }

            // For documents not found in vector search, get full text
            for (const doc of accessibleDocuments) {
                if (!documentContents.has(doc.id)) {
                    try {
                        const qdrantResult = await this.documentSearchService.getDocumentFullText(userId, doc.id);
                        let content = '';
                        let contentType = 'full_text_from_vectors';

                        if (qdrantResult.success && qdrantResult.fullText) {
                            const fullText = qdrantResult.fullText;

                            // Create intelligent excerpt if document is large
                            if (fullText.length > 2000) {
                                content = this.createIntelligentExcerpt(fullText, trimmedQuery, 1500);
                                contentType = 'intelligent_excerpt_from_vectors';
                            } else {
                                content = fullText;
                            }
                        }

                        documentContents.set(doc.id, {
                            document_id: doc.id,
                            title: doc.title,
                            filename: doc.filename,
                            vector_count: doc.vector_count || 0,
                            content_type: contentType,
                            content: content,
                            similarity_score: null,
                            search_info: contentType === 'full_text_from_vectors'
                                ? 'Full text retrieved from vectors'
                                : 'Intelligent excerpt created from vectors'
                        });
                    } catch (qdrantError) {
                        console.error(`[DocumentContentService] Failed to get full text for document ${doc.id}:`, qdrantError);
                        // Add empty entry to indicate document was processed
                        documentContents.set(doc.id, {
                            document_id: doc.id,
                            title: doc.title,
                            filename: doc.filename,
                            vector_count: doc.vector_count || 0,
                            content_type: 'no_content',
                            content: '',
                            similarity_score: null,
                            search_info: 'No content available'
                        });
                    }
                }
            }

            const results = Array.from(documentContents.values());
            const responseTime = Date.now() - startTime;

            console.log(`[DocumentContentService] Returning ${results.length} document contents (${responseTime}ms)`);

            // Count different content types for metadata
            const contentTypeCounts = {};
            results.forEach(result => {
                const type = result.content_type || 'unknown';
                contentTypeCounts[type] = (contentTypeCounts[type] || 0) + 1;
            });

            return {
                success: true,
                results: results,
                query: trimmedQuery,
                search_mode: mode,
                metadata: {
                    response_time_ms: responseTime,
                    documents_processed: results.length,
                    vector_search_results: searchResults.length,
                    content_type_breakdown: contentTypeCounts,
                    processing_version: '3.0_postgres_qdrant',
                    user_id: userId
                }
            };

        } catch (error) {
            console.error('[DocumentContentService] Error in searchDocumentContent:', error);
            throw error;
        }
    }

    /**
     * Determine the best content strategy for a document based on multiple factors
     */
    determineContentStrategy(doc, query) {
        const text = doc.ocr_text || '';
        const pageCount = doc.page_count || 0;
        const charCount = text.length;
        const wordCount = text.split(/\s+/).filter(word => word.length > 0).length;

        // Factor 1: Page count (most reliable indicator)
        if (pageCount <= 1) return true; // Single page documents always use full content
        if (pageCount >= 10) return false; // Very long documents always use excerpts

        // Factor 2: Character count
        if (charCount <= 1500) return true; // Very short documents
        if (charCount >= 8000) return false; // Very long documents

        // Factor 3: Word density (chars per word) - detect scanned documents with OCR errors
        const avgCharsPerWord = wordCount > 0 ? charCount / wordCount : 0;
        if (avgCharsPerWord > 15) return false; // Likely OCR errors, use excerpt to avoid noise

        // Factor 4: Query relevance - if query matches document title/filename, more likely to be relevant
        if (query && query.trim()) {
            const queryLower = query.toLowerCase();
            const titleLower = (doc.title || '').toLowerCase();
            const filenameLower = (doc.filename || '').toLowerCase();

            if (titleLower.includes(queryLower) || filenameLower.includes(queryLower)) {
                // High relevance - be more generous with full content for smaller docs
                return pageCount <= 3 && charCount <= 4000;
            }
        }

        // Factor 5: Default thresholds for medium-size documents
        if (pageCount <= 2 && charCount <= 3000) return true;

        // Default to excerpt for everything else
        return false;
    }

    /**
     * Create an intelligent excerpt from document text based on search query
     * Falls back when vector search is not available
     */
    createIntelligentExcerpt(text, query, maxLength = 1500) {
        if (!text || text.length <= maxLength) {
            return text;
        }

        const queryLower = query.toLowerCase();
        const textLower = text.toLowerCase();

        // Find all occurrences of query terms
        const queryTerms = queryLower.split(/\s+/).filter(term => term.length > 2);
        const matches = [];

        queryTerms.forEach(term => {
            let index = textLower.indexOf(term);
            while (index !== -1) {
                matches.push({ index, term, length: term.length });
                index = textLower.indexOf(term, index + 1);
            }
        });

        if (matches.length === 0) {
            // No matches found, return beginning of document
            return text.substring(0, maxLength) + '...';
        }

        // Sort matches by position
        matches.sort((a, b) => a.index - b.index);

        // Create excerpt around the first significant match
        const firstMatch = matches[0];
        const excerptStart = Math.max(0, firstMatch.index - Math.floor(maxLength / 3));
        const excerptEnd = Math.min(text.length, excerptStart + maxLength);

        let excerpt = text.substring(excerptStart, excerptEnd);

        // Try to cut at sentence boundaries
        if (excerptStart > 0) {
            const sentenceStart = excerpt.indexOf('. ');
            if (sentenceStart > 0 && sentenceStart < 100) {
                excerpt = excerpt.substring(sentenceStart + 2);
            } else {
                excerpt = '...' + excerpt;
            }
        }

        if (excerptEnd < text.length) {
            const lastSentence = excerpt.lastIndexOf('.');
            if (lastSentence > excerpt.length * 0.8) {
                excerpt = excerpt.substring(0, lastSentence + 1);
            } else {
                excerpt = excerpt + '...';
            }
        }

        return excerpt;
    }

    /**
     * Helper function to extract relevant text around search terms
     */
    extractRelevantText(text, query, maxLength = 300) {
        if (!text) return '';

        const queryLower = query.toLowerCase();
        const textLower = text.toLowerCase();
        const index = textLower.indexOf(queryLower);

        if (index === -1) {
            // If exact match not found, return beginning of text
            return text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
        }

        // Extract text around the match
        const start = Math.max(0, index - Math.floor(maxLength / 3));
        const end = Math.min(text.length, start + maxLength);

        let excerpt = text.substring(start, end);

        if (start > 0) excerpt = '...' + excerpt;
        if (end < text.length) excerpt = excerpt + '...';

        return excerpt;
    }
}

let documentContentServiceInstance = null;

export function getDocumentContentService() {
    if (!documentContentServiceInstance) {
        documentContentServiceInstance = new DocumentContentService();
    }
    return documentContentServiceInstance;
}

export { DocumentContentService };