/**
 * DocumentSearchService Vector Operations Module
 *
 * Handles CRUD operations for document vectors in Qdrant:
 * - Storing document embeddings
 * - Searching user documents
 * - Deleting vectors by document or user
 * - Retrieving statistics
 */

import { v4 as uuidv4 } from 'uuid';
import type {
    ChunkWithMetadata,
    VectorMetadata,
    VectorStoreResult,
    SearchUserDocumentsOptions,
    UserDocumentSearchResult,
    DeleteResult,
    UserVectorStats,
    QdrantPoint,
    QdrantFilter,
    HybridOptions
} from './types.js';

// Import QdrantOperations - this is a TypeScript class
import type { QdrantOperations } from '../../../database/services/QdrantOperations.js';
import { chunkToNumericId } from '../../../database/services/QdrantService/utils.js';

/**
 * Store document vectors in Qdrant
 *
 * Converts document chunks and their embeddings into Qdrant points
 * and stores them in batches for efficiency.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID who owns the document
 * @param documentId - Unique document identifier
 * @param chunks - Array of text chunks with metadata
 * @param embeddings - Corresponding embedding vectors
 * @param metadata - Additional metadata for the vectors
 * @returns Result with success status and count
 * @throws Error if chunks and embeddings length mismatch
 */
export async function storeDocumentVectors(
    qdrantOps: QdrantOperations,
    userId: string,
    documentId: string,
    chunks: ChunkWithMetadata[],
    embeddings: number[][],
    metadata: VectorMetadata = {}
): Promise<VectorStoreResult> {
    if (chunks.length !== embeddings.length) {
        throw new Error('Number of chunks and embeddings must match');
    }

    const points: QdrantPoint[] = chunks.map((chunk, index) => ({
        id: chunkToNumericId(documentId, index),
        vector: embeddings[index],
        payload: {
            user_id: userId,
            document_id: documentId,
            chunk_index: index,
            chunk_text: chunk.text,
            token_count: chunk.tokens || 0,
            source_type: metadata.sourceType || 'manual',
            wolke_share_link_id: metadata.wolkeShareLinkId || null,
            wolke_file_path: metadata.wolkeFilePath || null,
            title: metadata.title || null,
            filename: metadata.filename || null,
            created_at: new Date().toISOString(),
            ...metadata.additionalPayload
        }
    }));

    const BATCH_SIZE = 20;
    let totalUpserted = 0;

    for (let i = 0; i < points.length; i += BATCH_SIZE) {
        const batch = points.slice(i, i + BATCH_SIZE);
        await qdrantOps.batchUpsert('documents', batch, { wait: true });
        totalUpserted += batch.length;
        console.log(`[VectorOperations] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(points.length / BATCH_SIZE)} (${batch.length} vectors)`);
    }

    console.log(`[VectorOperations] Stored ${totalUpserted} vectors for document ${documentId}`);
    return {
        success: true,
        vectorsStored: totalUpserted,
        collectionName: 'documents'
    };
}

/**
 * Search user documents with enhanced filtering
 *
 * Performs vector or hybrid search over user's documents
 * with optional source type filtering.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID to filter documents
 * @param queryVector - Query embedding vector
 * @param options - Search options and filters
 * @returns Search results with metadata
 */
