/**
 * Arguments Generator
 * Searches Green Party knowledge bases for relevant arguments using Qdrant
 */

import { getQdrantInstance } from '../../../../database/services/QdrantService/index.js';
import { mistralEmbeddingService } from '../../../../services/mistral/MistralEmbeddingService/index.js';
import { SYSTEM_COLLECTIONS } from '../../../../config/systemCollectionsConfig.js';

export interface ArgumentResult {
    source: string;
    text: string;
    relevance: number;
    metadata: {
        collection: string;
        category?: string;
        contentType?: string;
        url?: string;
    };
}

/**
 * Search for relevant arguments from Green Party knowledge bases
 * Uses Qdrant multi-collection hybrid search
 */
export async function searchArgumentsFromNotebooks(
    topic: string,
    options: {
        collections?: string[];
        limit?: number;
        threshold?: number;
    } = {}
): Promise<ArgumentResult[]> {
    const {
        collections = [
            'grundsatz_documents',        // Grundsatzprogramme
            'bundestag_content',          // Bundestagsfraktion content
            'kommunalwiki_documents',     // KommunalWiki
            'gruene_de_documents',        // gruene.de
            'gruene_at_documents'         // gruene.at
        ],
        limit = 10,
        threshold = 0.35
    } = options;

    const qdrant = getQdrantInstance();

    // Initialize services
    await qdrant.init();
    await mistralEmbeddingService.init();

    if (!qdrant.isAvailable() || !mistralEmbeddingService.isReady()) {
        console.warn('[ArgumentsGenerator] Qdrant or Mistral not available');
        return [];
    }

    // Generate embedding for the topic
    let topicEmbedding: number[];
    try {
        topicEmbedding = await mistralEmbeddingService.generateEmbedding(topic);
    } catch (error) {
        console.error('[ArgumentsGenerator] Embedding generation failed:', error);
        return [];
    }

    // Search across all collections in parallel
    const searchPromises = collections.map(async (collection) => {
        try {
            // Use hybrid search (vector + text) for better precision
            const result = await qdrant.hybridSearchDocuments(
                topicEmbedding,
                topic,
                {
                    collection,
                    limit: Math.ceil(limit / collections.length) + 5,  // Over-fetch per collection
                    threshold
                }
            );

            return result.results.map(r => ({
                source: (r.title as string) || (r.document_id as string) || collection,
                text: (r.chunk_text as string) || '',
                relevance: r.score || 0,
                metadata: {
                    collection,
                    category: (r.section as string) || '',
                    contentType: (r.metadata?.content_type as string) || '',
                    url: (r.url as string) || ''
                }
            }));
        } catch (error) {
            console.error(`[ArgumentsGenerator] Search failed for ${collection}:`, error);
            return [];
        }
    });

    const results = await Promise.all(searchPromises);

    // Merge, deduplicate, and sort by relevance
    const allArguments = results.flat();

    // Deduplicate by text content (keep highest relevance)
    const uniqueArguments = Array.from(
        new Map(allArguments.map(a => [a.text, a])).values()
    );

    return uniqueArguments
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, limit);
}
