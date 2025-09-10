import { getPostgresInstance } from '../database/services/PostgresService.js';

/**
 * PostgresDocumentService - Handles document metadata operations with PostgreSQL
 * This service manages document metadata only, not file storage
 */
class PostgresDocumentService {
    constructor() {
        this.postgres = getPostgresInstance();
    }

    /**
     * Ensure PostgreSQL is initialized
     */
    async ensureInitialized() {
        await this.postgres.ensureInitialized();
    }

    /**
     * Get user's document mode preference
     */
    async getUserDocumentMode(userId) {
        try {
            await this.ensureInitialized();
            
            const user = await this.postgres.queryOne(
                'SELECT document_mode FROM profiles WHERE id = $1',
                [userId],
                { table: 'profiles' }
            );
            
            return user?.document_mode || 'manual';
        } catch (error) {
            console.error('[PostgresDocumentService] Error getting user document mode:', error);
            throw new Error('Failed to get document mode');
        }
    }

    /**
     * Set user's document mode preference
     */
    async setUserDocumentMode(userId, mode) {
        try {
            await this.ensureInitialized();
            
            if (!['manual', 'wolke'].includes(mode)) {
                throw new Error('Invalid document mode. Must be "manual" or "wolke"');
            }
            
            const result = await this.postgres.update(
                'profiles',
                { document_mode: mode },
                { id: userId }
            );
            
            if (result.changes === 0) {
                throw new Error('User not found or mode not updated');
            }
            
            console.log(`[PostgresDocumentService] User ${userId} document mode set to: ${mode}`);
            return { mode, success: true };
        } catch (error) {
            console.error('[PostgresDocumentService] Error setting user document mode:', error);
            throw error;
        }
    }

    /**
     * Save document metadata (no file content)
     */
    async saveDocumentMetadata(userId, metadata) {
        try {
            await this.ensureInitialized();
            
            const documentData = {
                user_id: userId,
                title: metadata.title,
                filename: metadata.filename || null,
                source_type: metadata.sourceType || 'manual',
                wolke_share_link_id: metadata.wolkeShareLinkId || null,
                wolke_file_path: metadata.wolkeFilePath || null,
                wolke_etag: metadata.wolkeEtag || null,
                vector_count: metadata.vectorCount || 0,
                file_size: metadata.fileSize || 0,
                status: metadata.status || 'processing',
                metadata: metadata.additionalMetadata ? JSON.stringify(metadata.additionalMetadata) : null
            };
            
            const document = await this.postgres.insert('documents', documentData);
            console.log(`[PostgresDocumentService] Document metadata saved: ${document.id}`);
            
            return document;
        } catch (error) {
            console.error('[PostgresDocumentService] Error saving document metadata:', error);
            throw new Error('Failed to save document metadata');
        }
    }

    /**
     * Update document metadata
     */
    async updateDocumentMetadata(documentId, userId, updates) {
        try {
            await this.ensureInitialized();
            
            // Ensure user owns the document
            const document = await this.postgres.queryOne(
                'SELECT id FROM documents WHERE id = $1 AND user_id = $2',
                [documentId, userId]
            );
            
            if (!document) {
                throw new Error('Document not found or access denied');
            }
            
            // Prepare updates
            const updateData = {};
            if (updates.title !== undefined) updateData.title = updates.title;
            if (updates.status !== undefined) updateData.status = updates.status;
            if (updates.vectorCount !== undefined) updateData.vector_count = updates.vectorCount;
            if (updates.wolkeEtag !== undefined) updateData.wolke_etag = updates.wolkeEtag;
            if (updates.lastSyncedAt !== undefined) updateData.last_synced_at = updates.lastSyncedAt;
            if (updates.additionalMetadata !== undefined) {
                // Merge with existing metadata to avoid losing fields
                const current = await this.postgres.queryOne(
                    'SELECT metadata FROM documents WHERE id = $1 AND user_id = $2',
                    [documentId, userId]
                );
                let baseMeta = {};
                try {
                    baseMeta = current?.metadata ? JSON.parse(current.metadata) : {};
                } catch (e) {
                    baseMeta = {};
                }
                updateData.metadata = JSON.stringify({
                    ...baseMeta,
                    ...updates.additionalMetadata
                });
            }
            
            const result = await this.postgres.update(
                'documents',
                updateData,
                { id: documentId, user_id: userId }
            );
            
            console.log(`[PostgresDocumentService] Document ${documentId} updated`);
            return result.data[0];
        } catch (error) {
            console.error('[PostgresDocumentService] Error updating document metadata:', error);
            throw error;
        }
    }

