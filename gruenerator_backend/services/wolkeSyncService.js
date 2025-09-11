import { getPostgresInstance } from '../database/services/PostgresService.js';
import { DocumentSearchService } from './DocumentSearchService.js';
import { getPostgresDocumentService } from './postgresDocumentService.js';
import { NextcloudShareManager } from '../utils/nextcloudShareManager.js';
import NextcloudApiClient from './nextcloudApiClient.js';
import { ocrService } from './ocrService.js';
import { documentTextExtractor } from './documentTextExtractor.js';
import { fastEmbedService } from './FastEmbedService.js';
import { smartChunkDocument } from '../utils/textChunker.js';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

/**
 * WolkeSyncService - Handles Nextcloud/Wolke folder synchronization
 * Syncs folders, processes files, and stores vectors in Qdrant
 */
class WolkeSyncService {
    constructor() {
        this.postgres = getPostgresInstance();
        this.qdrantService = new DocumentSearchService();
        this.documentService = getPostgresDocumentService();
        this.supportedFileTypes = [
            '.pdf', '.docx', '.doc', '.odt', '.txt', '.md', '.rtf'
        ];
    }

    /**
     * Ensure services are initialized
     */
    async ensureInitialized() {
        await this.postgres.ensureInitialized();
        await this.qdrantService.ensureInitialized();
    }

    /**
     * Get or create sync status record
     */
    async getOrCreateSyncStatus(userId, shareLinkId, folderPath = '') {
        try {
            await this.ensureInitialized();
            
            const existing = await this.postgres.queryOne(
                'SELECT * FROM wolke_sync_status WHERE user_id = $1 AND share_link_id = $2 AND folder_path = $3',
                [userId, shareLinkId, folderPath]
            );
            
            if (existing) {
                return existing;
            }
            
            // Create new sync status
            const syncStatus = await this.postgres.insert('wolke_sync_status', {
                user_id: userId,
                share_link_id: shareLinkId,
                folder_path: folderPath,
                sync_status: 'idle',
                files_processed: 0,
                files_failed: 0,
                auto_sync_enabled: false
            });
            
            console.log(`[WolkeSyncService] Created sync status record: ${syncStatus.id}`);
            return syncStatus;
        } catch (error) {
            console.error('[WolkeSyncService] Error getting/creating sync status:', error);
            throw error;
        }
    }

    /**
     * Update sync status
     */
    async updateSyncStatus(syncStatusId, updates) {
        try {
            await this.ensureInitialized();
            
            const updateData = { ...updates };
            if (updates.lastSyncAt !== undefined) {
                updateData.last_sync_at = updates.lastSyncAt;
                delete updateData.lastSyncAt;
            }
            if (updates.syncStatus !== undefined) {
                updateData.sync_status = updates.syncStatus;
                delete updateData.syncStatus;
            }
            if (updates.filesProcessed !== undefined) {
                updateData.files_processed = updates.filesProcessed;
                delete updateData.filesProcessed;
            }
            if (updates.filesFailed !== undefined) {
                updateData.files_failed = updates.filesFailed;
                delete updateData.filesFailed;
            }
            
            const result = await this.postgres.update(
                'wolke_sync_status',
                updateData,
                { id: syncStatusId }
            );
            
            return result.data[0];
        } catch (error) {
            console.error('[WolkeSyncService] Error updating sync status:', error);
            throw error;
        }
    }

    /**
     * Get share link by ID
     */
    async getShareLink(userId, shareLinkId) {
        try {
            const shareLinks = await NextcloudShareManager.getShareLinks(userId);
            const shareLink = shareLinks.find(link => link.id === shareLinkId);
            
            if (!shareLink) {
                throw new Error('Share link not found');
            }
            
            if (!shareLink.is_active) {
                throw new Error('Share link is not active');
            }
            
            return shareLink;
        } catch (error) {
            console.error('[WolkeSyncService] Error getting share link:', error);
            throw error;
        }
    }

