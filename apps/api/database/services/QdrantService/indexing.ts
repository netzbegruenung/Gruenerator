/**
 * QdrantService Indexing Functions
 * Extracted indexing operations for document and content vectors
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import { chunkToNumericId, stringToNumericId } from './utils.js';
import { createLogger } from '../../../utils/logger.js';
import type {
    IndexResult,
    ChunkData,
    ContentExampleMetadata as ContentExampleMeta
} from './types.js';

const log = createLogger('QdrantIndexing');

// Extended chunk types for specific use cases
export interface DocumentChunk extends ChunkData {
    chunk_index?: number;
    title?: string;
    filename?: string;
}

export interface GrundsatzChunk extends ChunkData {
    metadata?: {
        content_type?: string;
        page_number?: number;
        title?: string;
        filename?: string;
        [key: string]: unknown;
    };
}

export interface WebContentChunk {
    embedding: number[];
    text?: string;
    chunk_text?: string;
    token_count?: number;
    tokens?: number;
}

export interface WebContentMetadata {
    title?: string;
    primary_category?: string;
    section?: string;
    published_at?: string;
    content_hash?: string;
}

export interface ContentExampleMetadata extends ContentExampleMeta {
    // Inherits all fields from types.ts ContentExampleMetadata
}

export interface SocialMediaIndexMetadata {
    country?: 'DE' | 'AT';
    source_account?: string;
    engagement?: number;
}

/**
 * Index document chunks with vectors
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param documentId - Document identifier
 * @param chunks - Array of chunks with embeddings
 * @param userId - Optional user ID for ownership
 */
export async function indexDocumentChunks(
    client: QdrantClient,
    collectionName: string,
    documentId: string,
    chunks: DocumentChunk[],
    userId: string | null = null
): Promise<IndexResult> {
    try {
        const points = chunks.map((chunk, index) => {
            const chunkIdx = chunk.chunk_index ?? index;
            return {
                id: chunkToNumericId(documentId, chunkIdx),
                vector: chunk.embedding,
                payload: {
                    document_id: documentId,
                    chunk_index: chunkIdx,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    user_id: userId,
                    title: chunk.title || chunk.metadata?.title || null,
                    filename: chunk.filename || chunk.metadata?.filename || null,
                    metadata: chunk.metadata || {},
                    created_at: new Date().toISOString()
                }
            };
        });

        await client.upsert(collectionName, {
            points: points
        });

        log.debug(`Indexed ${chunks.length} chunks for document ${documentId}`);
        return { success: true, chunks: chunks.length };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index document chunks: ${message}`);
        throw new Error(`Vector indexing failed: ${message}`);
    }
}

/**
 * Index grundsatz document chunks
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param documentId - Document identifier
 * @param chunks - Array of grundsatz chunks with embeddings
 */
export async function indexGrundsatzChunks(
    client: QdrantClient,
    collectionName: string,
    documentId: string,
    chunks: GrundsatzChunk[]
): Promise<IndexResult> {
    try {
        const points = chunks.map((chunk, index) => {
            return {
                id: chunkToNumericId(documentId, index),
                vector: chunk.embedding,
                payload: {
                    document_id: documentId,
                    chunk_index: index,
                    chunk_text: chunk.text || chunk.chunk_text,
                    token_count: chunk.token_count || chunk.tokens,
                    content_type: chunk.metadata?.content_type,
                    page_number: (typeof chunk.metadata?.page_number === 'number')
                        ? chunk.metadata.page_number
                        : (index + 1),
                    title: chunk.metadata?.title || 'Grundsatzprogramm',
                    filename: chunk.metadata?.filename || '',
                    metadata: chunk.metadata || {},
                    document_type: 'grundsatz',
                    created_at: new Date().toISOString()
                }
            };
        });

        await client.upsert(collectionName, {
            points: points
        });

        log.debug(`Indexed ${chunks.length} grundsatz chunks for document ${documentId}`);
        return { success: true, chunks: chunks.length };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index grundsatz chunks: ${message}`);
        throw new Error(`Grundsatz vector indexing failed: ${message}`);
    }
}

/**
 * Index bundestag content chunks
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param url - Source URL
 * @param chunks - Processed chunks with embeddings
 * @param metadata - Page metadata (title, primary_category, published_at, content_hash)
 */