export async function searchUserDocuments(
    qdrantOps: QdrantOperations,
    userId: string,
    queryVector: number[],
    options: SearchUserDocumentsOptions = {}
): Promise<UserDocumentSearchResult> {
    try {
        const {
            limit = 10,
            scoreThreshold = 0.5,
            sourceType = null,
            includePayload = true,
            hybridMode = false,
            query = null,
            hybridOptions = {}
        } = options;

        const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };

        if (sourceType) {
            filter.must!.push({ key: 'source_type', match: { value: sourceType } });
        }

        let searchResult: {
            success: boolean;
            results: Array<{ id: string | number; score: number; payload?: Record<string, unknown> }>;
            metadata?: Record<string, unknown>;
        };

        if (hybridMode && query) {
            console.log(`[VectorOperations] Performing hybrid search for user ${userId}`);

            const hybridResult = await qdrantOps.hybridSearch(
                'documents',
                queryVector,
                query,
                filter,
                {
                    limit,
                    threshold: scoreThreshold,
                    ...hybridOptions
                }
            );
            searchResult = {
                success: hybridResult.success,
                results: hybridResult.results.map(r => ({ id: r.id, score: r.score, payload: r.payload })),
                metadata: hybridResult.metadata as unknown as Record<string, unknown>
            };
        } else {
            console.log(`[VectorOperations] Performing vector search for user ${userId}`);

            const results = await qdrantOps.vectorSearch(
                'documents',
                queryVector,
                filter,
                {
                    limit,
                    threshold: scoreThreshold,
                    withPayload: includePayload
                }
            );

            searchResult = {
                success: true,
                results,
                metadata: {
                    searchType: 'vector',
                    resultsCount: results.length
                }
            };
        }

        return {
            success: true,
            results: searchResult.results || [],
            metadata: searchResult.metadata as { searchType: string; resultsCount: number; [key: string]: unknown } | undefined,
            query: {
                userId,
                limit,
                scoreThreshold,
                sourceType,
                hybridMode
            }
        };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VectorOperations] User document search failed:', error);
        return {
            success: false,
            results: [],
            query: {
                userId,
                limit: options.limit || 10,
                scoreThreshold: options.scoreThreshold || 0.5,
                sourceType: options.sourceType || null,
                hybridMode: options.hybridMode || false
            },
            error: errorMessage
        } as UserDocumentSearchResult & { error: string };
    }
}

/**
 * Delete all vectors for a specific document
 *
 * Removes all vector embeddings associated with a document,
 * optionally filtered by user ID for security.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param documentId - Document ID to delete
 * @param userId - Optional user ID for security filtering
 * @returns Delete operation result
 */
export async function deleteDocumentVectors(
    qdrantOps: QdrantOperations,
    documentId: string,
    userId: string | null = null
): Promise<DeleteResult> {
    try {
        const filter: QdrantFilter = { must: [{ key: 'document_id', match: { value: documentId } }] };

        if (userId) {
            filter.must!.push({ key: 'user_id', match: { value: userId } });
        }

        await qdrantOps.batchDelete('documents', filter);

        console.log(`[VectorOperations] Deleted vectors for document ${documentId}`);
        return { success: true, documentId };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VectorOperations] Failed to delete document vectors:', error);
        throw new Error(`Failed to delete document vectors: ${errorMessage}`);
    }
}

/**
 * Delete all vectors for a user
 *
 * Removes all document vectors owned by a specific user.
 * Used for data cleanup and offboarding.
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID whose vectors to delete
 * @returns Delete operation result
 */
export async function deleteUserDocuments(
    qdrantOps: QdrantOperations,
    userId: string
): Promise<DeleteResult> {
    try {
        const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };
        await qdrantOps.batchDelete('documents', filter);

        console.log(`[VectorOperations] Deleted all vectors for user ${userId}`);
        return { success: true, userId };

    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        console.error('[VectorOperations] Failed to delete user documents:', error);
        throw new Error(`Failed to delete user documents: ${errorMessage}`);
    }
}

/**
 * Get user's document statistics
 *
 * Retrieves comprehensive statistics about a user's stored vectors:
 * - Unique document count
 * - Total vector count
 * - Breakdown by source type (manual vs. Wolke)
 *
 * @param qdrantOps - QdrantOperations instance
 * @param userId - User ID to get statistics for
 * @returns Vector statistics
 */
export async function getUserVectorStats(
    qdrantOps: QdrantOperations,
    userId: string
): Promise<UserVectorStats> {
    try {
        const filter: QdrantFilter = { must: [{ key: 'user_id', match: { value: userId } }] };

        const documents = await qdrantOps.scrollDocuments('documents', filter, {
            limit: 1000,
            withPayload: true,
            withVector: false
        });

        const uniqueDocuments = new Set<string>();
        let manualVectors = 0;
        let wolkeVectors = 0;

        documents.forEach(doc => {
            const documentId = doc.payload.document_id;
            if (typeof documentId === 'string') {
                uniqueDocuments.add(documentId);
            }

            if (doc.payload.source_type === 'manual') {
                manualVectors++;
            } else if (doc.payload.source_type === 'wolke') {
                wolkeVectors++;
            }
        });

        return {
            uniqueDocuments: uniqueDocuments.size,
            totalVectors: documents.length,
            manualVectors,
            wolkeVectors
        };

    } catch (error) {
        console.error('[VectorOperations] Failed to get user stats:', error);
        return {
            uniqueDocuments: 0,
            totalVectors: 0,
            manualVectors: 0,
            wolkeVectors: 0
        };
    }
}
