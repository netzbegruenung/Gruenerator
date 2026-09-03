/**
 * WolkeSyncService - Processes files from Nextcloud/Wolke shares
 *
 * Lists supported files, downloads and extracts them, and stores vectors in
 * Qdrant. Callers: the manual import path (wolkeController POST /import), the
 * notebook auto-sync watcher (WolkeWatchService) and wolkePendingContractRouter.
 */

import fs from 'fs/promises';
import os from 'os';
import path from 'path';

import { eq, and } from 'drizzle-orm';

import { documents } from '../../database/schema/index.js';
import { getDrizzleInstance } from '../../database/services/DrizzleService.js';
import { getPostgresInstance } from '../../database/services/PostgresService.js';
import { NextcloudShareManager } from '../../utils/integrations/nextcloud/index.js';
import NextcloudApiClient from '../api-clients/nextcloudApiClient.js';
import {
  DocumentSearchService,
  getPostgresDocumentService,
  smartChunkDocument,
} from '../document-services/index.js';
import { mistralEmbeddingService } from '../mistral/index.js';
import { ocrService } from '../OcrService/index.js';

import { walkWolkeFolder } from './folderWalk.js';
import {
  isOcrWolkeExtension,
  isPlaintextWolkeExtension,
  isSupportedWolkeFile,
  wolkeFileExtension,
} from './supportedFileTypes.js';

import type { NextcloudFile, FileProcessResult } from './types.js';
import type { NextcloudShareLink } from '../../utils/integrations/nextcloud/types.js';

export class WolkeSyncService {
  private postgres: ReturnType<typeof getPostgresInstance>;
  private qdrantService: DocumentSearchService;
  private documentService: ReturnType<typeof getPostgresDocumentService>;

  constructor() {
    this.postgres = getPostgresInstance();
    this.qdrantService = new DocumentSearchService();
    this.documentService = getPostgresDocumentService();
  }

  /**
   * Ensure services are initialized
   */
  async ensureInitialized(): Promise<void> {
    await this.postgres.ensureInitialized();
    await this.qdrantService.ensureInitialized();
  }

  /**
   * Get share link by ID. Throws if not found or not active.
   */
  async getShareLink(userId: string, shareLinkId: string): Promise<NextcloudShareLink> {
    try {
      const shareLinks = await NextcloudShareManager.getShareLinks(userId);
      const shareLink = shareLinks.find((link) => link.id === shareLinkId);

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
   * List the supported files in a SPECIFIC folder of a share.
   *
   * Uses the same `client.listFolder(folderPath)` the manual import path uses,
   * so `file.href` — the dedup key stored as documents.wolke_file_path — is
   * identical between detection and import. Reuses the shared supportedFileTypes
   * filter (no duplicated extension list).
   *
   * This replaced `listFolderContents`, which took a folderPath and ignored it
   * (`_folderPath`), always listing the share root via `getShareInfo`. Syncing
   * an attached subfolder therefore synced the wrong folder.
   */
  async listSupportedFilesInFolder(
    shareLink: NextcloudShareLink,
    folderPath: string = '',
    options: { includeSubfolders?: boolean } = {}
  ): Promise<NextcloudFile[]> {
    const client = await NextcloudApiClient.create(shareLink.share_link);
    const listFolder = (path: string) => client.listFolder(path || undefined);

    const files = options.includeSubfolders
      ? (await walkWolkeFolder(listFolder, folderPath)).files
      : await listFolder(folderPath);

    const supported = files.filter(
      (file) => !file.isDirectory && isSupportedWolkeFile(file.name)
    ) as NextcloudFile[];

    console.log(
      `[WolkeSyncService] Found ${supported.length} supported files in folder "${folderPath}"` +
        (options.includeSubfolders ? ' (including subfolders)' : '')
    );
    return supported;
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
    shareLink: NextcloudShareLink
  ): Promise<FileProcessResult> {
    try {
      console.log(`[WolkeSyncService] Processing file: ${file.name}`);

      // Check if file already exists and is up to date
      const db = getDrizzleInstance();
      const existingDocRows = await db
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.user_id, userId),
            eq(documents.wolke_share_link_id, shareLinkId),
            eq(documents.wolke_file_path, file.href)
          )
        )
        .limit(1);
      const existingDoc = existingDocRows[0] ?? null;

      // Multi-tier change detection strategy
      const fileHasChanged = this.hasFileChanged(existingDoc, file);

      if (!fileHasChanged) {
        console.log(`[WolkeSyncService] File ${file.name} is up to date, skipping`);
        // Hand the id back. `hasFileChanged` only answers false when there IS an
        // existing document, and a skip that names no document is
        // indistinguishable from a file that vanished — a caller reconciling a
        // folder against its notebook would drop the document over it.
        // `POST /import` short-circuits this case earlier today, so nothing
        // regresses; the next caller just shouldn't have to re-query what we
        // already loaded (wolkePendingContractRouter does exactly that).
        return {
          skipped: true,
          reason: 'up_to_date',
          ...(existingDoc ? { documentId: String(existingDoc.id) } : {}),
        };
      }

      console.log(
        `[WolkeSyncService] File ${file.name} has changed or is new, proceeding with sync`
      );

      // Check if file type is supported
      const fileExtension = wolkeFileExtension(file.name);
      if (!isSupportedWolkeFile(file.name)) {
        console.warn(`[WolkeSyncService] Unsupported file type: ${file.name} (${fileExtension})`);
        return { skipped: true, reason: 'unsupported_file_type' };
      }

      // Check file size limit (100MB)
      if (file.size > 100 * 1024 * 1024) {
        console.warn(`[WolkeSyncService] File too large: ${file.name} (${file.size} bytes)`);
        return { skipped: true, reason: 'file_too_large' };
      }

      // Download file from Nextcloud
      const client = await NextcloudApiClient.create(shareLink.share_link);
      console.log(`[WolkeSyncService] Downloading file: ${file.name}`);
      const fileData = await client.downloadFile(file.href);

      // Extract text using OCR service (supports documents and images via Mistral OCR)
      console.log(`[WolkeSyncService] Extracting text from: ${file.name}`);
      let extractedText: string;

      if (isOcrWolkeExtension(fileExtension)) {
        // Use Mistral OCR for documents and images
        const tempDir = os.tmpdir();
        // The name comes from the remote share listing, so it never goes into
        // the path unescaped — same rule as in `wolkeShareHandler`. The
        // extension stays, OcrService dispatches on it.
        const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
        const tempFileName = `wolke_sync_${Date.now()}_${safeName}`;
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
      } else if (isPlaintextWolkeExtension(fileExtension)) {
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
