/**
 * QAQdrantHelper - Q&A Collections specific Qdrant operations
 * Handles Q&A collection CRUD operations in Qdrant vector database
 */

import { getQdrantInstance } from './QdrantService.js';
import { QdrantOperations } from './QdrantOperations.js';
import { fastEmbedService } from '../../services/FastEmbedService.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class QAQdrantHelper {
    constructor() {
        this.qdrant = getQdrantInstance();
        this.qdrantOps = null;
        this.initialized = false;
    }

    /**
     * Ensure service is initialized
     */
    async ensureInitialized() {
        if (!this.initialized) {
            await this.qdrant.init();
            this.qdrantOps = new QdrantOperations(this.qdrant.client);
            this.initialized = true;
        }
    }

    /**
     * Generate numeric ID from UUID
     */
    generateNumericId(uuid) {
        const hash = crypto.createHash('md5').update(uuid).digest('hex');
        return parseInt(hash.substring(0, 8), 16);
    }

    /**
     * Generate dummy vector for non-vector collections
     */
    generateDummyVector() {
        return new Array(this.qdrant.vectorSize || 1024).fill(0.1);
    }

    /**
     * Generate embedding for Q&A collection metadata
     */
    async generateCollectionEmbedding(name, description = '', customPrompt = '') {
        await fastEmbedService.init();
        const text = `${name} ${description} ${customPrompt}`.trim();
        return await fastEmbedService.generateEmbedding(text);
    }

    /**
     * Store Q&A collection in Qdrant
     */
    async storeQACollection(collectionData) {
        await this.ensureInitialized();

        try {
            const collectionId = collectionData.id || uuidv4();
            const embedding = await this.generateCollectionEmbedding(
                collectionData.name,
                collectionData.description,
                collectionData.custom_prompt
            );

            const point = {
                id: this.generateNumericId(collectionId),
                vector: embedding,
                payload: {
                    collection_id: collectionId,
                    user_id: collectionData.user_id,
                    name: collectionData.name,
                    description: collectionData.description || null,
                    custom_prompt: collectionData.custom_prompt || null,
                    selection_mode: collectionData.selection_mode || 'documents',
                    wolke_share_link_ids: collectionData.wolke_share_link_ids || null,
                    auto_sync: collectionData.auto_sync === true,
                    remove_missing_on_sync: collectionData.remove_missing_on_sync === true,
                    created_at: collectionData.created_at || new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                    is_active: collectionData.is_active !== false,
                    settings: collectionData.settings || {},
                    document_count: collectionData.document_count || 0,
                    last_used_at: collectionData.last_used_at || null
                }
            };

            await this.qdrantOps.batchUpsert(this.qdrant.collections.qa_collections, [point]);

            console.log(`[QAQdrantHelper] Stored Q&A collection: ${collectionId}`);
            return { success: true, collection_id: collectionId };

        } catch (error) {
            console.error('[QAQdrantHelper] Error storing Q&A collection:', error);
            throw new Error(`Failed to store Q&A collection: ${error.message}`);
        }
    }

    /**
     * Get Q&A collection by ID
     */
    async getQACollection(collectionId) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.qa_collections,
                filter,
                { limit: 1, withPayload: true }
            );

            if (results.length === 0) {
                return null;
            }

            return this.formatCollectionFromPayload(results[0].payload);

        } catch (error) {
            console.error('[QAQdrantHelper] Error getting Q&A collection:', error);
            throw new Error(`Failed to get Q&A collection: ${error.message}`);
        }
    }

    /**
     * Get user's Q&A collections
     */
    async getUserQACollections(userId, options = {}) {
        await this.ensureInitialized();

        try {
            const { limit = 100, offset = 0 } = options;
            
            const filter = {
                must: [{ key: 'user_id', match: { value: userId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.qa_collections,
                filter,
                { limit, offset, withPayload: true }
            );

            const collections = results.map(result => this.formatCollectionFromPayload(result.payload));

            // Get document associations for each collection
            for (const collection of collections) {
                const documents = await this.getCollectionDocuments(collection.id);
                collection.qa_collection_documents = documents;
                collection.document_count = documents.length;
            }

            return collections;

        } catch (error) {
            console.error('[QAQdrantHelper] Error getting user Q&A collections:', error);
            throw new Error(`Failed to get user Q&A collections: ${error.message}`);
        }
    }

    /**
     * Update Q&A collection
     */
    async updateQACollection(collectionId, updateData) {
        await this.ensureInitialized();

        try {
            // First get existing collection
            const existingCollection = await this.getQACollection(collectionId);
            if (!existingCollection) {
                throw new Error('Q&A collection not found');
            }

            // Merge with updates
            const updatedData = {
                ...existingCollection,
                ...updateData,
                id: collectionId,
                updated_at: new Date().toISOString()
            };

            // Store updated collection
            await this.storeQACollection(updatedData);

            console.log(`[QAQdrantHelper] Updated Q&A collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[QAQdrantHelper] Error updating Q&A collection:', error);
            throw new Error(`Failed to update Q&A collection: ${error.message}`);
        }
    }

    /**
     * Delete Q&A collection
     */
    async deleteQACollection(collectionId) {
        await this.ensureInitialized();

        try {
            // Delete collection
            const collectionFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.qa_collections, collectionFilter);

            // Delete document associations
            const docsFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.qa_collection_documents, docsFilter);

            // Delete public access tokens
            const accessFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.qa_public_access, accessFilter);

            console.log(`[QAQdrantHelper] Deleted Q&A collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[QAQdrantHelper] Error deleting Q&A collection:', error);
            throw new Error(`Failed to delete Q&A collection: ${error.message}`);
        }
    }

    /**
     * Add documents to Q&A collection
     */
    async addDocumentsToCollection(collectionId, documentIds, addedBy = null) {
        await this.ensureInitialized();

        try {
            const points = documentIds.map(documentId => ({
                id: this.generateNumericId(`${collectionId}_${documentId}`),
                vector: this.generateDummyVector(),
                payload: {
                    collection_id: collectionId,
                    document_id: documentId,
                    added_at: new Date().toISOString(),
                    added_by: addedBy
                }
            }));

            await this.qdrantOps.batchUpsert(this.qdrant.collections.qa_collection_documents, points);

            console.log(`[QAQdrantHelper] Added ${documentIds.length} documents to collection: ${collectionId}`);
            return { success: true, added_count: documentIds.length };

        } catch (error) {
            console.error('[QAQdrantHelper] Error adding documents to collection:', error);
            throw new Error(`Failed to add documents to collection: ${error.message}`);
        }
    }

    /**
     * Remove documents from Q&A collection
     */
    async removeDocumentsFromCollection(collectionId, documentIds) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [
                    { key: 'collection_id', match: { value: collectionId } },
                    { key: 'document_id', match: { any: documentIds } }
                ]
            };

            await this.qdrantOps.batchDelete(this.qdrant.collections.qa_collection_documents, filter);

            console.log(`[QAQdrantHelper] Removed ${documentIds.length} documents from collection: ${collectionId}`);
            return { success: true, removed_count: documentIds.length };

        } catch (error) {
            console.error('[QAQdrantHelper] Error removing documents from collection:', error);
            throw new Error(`Failed to remove documents from collection: ${error.message}`);
        }
    }

    /**
     * Get documents associated with a Q&A collection
     */
    async getCollectionDocuments(collectionId) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.qa_collection_documents,
                filter,
                { limit: 1000, withPayload: true }
            );

            return results.map(result => ({
                document_id: result.payload.document_id,
                added_at: result.payload.added_at,
                added_by: result.payload.added_by
            }));

        } catch (error) {
            console.error('[QAQdrantHelper] Error getting collection documents:', error);
            return [];
        }
    }

    /**
     * Create public access token
     */
    async createPublicAccess(collectionId, createdBy = null, expiresAt = null) {
        await this.ensureInitialized();

        try {
            const accessToken = crypto.randomBytes(32).toString('hex');
            
            const point = {
                id: this.generateNumericId(accessToken),
                vector: this.generateDummyVector(),
                payload: {
                    collection_id: collectionId,
                    access_token: accessToken,
                    created_at: new Date().toISOString(),
                    expires_at: expiresAt,
                    created_by: createdBy,
                    is_active: true,
                    view_count: 0,
                    last_accessed_at: null
                }
            };

            await this.qdrantOps.batchUpsert(this.qdrant.collections.qa_public_access, [point]);

            console.log(`[QAQdrantHelper] Created public access for collection: ${collectionId}`);
            return { success: true, access_token: accessToken };

        } catch (error) {
            console.error('[QAQdrantHelper] Error creating public access:', error);
            throw new Error(`Failed to create public access: ${error.message}`);
        }
    }

    /**
     * Get public access by token
     */
    async getPublicAccess(accessToken) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'access_token', match: { value: accessToken } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.qa_public_access,
                filter,
                { limit: 1, withPayload: true }
            );

            if (results.length === 0) {
                return null;
            }

            return results[0].payload;

        } catch (error) {
            console.error('[QAQdrantHelper] Error getting public access:', error);
            throw new Error(`Failed to get public access: ${error.message}`);
        }
    }

    /**
     * Revoke public access
     */
    async revokePublicAccess(collectionId) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };

            await this.qdrantOps.batchDelete(this.qdrant.collections.qa_public_access, filter);

            console.log(`[QAQdrantHelper] Revoked public access for collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[QAQdrantHelper] Error revoking public access:', error);
            throw new Error(`Failed to revoke public access: ${error.message}`);
        }
    }

    /**
     * Log Q&A usage
     */
    async logQAUsage(collectionId, userId, question, answerLength, responseTime, metadata = {}) {
        await this.ensureInitialized();

        try {
            // Generate embedding for the question for analytics
            await fastEmbedService.init();
            const questionEmbedding = await fastEmbedService.generateEmbedding(question);

            const point = {
                id: this.generateNumericId(uuidv4()),
                vector: questionEmbedding,
                payload: {
                    collection_id: collectionId,
                    user_id: userId,
                    question: question,
                    answer_length: answerLength,
                    response_time_ms: responseTime,
                    created_at: new Date().toISOString(),
                    ip_address: metadata.ip_address || null,
                    user_agent: metadata.user_agent || null
                }
            };

            await this.qdrantOps.batchUpsert(this.qdrant.collections.qa_usage_logs, [point]);

            console.log(`[QAQdrantHelper] Logged Q&A usage for collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[QAQdrantHelper] Error logging Q&A usage:', error);
            // Don't throw error for logging failures
            return { success: false, error: error.message };
        }
    }

    /**
     * Format collection data from Qdrant payload
     */
    formatCollectionFromPayload(payload) {
        return {
            id: payload.collection_id,
            user_id: payload.user_id,
            name: payload.name,
            description: payload.description,
            custom_prompt: payload.custom_prompt,
            selection_mode: payload.selection_mode || 'documents',
            wolke_share_link_ids: payload.wolke_share_link_ids || [],
            auto_sync: !!payload.auto_sync,
            remove_missing_on_sync: !!payload.remove_missing_on_sync,
            created_at: payload.created_at,
            updated_at: payload.updated_at,
            is_active: payload.is_active,
            settings: payload.settings || {},
            document_count: payload.document_count || 0,
            last_used_at: payload.last_used_at
        };
    }

    /**
     * Bulk delete collections
     */
    async bulkDeleteCollections(collectionIds, userId) {
        await this.ensureInitialized();

        try {
            const results = { deleted: [], failed: [] };

            for (const collectionId of collectionIds) {
                try {
                    // Verify ownership
                    const collection = await this.getQACollection(collectionId);
                    if (!collection || collection.user_id !== userId) {
                        results.failed.push({ id: collectionId, error: 'Not found or access denied' });
                        continue;
                    }

                    await this.deleteQACollection(collectionId);
                    results.deleted.push(collectionId);

                } catch (error) {
                    results.failed.push({ id: collectionId, error: error.message });
                }
            }

            return { success: true, results };

        } catch (error) {
            console.error('[QAQdrantHelper] Error in bulk delete:', error);
            throw new Error(`Bulk delete failed: ${error.message}`);
        }
    }
}

export { QAQdrantHelper };