    /**
     * Get documents by source type for a user
     */
    async getDocumentsBySourceType(userId, sourceType = null) {
        try {
            await this.ensureInitialized();
            
            let query = 'SELECT * FROM documents WHERE user_id = $1';
            let params = [userId];
            
            if (sourceType) {
                query += ' AND source_type = $2';
                params.push(sourceType);
            }
            
            query += ' ORDER BY created_at DESC';
            
            const documents = await this.postgres.query(query, params, { table: 'documents' });
            return documents;
        } catch (error) {
            console.error('[PostgresDocumentService] Error getting documents by source type:', error);
            throw new Error('Failed to get documents');
        }
    }

    /**
     * Get document by ID (with ownership check)
     */
    async getDocumentById(documentId, userId) {
        try {
            await this.ensureInitialized();
            
            const document = await this.postgres.queryOne(
                'SELECT * FROM documents WHERE id = $1 AND user_id = $2',
                [documentId, userId],
                { table: 'documents' }
            );
            
            return document;
        } catch (error) {
            console.error('[PostgresDocumentService] Error getting document by ID:', error);
            throw new Error('Failed to get document');
        }
    }

    /**
     * Delete document metadata
     */
    async deleteDocument(documentId, userId) {
        try {
            await this.ensureInitialized();
            
            const result = await this.postgres.delete('documents', {
                id: documentId,
                user_id: userId
            });
            
            if (result.changes === 0) {
                throw new Error('Document not found or access denied');
            }
            
            console.log(`[PostgresDocumentService] Document ${documentId} deleted`);
            return { success: true, deletedId: documentId };
        } catch (error) {
            console.error('[PostgresDocumentService] Error deleting document:', error);
            throw error;
        }
    }

    /**
     * Bulk delete documents
     */
    async bulkDeleteDocuments(documentIds, userId) {
        try {
            await this.ensureInitialized();
            
            // Build query for bulk delete with user ownership check
            const placeholders = documentIds.map((_, index) => `$${index + 2}`).join(',');
            const query = `DELETE FROM documents WHERE user_id = $1 AND id IN (${placeholders}) RETURNING id`;
            
            const result = await this.postgres.query(query, [userId, ...documentIds]);
            
            console.log(`[PostgresDocumentService] Bulk deleted ${result.length} documents for user ${userId}`);
            return {
                success: true,
                deletedCount: result.length,
                deletedIds: result.map(row => row.id)
            };
        } catch (error) {
            console.error('[PostgresDocumentService] Error bulk deleting documents:', error);
            throw new Error('Failed to bulk delete documents');
        }
    }

    /**
     * Store document full text (for text-only system)
     */
    async storeDocumentText(documentId, userId, text) {
        try {
            await this.ensureInitialized();
            
            // Check if document exists and user owns it
            const document = await this.getDocumentById(documentId, userId);
            if (!document) {
                throw new Error('Document not found or access denied');
            }
            
            // Update document with full text in metadata
            const updates = {
                metadata: JSON.stringify({
                    ...(document.metadata ? JSON.parse(document.metadata) : {}),
                    full_text: text,
                    text_length: text.length,
                    stored_at: new Date().toISOString()
                })
            };
            
            await this.postgres.update('documents', updates, { 
                id: documentId, 
                user_id: userId 
            });
            
            console.log(`[PostgresDocumentService] Stored full text for document ${documentId} (${text.length} chars)`);
            return { success: true, textLength: text.length };
            
        } catch (error) {
            console.error('[PostgresDocumentService] Error storing document text:', error);
            throw error;
        }
    }

