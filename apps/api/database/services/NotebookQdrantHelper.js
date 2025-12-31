/**
 * NotebookQdrantHelper - Notebook Collections specific Qdrant operations
 * Handles Notebook collection CRUD operations in Qdrant vector database
 */

import { getQdrantInstance } from './QdrantService.js';
import { QdrantOperations } from './QdrantOperations.js';
import { fastEmbedService } from '../../services/FastEmbedService.js';
import { getSystemCollectionConfig } from '../../config/systemCollectionsConfig.js';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';

class NotebookQdrantHelper {
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
     * Generate embedding for Notebook collection metadata
     */
    async generateCollectionEmbedding(name, description = '', customPrompt = '') {
        await fastEmbedService.init();
        const text = `${name} ${description} ${customPrompt}`.trim();
        return await fastEmbedService.generateEmbedding(text);
    }

    /**
     * Store Notebook collection in Qdrant
     */
    async storeNotebookCollection(collectionData) {
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

            await this.qdrantOps.batchUpsert(this.qdrant.collections.notebook_collections, [point]);

            console.log(`[NotebookQdrantHelper] Stored Notebook collection: ${collectionId}`);
            return { success: true, collection_id: collectionId };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error storing Notebook collection:', error);
            throw new Error(`Failed to store Notebook collection: ${error.message}`);
        }
    }

    /**
     * Get Notebook collection by ID
     */
    async getNotebookCollection(collectionId) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.notebook_collections,
                filter,
                { limit: 1, withPayload: true }
            );

            if (results.length === 0) {
                return null;
            }

            return this.formatCollectionFromPayload(results[0].payload);

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error getting Notebook collection:', error);
            throw new Error(`Failed to get Notebook collection: ${error.message}`);
        }
    }

    /**
     * Get user's Notebook collections
     */
    async getUserNotebookCollections(userId, options = {}) {
        await this.ensureInitialized();

        try {
            const { limit = 100, offset = 0 } = options;
            
            const filter = {
                must: [{ key: 'user_id', match: { value: userId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.notebook_collections,
                filter,
                { limit, offset, withPayload: true }
            );

            const collections = results.map(result => this.formatCollectionFromPayload(result.payload));

            // Get document associations for each collection
            for (const collection of collections) {
                const documents = await this.getCollectionDocuments(collection.id);
                collection.notebook_collection_documents = documents;
                collection.document_count = documents.length;
            }

            return collections;

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error getting user Notebook collections:', error);
            throw new Error(`Failed to get user Notebook collections: ${error.message}`);
        }
    }

    /**
     * Update Notebook collection
     */
    async updateNotebookCollection(collectionId, updateData) {
        await this.ensureInitialized();

        try {
            // First get existing collection
            const existingCollection = await this.getNotebookCollection(collectionId);
            if (!existingCollection) {
                throw new Error('Notebook collection not found');
            }

            // Merge with updates
            const updatedData = {
                ...existingCollection,
                ...updateData,
                id: collectionId,
                updated_at: new Date().toISOString()
            };

            // Store updated collection
            await this.storeNotebookCollection(updatedData);

            console.log(`[NotebookQdrantHelper] Updated Notebook collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error updating Notebook collection:', error);
            throw new Error(`Failed to update Notebook collection: ${error.message}`);
        }
    }

    /**
     * Delete Notebook collection
     */
    async deleteNotebookCollection(collectionId) {
        await this.ensureInitialized();

        try {
            // Delete collection
            const collectionFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.notebook_collections, collectionFilter);

            // Delete document associations
            const docsFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.notebook_collection_documents, docsFilter);

            // Delete public access tokens
            const accessFilter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };
            await this.qdrantOps.batchDelete(this.qdrant.collections.notebook_public_access, accessFilter);

            console.log(`[NotebookQdrantHelper] Deleted Notebook collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error deleting Notebook collection:', error);
            throw new Error(`Failed to delete Notebook collection: ${error.message}`);
        }
    }

    /**
     * Add documents to Notebook collection
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

            await this.qdrantOps.batchUpsert(this.qdrant.collections.notebook_collection_documents, points);

            console.log(`[NotebookQdrantHelper] Added ${documentIds.length} documents to collection: ${collectionId}`);
            return { success: true, added_count: documentIds.length };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error adding documents to collection:', error);
            throw new Error(`Failed to add documents to collection: ${error.message}`);
        }
    }

    /**
     * Remove documents from Notebook collection
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

            await this.qdrantOps.batchDelete(this.qdrant.collections.notebook_collection_documents, filter);

            console.log(`[NotebookQdrantHelper] Removed ${documentIds.length} documents from collection: ${collectionId}`);
            return { success: true, removed_count: documentIds.length };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error removing documents from collection:', error);
            throw new Error(`Failed to remove documents from collection: ${error.message}`);
        }
    }

    /**
     * Get documents associated with a Notebook collection
     */
    async getCollectionDocuments(collectionId) {
        await this.ensureInitialized();

        try {
            const filter = {
                must: [{ key: 'collection_id', match: { value: collectionId } }]
            };

            const results = await this.qdrantOps.scrollDocuments(
                this.qdrant.collections.notebook_collection_documents,
                filter,
                { limit: 1000, withPayload: true }
            );

            return results.map(result => ({
                document_id: result.payload.document_id,
                added_at: result.payload.added_at,
                added_by: result.payload.added_by
            }));

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error getting collection documents:', error);
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

            await this.qdrantOps.batchUpsert(this.qdrant.collections.notebook_public_access, [point]);

            console.log(`[NotebookQdrantHelper] Created public access for collection: ${collectionId}`);
            return { success: true, access_token: accessToken };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error creating public access:', error);
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
                this.qdrant.collections.notebook_public_access,
                filter,
                { limit: 1, withPayload: true }
            );

            if (results.length === 0) {
                return null;
            }

            return results[0].payload;

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error getting public access:', error);
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

            await this.qdrantOps.batchDelete(this.qdrant.collections.notebook_public_access, filter);

            console.log(`[NotebookQdrantHelper] Revoked public access for collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error revoking public access:', error);
            throw new Error(`Failed to revoke public access: ${error.message}`);
        }
    }

    /**
     * Log Notebook usage
     */
    async logNotebookUsage(collectionId, userId, question, answerLength, responseTime, metadata = {}) {
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

            await this.qdrantOps.batchUpsert(this.qdrant.collections.notebook_usage_logs, [point]);

            console.log(`[NotebookQdrantHelper] Logged Notebook usage for collection: ${collectionId}`);
            return { success: true };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error logging Notebook usage:', error);
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
                    const collection = await this.getNotebookCollection(collectionId);
                    if (!collection || collection.user_id !== userId) {
                        results.failed.push({ id: collectionId, error: 'Not found or access denied' });
                        continue;
                    }

                    await this.deleteNotebookCollection(collectionId);
                    results.deleted.push(collectionId);

                } catch (error) {
                    results.failed.push({ id: collectionId, error: error.message });
                }
            }

            return { success: true, results };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error in bulk delete:', error);
            throw new Error(`Bulk delete failed: ${error.message}`);
        }
    }

    /**
     * Create the system Grundsatz collection if it doesn't exist
     */
    async ensureSystemGrundsatzCollection() {
        await this.ensureInitialized();

        const config = getSystemCollectionConfig('grundsatz-system');
        const systemCollectionId = config.id;

        try {
            // Check if the system collection already exists
            const existingCollection = await this.getNotebookCollection(systemCollectionId);
            if (existingCollection) {
                console.log(`[NotebookQdrantHelper] System Grundsatz collection already exists: ${systemCollectionId}`);
                return { success: true, collection_id: systemCollectionId, created: false };
            }

            // Import COMPREHENSIVE_DOSSIER_INSTRUCTIONS
            const { COMPREHENSIVE_DOSSIER_INSTRUCTIONS } = await import('../../utils/promptUtils.js');

            // Create the system Grundsatz collection using centralized config
            const systemCollectionData = {
                id: systemCollectionId,
                user_id: 'SYSTEM',
                name: config.name,
                description: config.description,
                custom_prompt: COMPREHENSIVE_DOSSIER_INSTRUCTIONS,
                selection_mode: 'documents',
                is_active: true,
                settings: {
                    min_quality: config.minQuality,
                    system_collection: true,
                    allow_public: false
                },
                created_at: new Date().toISOString()
            };

            const result = await this.storeNotebookCollection(systemCollectionData);
            console.log(`[NotebookQdrantHelper] Created system Grundsatz collection: ${systemCollectionId}`);
            return { ...result, created: true };

        } catch (error) {
            console.error('[NotebookQdrantHelper] Error creating system Grundsatz collection:', error);
            throw new Error(`Failed to create system Grundsatz collection: ${error.message}`);
        }
    }
}

export { NotebookQdrantHelper };