    /**
     * List files in a Nextcloud folder
     */
    async listFolderContents(shareLink, folderPath = '') {
        try {
            const client = new NextcloudApiClient(shareLink.share_link);
            const shareInfo = await client.getShareInfo();
            
            if (!shareInfo.success) {
                throw new Error('Failed to get share information');
            }
            
            // Filter for supported file types
            const supportedFiles = shareInfo.files.filter(file => {
                const fileExtension = path.extname(file.name.toLowerCase());
                return this.supportedFileTypes.includes(fileExtension);
            });
            
            console.log(`[WolkeSyncService] Found ${supportedFiles.length} supported files in folder`);
            return supportedFiles;
        } catch (error) {
            console.error('[WolkeSyncService] Error listing folder contents:', error);
            throw error;
        }
    }

    /**
     * Download file to temporary location
     */
    async downloadFileToTemp(shareLink, file) {
        try {
            const client = new NextcloudApiClient(shareLink.share_link);
            const tempDir = os.tmpdir();
            const tempFileName = `wolke_${Date.now()}_${file.name}`;
            const tempFilePath = path.join(tempDir, tempFileName);
            
            // This is a simplified implementation - in real use you'd need to
            // implement file download functionality in NextcloudApiClient
            console.log(`[WolkeSyncService] Would download ${file.name} to ${tempFilePath}`);
            
            // For now, return a mock path - this would be implemented when
            // NextcloudApiClient supports file downloads
            return {
                tempPath: tempFilePath,
                cleanup: async () => {
                    try {
                        await fs.unlink(tempFilePath);
                    } catch (error) {
                        console.warn(`Failed to cleanup temp file: ${tempFilePath}`);
                    }
                }
            };
        } catch (error) {
            console.error('[WolkeSyncService] Error downloading file to temp:', error);
            throw error;
        }
    }