    /**
     * Retrieve document full text
     */
    async getDocumentText(documentId, userId) {
        try {
            await this.ensureInitialized();
            
            const document = await this.getDocumentById(documentId, userId);
            if (!document) {
                throw new Error('Document not found or access denied');
            }
            
            const metadata = document.metadata ? JSON.parse(document.metadata) : {};
            const fullText = metadata.full_text || '';
            
            return {
                success: true,
                text: fullText,
                textLength: fullText.length,
                storedAt: metadata.stored_at || document.created_at
            };
            
        } catch (error) {
            console.error('[PostgresDocumentService] Error retrieving document text:', error);
            throw error;
        }
    }

    /**
     * Create document with text content (text-only system)
     */
    async createDocumentWithText(userId, metadata, text) {
        try {
            await this.ensureInitialized();
            
            const documentData = {
                user_id: userId,
                title: metadata.title,
                filename: metadata.filename || null,
                source_type: metadata.sourceType || 'manual',
                wolke_share_link_id: metadata.wolkeShareLinkId || null,
                wolke_file_path: metadata.wolkeFilePath || null,
                vector_count: 0, // Will be updated after vector generation
                file_size: text ? text.length : 0,
                status: 'pending',
                metadata: JSON.stringify({
                    ...metadata.additionalMetadata,
                    full_text: text,
                    text_length: text ? text.length : 0,
                    created_at: new Date().toISOString()
                })
            };
            
            const document = await this.postgres.insert('documents', documentData);
            console.log(`[PostgresDocumentService] Created document with text: ${document.id}`);
            
            return document;
        } catch (error) {
            console.error('[PostgresDocumentService] Error creating document with text:', error);
            throw new Error('Failed to create document with text');
        }
    }

    /**
     * Get user's document statistics
     */
    async getDocumentStats(userId) {
        try {
            await this.ensureInitialized();
            
            const stats = await this.postgres.queryOne(`
                SELECT 
                    COUNT(*) as total_documents,
                    COUNT(CASE WHEN source_type = 'manual' THEN 1 END) as manual_documents,
                    COUNT(CASE WHEN source_type = 'wolke' THEN 1 END) as wolke_documents,
                    COUNT(CASE WHEN status = 'completed' THEN 1 END) as completed_documents,
                    COUNT(CASE WHEN status = 'processing' THEN 1 END) as processing_documents,
                    COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_documents,
                    SUM(vector_count) as total_vectors
                FROM documents 
                WHERE user_id = $1
            `, [userId]);
            
            return {
                totalDocuments: parseInt(stats.total_documents) || 0,
                manualDocuments: parseInt(stats.manual_documents) || 0,
                wolkeDocuments: parseInt(stats.wolke_documents) || 0,
                completedDocuments: parseInt(stats.completed_documents) || 0,
                processingDocuments: parseInt(stats.processing_documents) || 0,
                failedDocuments: parseInt(stats.failed_documents) || 0,
                totalVectors: parseInt(stats.total_vectors) || 0
            };
        } catch (error) {
            console.error('[PostgresDocumentService] Error getting document stats:', error);
            throw new Error('Failed to get document statistics');
        }
    }
}

// Export singleton instance
let postgresDocumentServiceInstance = null;

export function getPostgresDocumentService() {
    if (!postgresDocumentServiceInstance) {
        postgresDocumentServiceInstance = new PostgresDocumentService();
    }
    return postgresDocumentServiceInstance;
}

export { PostgresDocumentService };
export default PostgresDocumentService;