export async function indexBundestagContent(
    client: QdrantClient,
    collectionName: string,
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
): Promise<IndexResult> {
    try {
        const points = chunks.map((chunk, index) => ({
            id: chunkToNumericId(url, index),
            vector: chunk.embedding,
            payload: {
                source_url: url,
                chunk_index: index,
                chunk_text: chunk.text || chunk.chunk_text,
                token_count: chunk.token_count || chunk.tokens,
                title: metadata.title || null,
                primary_category: metadata.primary_category || metadata.section || null,
                published_at: metadata.published_at || null,
                content_hash: metadata.content_hash || null,
                country: 'DE',
                indexed_at: new Date().toISOString()
            }
        }));

        await client.upsert(collectionName, {
            points: points
        });

        log.debug(`Indexed ${chunks.length} chunks for bundestag URL: ${url}`);
        return { success: true, chunks: chunks.length };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index bundestag content: ${message}`);
        throw new Error(`Bundestag indexing failed: ${message}`);
    }
}

/**
 * Index gruene.de content chunks
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param url - Source URL
 * @param chunks - Processed chunks with embeddings
 * @param metadata - Page metadata (title, primary_category, published_at, content_hash)
 */
export async function indexGrueneDeContent(
    client: QdrantClient,
    collectionName: string,
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
): Promise<IndexResult> {
    try {
        const points = chunks.map((chunk, index) => ({
            id: chunkToNumericId(url, index),
            vector: chunk.embedding,
            payload: {
                source_url: url,
                chunk_index: index,
                chunk_text: chunk.text || chunk.chunk_text,
                token_count: chunk.token_count || chunk.tokens,
                title: metadata.title || null,
                primary_category: metadata.primary_category || metadata.section || null,
                published_at: metadata.published_at || null,
                content_hash: metadata.content_hash || null,
                country: 'DE',
                indexed_at: new Date().toISOString()
            }
        }));

        await client.upsert(collectionName, {
            points: points
        });

        log.debug(`Indexed ${chunks.length} chunks for gruene.de URL: ${url}`);
        return { success: true, chunks: chunks.length };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index gruene.de content: ${message}`);
        throw new Error(`gruene.de indexing failed: ${message}`);
    }
}

/**
 * Index gruene.at content chunks
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param url - Source URL
 * @param chunks - Processed chunks with embeddings
 * @param metadata - Page metadata (title, primary_category, published_at, content_hash)
 */
export async function indexGrueneAtContent(
    client: QdrantClient,
    collectionName: string,
    url: string,
    chunks: WebContentChunk[],
    metadata: WebContentMetadata = {}
): Promise<IndexResult> {
    try {
        const points = chunks.map((chunk, index) => ({
            id: chunkToNumericId(url, index),
            vector: chunk.embedding,
            payload: {
                source_url: url,
                chunk_index: index,
                chunk_text: chunk.text || chunk.chunk_text,
                token_count: chunk.token_count || chunk.tokens,
                title: metadata.title || null,
                primary_category: metadata.primary_category || metadata.section || null,
                published_at: metadata.published_at || null,
                content_hash: metadata.content_hash || null,
                country: 'AT',
                indexed_at: new Date().toISOString()
            }
        }));

        await client.upsert(collectionName, {
            points: points
        });

        log.debug(`Indexed ${chunks.length} chunks for gruene.at URL: ${url}`);
        return { success: true, chunks: chunks.length };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index gruene.at content: ${message}`);
        throw new Error(`gruene.at indexing failed: ${message}`);
    }
}

/**
 * Index content example
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param exampleId - Unique example identifier
 * @param embedding - Vector embedding
 * @param metadata - Content example metadata
 */
export async function indexContentExample(
    client: QdrantClient,
    collectionName: string,
    exampleId: string,
    embedding: number[],
    metadata: ContentExampleMetadata
): Promise<{ success: boolean }> {
    try {
        const point = {
            id: stringToNumericId(exampleId),
            vector: embedding,
            payload: {
                example_id: exampleId,
                type: metadata.type,
                title: metadata.title,
                content: metadata.content,
                categories: metadata.categories || [],
                tags: metadata.tags || [],
                description: metadata.description,
                content_data: metadata.content_data,
                metadata: metadata.metadata || {},
                created_at: metadata.created_at || new Date().toISOString()
            }
        };

        await client.upsert(collectionName, {
            points: [point]
        });

        log.debug(`Indexed content example ${exampleId}`);
        return { success: true };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index content example: ${message}`);
        throw new Error(`Content example indexing failed: ${message}`);
    }
}

/**
 * Index social media example (Facebook or Instagram) with multitenancy
 * @param client - Qdrant client instance
 * @param collectionName - Target collection name
 * @param exampleId - Unique example identifier
 * @param embedding - 1024-dim embedding vector
 * @param content - Post content/caption
 * @param platform - 'facebook' or 'instagram'
 * @param metadata - Optional metadata (country, source_account, engagement)
 */
export async function indexSocialMediaExample(
    client: QdrantClient,
    collectionName: string,
    exampleId: string,
    embedding: number[],
    content: string,
    platform: 'facebook' | 'instagram',
    metadata: SocialMediaIndexMetadata = {}
): Promise<{ success: boolean }> {
    try {
        const payload: Record<string, unknown> = {
            example_id: exampleId,
            platform: platform,
            content: content,
            created_at: new Date().toISOString()
        };

        // Add optional metadata fields if provided
        if (metadata.country) {
            payload.country = metadata.country; // 'DE' or 'AT'
        }
        if (metadata.source_account) {
            payload.source_account = metadata.source_account;
        }
        if (metadata.engagement) {
            payload.engagement = metadata.engagement;
        }

        const point = {
            id: stringToNumericId(exampleId),
            vector: embedding,
            payload: payload
        };

        await client.upsert(collectionName, {
            points: [point]
        });

        const countryInfo = metadata.country ? ` (${metadata.country})` : '';
        log.debug(`Indexed ${platform} example ${exampleId}${countryInfo}`);
        return { success: true };

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        log.error(`Failed to index ${platform} example: ${message}`);
        throw new Error(`${platform} example indexing failed: ${message}`);
    }
}
