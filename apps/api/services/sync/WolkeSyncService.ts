/**
 * WolkeSyncService - Handles Nextcloud/Wolke folder synchronization
 *
 * Syncs folders, processes files, and stores vectors in Qdrant
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { eq, and } from 'drizzle-orm';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { wolkeSyncStatus } from '../../database/schema/index.js';
import { type WolkeSyncStatusRow } from '../../database/types.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import NextcloudApiClient from '../api-clients/nextcloudApiClient.js';
import {
  DocumentSearchService,
  getPostgresDocumentService,
  smartChunkDocument,
} from '../document-services/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';
import { ocrService } from '../OcrService/index.js';

import type { WolkeSyncStatus, NextcloudFile, FileProcessResult, SyncResult } from './types.js';

type DrizzleWolkeSyncRow = typeof wolkeSyncStatus.$inferSelect;

/**
 * Map Drizzle result (camelCase fields) to WolkeSyncStatusRow (snake_case fields)
 */
function toWolkeSyncStatusRow(row: DrizzleWolkeSyncRow): WolkeSyncStatusRow {
  return {
    id: row.id,
    user_id: row.userId || null,
    share_link_id: row.shareLinkId,
    folder_path: row.folderPath,
    last_sync_at: row.lastSyncAt,
    files_processed: Number(row.filesProcessed),
    files_failed: Number(row.filesFailed),
    auto_sync_enabled: row.autoSyncEnabled,
    sync_status: row.syncStatus,
    created_at: row.createdAt,
    updated_at: row.updatedAt,
    context_type: row.contextType,
    context_id: row.contextId,
    synced_by_user_id: row.syncedByUserId,
  };
}

export class WolkeSyncService {
  private postgres: ReturnType<typeof getPostgresInstance>;
  private qdrantService: DocumentSearchService;
  private documentService: ReturnType<typeof getPostgresDocumentService>;
  private supportedFileTypes: string[];

  constructor() {
    this.postgres = getPostgresInstance();
    this.qdrantService = new DocumentSearchService();
    this.documentService = getPostgresDocumentService();
    this.supportedFileTypes = [
      '.pdf',
      '.docx',
      '.pptx',
      '.png',
      '.jpg',
      '.jpeg',
      '.avif',
      '.txt',
      '.md',
    ];
  }

  /**
   * Ensure services are initialized
   */
  async ensureInitialized(): Promise<void> {
    await this.postgres.ensureInitialized();
    await this.qdrantService.ensureInitialized();
  }

  /**
   * Get or create sync status record
   */
  async getOrCreateSyncStatus(
    userId: string,
    shareLinkId: string,
    folderPath: string = ''
  ): Promise<WolkeSyncStatusRow> {
    try {
      await this.ensureInitialized();
      const db = getDrizzleInstance();

      const existing = await db
        .select()
        .from(wolkeSyncStatus)
        .where(
          and(
            eq(wolkeSyncStatus.userId, userId),
            eq(wolkeSyncStatus.shareLinkId, shareLinkId),
            eq(wolkeSyncStatus.folderPath, folderPath)
          )
        )
        .limit(1);

      if (existing.length > 0) {
        return toWolkeSyncStatusRow(existing[0]);
      }

      // Create new sync status
      const created = await db
        .insert(wolkeSyncStatus)
        .values({
          userId,
          shareLinkId,
          folderPath,
          syncStatus: 'idle',
          filesProcessed: 0,
          filesFailed: 0,
          autoSyncEnabled: false,
        })
        .returning();

      console.log(`[WolkeSyncService] Created sync status record: ${created[0].id}`);
      return toWolkeSyncStatusRow(created[0]);
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error getting/creating sync status:', error);
      throw error;
    }
  }