    /**
     * Process a single file from Wolke
     */
    async processFile(userId, shareLinkId, file, shareLink) {
        try {
            console.log(`[WolkeSyncService] Processing file: ${file.name}`);
            
            // Check if file already exists and is up to date
            const existingDoc = await this.postgres.queryOne(
                'SELECT * FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2 AND wolke_file_path = $3',
                [userId, shareLinkId, file.href]
            );
            
            // Check if file has changed (using etag or lastModified)
            const fileHasChanged = !existingDoc || 
                existingDoc.wolke_etag !== file.etag || 
                new Date(existingDoc.last_synced_at) < file.lastModified;
            
            if (!fileHasChanged) {
                console.log(`[WolkeSyncService] File ${file.name} is up to date, skipping`);
                return { skipped: true, reason: 'up_to_date' };
            }
            
            // Check if file type is supported
            if (!documentTextExtractor.isSupported(file.name)) {
                console.warn(`[WolkeSyncService] Unsupported file type: ${file.name}`);
                return { skipped: true, reason: 'unsupported_file_type' };
            }
            
            // Check file size limit (100MB)
            if (file.size > 100 * 1024 * 1024) {
                console.warn(`[WolkeSyncService] File too large: ${file.name} (${file.size} bytes)`);
                return { skipped: true, reason: 'file_too_large' };
            }
            
            // Download file from Nextcloud
            const client = new NextcloudApiClient(shareLink.share_link);
            console.log(`[WolkeSyncService] Downloading file: ${file.name}`);
            const fileData = await client.downloadFile(file.href);
            
            // Extract text using our unified extractor
            console.log(`[WolkeSyncService] Extracting text from: ${file.name}`);
            const extractedText = await documentTextExtractor.extractTextFromBuffer(fileData.buffer, file.name);
            
            if (!extractedText || extractedText.trim().length === 0) {
                console.warn(`[WolkeSyncService] No text extracted from file: ${file.name}`);
                return { skipped: true, reason: 'no_extractable_text' };
            }
            
            console.log(`[WolkeSyncService] Extracted ${extractedText.length} characters from ${file.name}`);
            
            // Chunk the text
            const chunks = smartChunkDocument(extractedText, {
                maxTokens: 400,
                overlapTokens: 50,
                preserveStructure: true
            });
            
            if (chunks.length === 0) {
                console.warn(`[WolkeSyncService] No chunks generated for file: ${file.name}`);
                return { skipped: true, reason: 'no_content' };
            }
            
            // Generate embeddings
            const texts = chunks.map(chunk => chunk.text);
            const embeddings = await fastEmbedService.generateBatchEmbeddings(texts, 'search_document');

            // Generate a short preview for UI lists
            const generateContentPreview = (text, limit = 600) => {
                if (!text || typeof text !== 'string') return '';
                if (text.length <= limit) return text;
                const truncated = text.slice(0, limit);
                const sentenceEnd = Math.max(truncated.lastIndexOf('.'), truncated.lastIndexOf('!'), truncated.lastIndexOf('?'));
                if (sentenceEnd > limit * 0.5) return truncated.slice(0, sentenceEnd + 1);
                const lastSpace = truncated.lastIndexOf(' ');
                return lastSpace > limit * 0.6 ? `${truncated.slice(0, lastSpace)}...` : `${truncated}...`;
            };
            const contentPreview = generateContentPreview(extractedText);
            
            // Store vectors in Qdrant
            const metadata = {
                sourceType: 'wolke',
                wolkeShareLinkId: shareLinkId,
                wolkeFilePath: file.href,
                title: file.name,
                filename: file.name,
                additionalPayload: {
                    file_size: file.size,
                    last_modified: file.lastModified?.toISOString()
                }
            };
            
            // If document exists, delete old vectors first
            if (existingDoc) {
                await this.qdrantService.deleteDocumentVectors(existingDoc.id, userId);
            }
            
            // Create or update document metadata
            let documentId;
            if (existingDoc) {
                await this.documentService.updateDocumentMetadata(existingDoc.id, userId, {
                    vectorCount: chunks.length,
                    wolkeEtag: file.etag,
                    lastSyncedAt: new Date(),
                    status: 'completed',
                    additionalMetadata: {
                        content_preview: contentPreview
                    }
                });
                documentId = existingDoc.id;
            } else {
                const newDoc = await this.documentService.saveDocumentMetadata(userId, {
                    title: file.name,
                    filename: file.name,
                    sourceType: 'wolke',
                    wolkeShareLinkId: shareLinkId,
                    wolkeFilePath: file.href,
                    wolkeEtag: file.etag,
                    vectorCount: chunks.length,
                    fileSize: file.size || 0,
                    additionalMetadata: {
                        content_preview: contentPreview
                    },
                    status: 'completed'
                });
                documentId = newDoc.id;
            }
            
            // Store vectors
            await this.qdrantService.storeDocumentVectors(
                userId,
                documentId,
                chunks,
                embeddings,
                metadata
            );
            
            console.log(`[WolkeSyncService] Successfully processed file: ${file.name} (${chunks.length} vectors)`);
            
            return {
                success: true,
                documentId,
                filename: file.name,
                vectorsCreated: chunks.length,
                isUpdate: !!existingDoc
            };
            
        } catch (error) {
            console.error(`[WolkeSyncService] Error processing file ${file.name}:`, error);
            throw error;
        }
    }

    /**
     * Sync a folder from Wolke
     */
    async syncFolder(userId, shareLinkId, folderPath = '') {
        try {
            await this.ensureInitialized();
            
            console.log(`[WolkeSyncService] Starting sync for user ${userId}, share ${shareLinkId}, folder: ${folderPath}`);
            
            // Get or create sync status
            const syncStatus = await this.getOrCreateSyncStatus(userId, shareLinkId, folderPath);
            
            // Update status to syncing
            await this.updateSyncStatus(syncStatus.id, {
                syncStatus: 'syncing',
                lastSyncAt: new Date()
            });
            
            try {
                // Get share link
                const shareLink = await this.getShareLink(userId, shareLinkId);
                
                // List folder contents
                const files = await this.listFolderContents(shareLink, folderPath);
                
                let processedCount = 0;
                let failedCount = 0;
                const results = [];
                
                // Process each file
                for (const file of files) {
                    try {
                        const result = await this.processFile(userId, shareLinkId, file, shareLink);
                        results.push(result);
                        
                        if (result.skipped) {
                            console.log(`[WolkeSyncService] Skipped file: ${file.name} (${result.reason})`);
                        } else if (result.success) {
                            processedCount++;
                            console.log(`[WolkeSyncService] Processed file: ${file.name}`);
                        }
                    } catch (error) {
                        failedCount++;
                        console.error(`[WolkeSyncService] Failed to process file ${file.name}:`, error);
                        results.push({
                            filename: file.name,
                            error: error.message,
                            success: false
                        });
                    }
                }
                
                // Update sync status to completed
                await this.updateSyncStatus(syncStatus.id, {
                    syncStatus: 'completed',
                    filesProcessed: processedCount,
                    filesFailed: failedCount
                });
                
                console.log(`[WolkeSyncService] Sync completed: ${processedCount} processed, ${failedCount} failed`);
                
                return {
                    success: true,
                    syncStatusId: syncStatus.id,
                    totalFiles: files.length,
                    processedFiles: processedCount,
                    failedFiles: failedCount,
                    results
                };
                
            } catch (error) {
                // Update sync status to failed
                await this.updateSyncStatus(syncStatus.id, {
                    syncStatus: 'failed'
                });
                throw error;
            }
            
        } catch (error) {
            console.error('[WolkeSyncService] Error syncing folder:', error);
            throw error;
        }
    }