  /**
   * Update sync status
   */
  async updateSyncStatus(
    syncStatusId: string,
    updates: Partial<{
      lastSyncAt: Date;
      syncStatus: 'idle' | 'syncing' | 'completed' | 'failed';
      filesProcessed: number;
      filesFailed: number;
      auto_sync_enabled: boolean;
    }>
  ): Promise<WolkeSyncStatusRow> {
    try {
      await this.ensureInitialized();
      const db = getDrizzleInstance();

      const updateValues: Partial<typeof wolkeSyncStatus.$inferInsert> = {};
      if (updates.lastSyncAt !== undefined) {
        updateValues.lastSyncAt = updates.lastSyncAt;
      }
      if (updates.syncStatus !== undefined) {
        updateValues.syncStatus = updates.syncStatus;
      }
      if (updates.filesProcessed !== undefined) {
        updateValues.filesProcessed = updates.filesProcessed;
      }
      if (updates.filesFailed !== undefined) {
        updateValues.filesFailed = updates.filesFailed;
      }
      if (updates.auto_sync_enabled !== undefined) {
        updateValues.autoSyncEnabled = updates.auto_sync_enabled;
      }

      const result = await db
        .update(wolkeSyncStatus)
        .set(updateValues)
        .where(eq(wolkeSyncStatus.id, syncStatusId))
        .returning();

      return toWolkeSyncStatusRow(result[0]);
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error updating sync status:', error);
      throw error;
    }
  }

  /**
   * Get share link by ID
   */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async getShareLink(userId: string, shareLinkId: string): Promise<any> {
    try {
      const shareLinks = await NextcloudShareManager.getShareLinks(userId);
      const shareLink = shareLinks.find((link: { id: string }) => link.id === shareLinkId);

      if (!shareLink) {
        throw new Error('Share link not found');
      }

      if (!shareLink.is_active) {
        throw new Error('Share link is not active');
      }

      return shareLink;
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error getting share link:', error);
      throw error;
    }
  }

  /**
   * List files in a Nextcloud folder
   */
  async listFolderContents(
    shareLink: { id: string; url: string; token?: string; share_link?: string },
    folderPath: string = ''
  ): Promise<NextcloudFile[]> {
    try {
      const client = await NextcloudApiClient.create(shareLink.share_link || shareLink.url);
      const shareInfo = await client.getShareInfo();

      if (!shareInfo.success) {
        throw new Error('Failed to get share information');
      }

      // Filter for supported file types
      const files = shareInfo.files ?? [];
      const supportedFiles = files.filter((file) => {
        const fileExtension = path.extname(file.name.toLowerCase());
        return this.supportedFileTypes.includes(fileExtension);
      });

      console.log(`[WolkeSyncService] Found ${supportedFiles.length} supported files in folder`);
      return supportedFiles as NextcloudFile[];
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error listing folder contents:', error);
      throw error;
    }
  }

  /**
   * Download file to temporary location
   */
  async downloadFileToTemp(
    shareLink: { id: string; url: string; token?: string; share_link?: string },
    file: NextcloudFile
  ): Promise<{
    tempPath: string;
    cleanup: () => Promise<void>;
  }> {
    try {
      const client = await NextcloudApiClient.create(shareLink.share_link || shareLink.url);
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
        },
      };
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error downloading file to temp:', error);
      throw error;
    }
  }

  /**
   * Multi-tier change detection for files
   * Uses ETags (primary), lastModified dates (secondary), and always sync if no existing data
   */
  hasFileChanged(existingDoc: Record<string, unknown> | null, file: NextcloudFile): boolean {
    // If no existing document, file is new
    if (!existingDoc) {
      console.log(`[WolkeSyncService] No existing document found - treating as new file`);
      return true;
    }

    // Primary detection: Compare ETags (most reliable)
    if (file.etag && existingDoc.wolke_etag) {
      const etagChanged = existingDoc.wolke_etag !== file.etag;
      if (etagChanged) {
        console.log(`[WolkeSyncService] ETag changed: ${existingDoc.wolke_etag} → ${file.etag}`);
        return true;
      } else {
        console.log(`[WolkeSyncService] ETag match: ${file.etag} - file unchanged`);
        return false;
      }
    }

    // Secondary detection: Compare lastModified dates
    const lastSyncedAt = existingDoc.last_synced_at;
    if (file.lastModified && lastSyncedAt) {
      try {
        const fileModifiedTime =
          file.lastModified instanceof Date ? file.lastModified : new Date(file.lastModified);
        const lastSyncTime =
          lastSyncedAt instanceof Date ? lastSyncedAt : new Date(String(lastSyncedAt));

        if (fileModifiedTime > lastSyncTime) {
          console.log(
            `[WolkeSyncService] File modified after last sync: ${fileModifiedTime.toISOString()} > ${lastSyncTime.toISOString()}`
          );
          return true;
        } else {
          console.log(
            `[WolkeSyncService] File not modified since last sync: ${fileModifiedTime.toISOString()} <= ${lastSyncTime.toISOString()}`
          );
          return false;
        }
      } catch (error) {
        console.warn(`[WolkeSyncService] Error comparing dates, assuming file changed:`, error);
        return true;
      }
    }

    // Fallback: If we have no reliable metadata for comparison, re-sync to be safe
    console.log(
      `[WolkeSyncService] Insufficient metadata for comparison (etag: ${!!file.etag}, lastModified: ${!!file.lastModified}) - re-syncing to be safe`
    );
    return true;
  }

  /**
   * Process a single file from Wolke
   */
  async processFile(
    userId: string,
    shareLinkId: string,
    file: NextcloudFile,
    shareLink: { id: string; url: string; token?: string; share_link?: string }
  ): Promise<FileProcessResult> {
    try {
      console.log(`[WolkeSyncService] Processing file: ${file.name}`);

      // Check if file already exists and is up to date
      const existingDoc = await this.postgres.queryOne(
        'SELECT * FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2 AND wolke_file_path = $3',
        [userId, shareLinkId, file.href]
      );

      // Multi-tier change detection strategy
      const fileHasChanged = this.hasFileChanged(existingDoc, file);

      if (!fileHasChanged) {
        console.log(`[WolkeSyncService] File ${file.name} is up to date, skipping`);
        return { skipped: true, reason: 'up_to_date' };
      }

      console.log(
        `[WolkeSyncService] File ${file.name} has changed or is new, proceeding with sync`
      );

      // Check if file type is supported
      const fileExtension = path.extname(file.name).toLowerCase();
      if (!this.supportedFileTypes.includes(fileExtension)) {
        console.warn(`[WolkeSyncService] Unsupported file type: ${file.name} (${fileExtension})`);
        return { skipped: true, reason: 'unsupported_file_type' };
      }

      // Check file size limit (100MB)
      if (file.size > 100 * 1024 * 1024) {
        console.warn(`[WolkeSyncService] File too large: ${file.name} (${file.size} bytes)`);
        return { skipped: true, reason: 'file_too_large' };
      }

      // Download file from Nextcloud
      const client = await NextcloudApiClient.create(shareLink.share_link || shareLink.url);
      console.log(`[WolkeSyncService] Downloading file: ${file.name}`);
      const fileData = await client.downloadFile(file.href);

      // Extract text using OCR service (supports documents and images via Mistral OCR)
      console.log(`[WolkeSyncService] Extracting text from: ${file.name}`);
      let extractedText: string;

      const supportedMistralTypes = ['.pdf', '.docx', '.pptx', '.png', '.jpg', '.jpeg', '.avif'];

      if (supportedMistralTypes.includes(fileExtension)) {
        // Use Mistral OCR for documents and images
        const tempDir = os.tmpdir();
        const tempFileName = `wolke_sync_${Date.now()}_${file.name}`;
        const tempFilePath = path.join(tempDir, tempFileName);

        try {
          await fs.writeFile(tempFilePath, fileData.buffer);
          const ocrResult = await ocrService.extractTextFromDocument(tempFilePath);
          extractedText = ocrResult.text;
          await fs.unlink(tempFilePath); // Clean up
        } catch (error) {
          try {
            await fs.unlink(tempFilePath);
          } catch {
            /* ignore temp file cleanup error */
          }
          throw error;
        }
      } else if (['.txt', '.md'].includes(fileExtension)) {
        // Plain text files
        extractedText = fileData.buffer.toString('utf-8');
      } else {
        throw new Error(`Unsupported file type for processing: ${fileExtension}`);
      }

      if (!extractedText || extractedText.trim().length === 0) {
        console.warn(`[WolkeSyncService] No text extracted from file: ${file.name}`);
        return { skipped: true, reason: 'no_extractable_text' };
      }

      console.log(
        `[WolkeSyncService] Extracted ${extractedText.length} characters from ${file.name}`
      );

      // Chunk the text
      const chunks = await smartChunkDocument(extractedText, {
        maxTokens: 400,
        overlapTokens: 50,
        preserveSentences: true,
      });

      if (chunks.length === 0) {
        console.warn(`[WolkeSyncService] No chunks generated for file: ${file.name}`);
        return { skipped: true, reason: 'no_content' };
      }

      // Generate embeddings
      const texts = chunks.map((chunk) => chunk.text);
      const embeddings = await mistralEmbeddingService.generateBatchEmbeddings(
        texts,
        'search_document'
      );

      // Generate a short preview for UI lists
      const generateContentPreview = (text: string, limit: number = 600): string => {
        if (!text || typeof text !== 'string') return '';
        if (text.length <= limit) return text;
        const truncated = text.slice(0, limit);
        const sentenceEnd = Math.max(
          truncated.lastIndexOf('.'),
          truncated.lastIndexOf('!'),
          truncated.lastIndexOf('?')
        );
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
          last_modified: file.lastModified
            ? file.lastModified instanceof Date
              ? file.lastModified.toISOString()
              : new Date(file.lastModified).toISOString()
            : null,
        },
      };

      // If document exists, delete old vectors first
      if (existingDoc) {
        await this.qdrantService.deleteDocumentVectors(String(existingDoc.id), userId);
      }

      // Create or update document metadata
      let documentId: string;
      if (existingDoc) {
        await this.documentService.updateDocumentMetadata(String(existingDoc.id), userId, {
          vectorCount: chunks.length,
          wolkeEtag: file.etag,
          lastSyncedAt: new Date().toISOString(),
          status: 'completed',
          additionalMetadata: {
            content_preview: contentPreview,
          },
        });
        documentId = String(existingDoc.id);
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
            content_preview: contentPreview,
          },
          status: 'completed',
        });
        documentId = String(newDoc.id);
      }

      // Store vectors
      await this.qdrantService.storeDocumentVectors(
        userId,
        documentId,
        chunks,
        embeddings,
        metadata
      );

      console.log(
        `[WolkeSyncService] Successfully ${existingDoc ? 'updated' : 'processed new'} file: ${file.name} (${chunks.length} vectors)`
      );

      return {
        success: true,
        documentId,
        filename: file.name,
        vectorsCreated: chunks.length,
        isUpdate: !!existingDoc,
      };
    } catch (error: unknown) {
      console.error(`[WolkeSyncService] Error processing file ${file.name}:`, error);
      throw error;
    }
  }

  /**
   * Sync a folder from Wolke
   */
  async syncFolder(
    userId: string,
    shareLinkId: string,
    folderPath: string = ''
  ): Promise<SyncResult> {
    try {
      await this.ensureInitialized();

      console.log(
        `[WolkeSyncService] Starting sync for user ${userId}, share ${shareLinkId}, folder: ${folderPath}`
      );

      // Get or create sync status
      const syncStatus = await this.getOrCreateSyncStatus(userId, shareLinkId, folderPath);

      // Update status to syncing
      await this.updateSyncStatus(syncStatus.id, {
        syncStatus: 'syncing',
        lastSyncAt: new Date(),
      });

      try {
        // Get share link
        const shareLink = await this.getShareLink(userId, shareLinkId) as { id: string; url: string; token?: string; share_link?: string };

        // List folder contents
        const files = await this.listFolderContents(shareLink, folderPath);

        let processedCount = 0;
        let failedCount = 0;
        const results: FileProcessResult[] = [];

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
          } catch (error: unknown) {
            failedCount++;
            console.error(`[WolkeSyncService] Failed to process file ${file.name}:`, error);
            results.push({
              filename: file.name,
              error: error instanceof Error ? error.message : String(error),
              success: false,
            });
          }
        }

        // Update sync status to completed
        await this.updateSyncStatus(syncStatus.id, {
          syncStatus: 'completed',
          filesProcessed: processedCount,
          filesFailed: failedCount,
        });

        console.log(
          `[WolkeSyncService] Sync completed: ${processedCount} processed, ${failedCount} failed`
        );

        return {
          success: true,
          syncStatusId: syncStatus.id,
          totalFiles: files.length,
          processedFiles: processedCount,
          failedFiles: failedCount,
          results,
        };
      } catch (error) {
        // Update sync status to failed
        await this.updateSyncStatus(syncStatus.id, {
          syncStatus: 'failed',
        });
        throw error;
      }
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error syncing folder:', error);
      throw error;
    }
  }

  /**
   * Get sync status for user
   */
  async getUserSyncStatus(userId: string): Promise<WolkeSyncStatusRow[]> {
    try {
      await this.ensureInitialized();
      const db = getDrizzleInstance();

      const syncStatuses = await db
        .select()
        .from(wolkeSyncStatus)
        .where(eq(wolkeSyncStatus.userId, userId))
        .orderBy(wolkeSyncStatus.lastSyncAt);

      return syncStatuses.map(toWolkeSyncStatusRow);
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error getting user sync status:', error);
      throw error;
    }
  }

  /**
   * Enable/disable auto-sync for a folder
   */
  async setAutoSync(
    userId: string,
    shareLinkId: string,
    folderPath: string,
    enabled: boolean
  ): Promise<{ success: boolean; autoSyncEnabled: boolean }> {
    try {
      await this.ensureInitialized();

      const syncStatus = await this.getOrCreateSyncStatus(userId, shareLinkId, folderPath);

      await this.updateSyncStatus(syncStatus.id, {
        auto_sync_enabled: enabled,
      });

      console.log(
        `[WolkeSyncService] Auto-sync ${enabled ? 'enabled' : 'disabled'} for sync ${syncStatus.id}`
      );

      return { success: true, autoSyncEnabled: enabled };
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error setting auto-sync:', error);
      throw error;
    }
  }

  /**
   * Delete sync status and associated documents
   */
  async deleteSyncFolder(
    userId: string,
    shareLinkId: string,
    folderPath: string
  ): Promise<{
    success: boolean;
    deletedDocuments: number;
    syncStatusId: string;
  }> {
    try {
      await this.ensureInitialized();
      const db = getDrizzleInstance();

      // Get sync status
      const syncStatusRows = await db
        .select()
        .from(wolkeSyncStatus)
        .where(
          and(
            eq(wolkeSyncStatus.userId, userId),
            eq(wolkeSyncStatus.shareLinkId, shareLinkId),
            eq(wolkeSyncStatus.folderPath, folderPath)
          )
        )
        .limit(1);

      if (syncStatusRows.length === 0) {
        throw new Error('Sync folder not found');
      }

      const syncStatusId = syncStatusRows[0].id;

      // Get all documents from this sync folder
      const documents = await this.postgres.query<{ id: string }>(
        'SELECT id FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2',
        [userId, shareLinkId]
      );

      // Delete vectors from Qdrant
      if (documents.length > 0) {
        for (const doc of documents) {
          await this.qdrantService.deleteDocumentVectors(doc.id, userId);
        }
      }

      // Delete document metadata
      await this.postgres.query(
        'DELETE FROM documents WHERE user_id = $1 AND wolke_share_link_id = $2',
        [userId, shareLinkId]
      );

      // Delete sync status
      await db.delete(wolkeSyncStatus).where(eq(wolkeSyncStatus.id, syncStatusId));

      console.log(
        `[WolkeSyncService] Deleted sync folder and ${documents.length} associated documents`
      );

      return {
        success: true,
        deletedDocuments: documents.length,
        syncStatusId,
      };
    } catch (error: unknown) {
      console.error('[WolkeSyncService] Error deleting sync folder:', error);
      throw error;
    }
  }
}

// Export singleton instance
let wolkeSyncServiceInstance: WolkeSyncService | null = null;

export function getWolkeSyncService(): WolkeSyncService {
  if (!wolkeSyncServiceInstance) {
    wolkeSyncServiceInstance = new WolkeSyncService();
  }
  return wolkeSyncServiceInstance;
}

export default WolkeSyncService;