    /**
     * Get sync status for user
     */
    async getUserSyncStatus(userId) {
        try {
            await this.ensureInitialized();
            
            const syncStatuses = await this.postgres.query(
                'SELECT * FROM wolke_sync_status WHERE user_id = $1 ORDER BY last_sync_at DESC',
                [userId]
            );
            
            return syncStatuses;
        } catch (error) {
            console.error('[WolkeSyncService] Error getting user sync status:', error);
            throw error;
        }
    }

    /**
     * Enable/disable auto-sync for a folder
     */
    async setAutoSync(userId, shareLinkId, folderPath, enabled) {
        try {
            await this.ensureInitialized();
            
            const syncStatus = await this.getOrCreateSyncStatus(userId, shareLinkId, folderPath);
            
            await this.updateSyncStatus(syncStatus.id, {
                auto_sync_enabled: enabled
            });
            
            console.log(`[WolkeSyncService] Auto-sync ${enabled ? 'enabled' : 'disabled'} for sync ${syncStatus.id}`);
            
            return { success: true, autoSyncEnabled: enabled };
        } catch (error) {
            console.error('[WolkeSyncService] Error setting auto-sync:', error);
            throw error;
        }
    }

    /**
     * Delete sync status and associated documents
     */
    async deleteSyncFolder(userId, shareLinkId, folderPath) {
        try {
            await this.ensureInitialized();
            
            // Get sync status
            const syncStatus = await this.postgres.queryOne(
                'SELECT * FROM wolke_sync_status WHERE user_id = $1 AND share_link_id = $2 AND folder_path = $3',
                [userId, shareLinkId, folderPath]
            );
            
            if (!syncStatus) {
                throw new Error('Sync folder not found');
            }
            
            // Get all documents from this sync folder
            const documents = await this.postgres.query(
                'SELECT id FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2',
                [userId, shareLinkId]
            );
            
            // Delete vectors from Qdrant
            if (documents.length > 0) {
                const documentIds = documents.map(doc => doc.id);
                await this.qdrantService.bulkDeleteDocumentVectors(userId, documentIds);
            }
            
            // Delete document metadata
            await this.postgres.query(
                'DELETE FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2',
                [userId, shareLinkId]
            );
            
            // Delete sync status
            await this.postgres.delete('wolke_sync_status', { id: syncStatus.id });
            
            console.log(`[WolkeSyncService] Deleted sync folder and ${documents.length} associated documents`);
            
            return { 
                success: true, 
                deletedDocuments: documents.length,
                syncStatusId: syncStatus.id
            };
        } catch (error) {
            console.error('[WolkeSyncService] Error deleting sync folder:', error);
            throw error;
        }
    }
}

// Export singleton instance
let wolkeSyncServiceInstance = null;

export function getWolkeSyncService() {
    if (!wolkeSyncServiceInstance) {
        wolkeSyncServiceInstance = new WolkeSyncService();
    }
    return wolkeSyncServiceInstance;
}

export { WolkeSyncService };
export default WolkeSyncService;
