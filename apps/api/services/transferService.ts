import crypto from 'crypto';

import { getPostgresInstance } from '../database/services/PostgresService.js';
import { NextcloudShareManager } from '../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../utils/logger.js';

import NextcloudApiClient, { type DownloadFileResult } from './api-clients/nextcloudApiClient.js';

import type { SharedMediaRow } from '../types/media.js';
import type { NextcloudShareLink } from '../utils/integrations/nextcloud/types.js';

const log = createLogger('transfer');

const TRANSFER_FOLDER = 'Gruenerator-Transfer';

interface TransferRecord {
  id: string;
  share_token: string;
  file_name: string | null;
  file_size: number | null;
  mime_type: string;
  download_count: number;
  created_at: Date;
  wolke_share_link_id: string | null;
  wolke_file_path: string | null;
  user_id: string;
  sharer_name?: string;
}

interface CreateTransferParams {
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  wolkeShareLinkId: string;
  wolkeFilePath: string;
}

class TransferService {
  private postgres: ReturnType<typeof getPostgresInstance> | null = null;
  private initPromise: Promise<void> | null = null;

  async ensureInitialized(): Promise<void> {
    if (this.postgres) return;
    if (!this.initPromise) {
      this.initPromise = this._init();
    }
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    try {
      const postgres = getPostgresInstance();
      await postgres.ensureInitialized();
      this.postgres = postgres;
      log.info('TransferService initialized');
    } catch (error) {
      this.initPromise = null;
      throw error;
    }
  }

  async createTransfer(params: CreateTransferParams): Promise<{
    shareToken: string;
    id: string;
  }> {
    await this.ensureInitialized();
    const shareToken = crypto.randomBytes(16).toString('hex');

    const result = await this.postgres!.query<{ id: string }>(
      `INSERT INTO shared_media (
        user_id, share_token, media_type, file_name, file_size, mime_type,
        status, wolke_share_link_id, wolke_file_path, is_library_item
      ) VALUES ($1, $2, 'transfer', $3, $4, $5, 'ready', $6, $7, FALSE)
      RETURNING id`,
      [
        params.userId,
        shareToken,
        params.fileName,
        params.fileSize,
        params.mimeType,
        params.wolkeShareLinkId,
        params.wolkeFilePath,
      ]
    );

    log.info('Transfer created', { shareToken: shareToken.substring(0, 8), userId: params.userId });
    return { shareToken, id: result[0].id };
  }

  async getTransferByToken(shareToken: string): Promise<TransferRecord | null> {
    await this.ensureInitialized();

    const rows = await this.postgres!.query<TransferRecord>(
      `SELECT sm.id, sm.share_token, sm.file_name, sm.file_size, sm.mime_type,
              sm.download_count, sm.created_at, sm.wolke_share_link_id,
              sm.wolke_file_path, sm.user_id, p.display_name as sharer_name
       FROM shared_media sm
       LEFT JOIN profiles p ON p.id = sm.user_id
       WHERE sm.share_token = $1 AND sm.media_type = 'transfer'`,
      [shareToken]
    );

    return rows[0] ?? null;
  }

  async proxyDownload(shareToken: string): Promise<DownloadFileResult & { fileName: string }> {
    const transfer = await this.getTransferByToken(shareToken);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    if (!transfer.wolke_share_link_id || !transfer.wolke_file_path) {
      throw new Error('Transfer has no Wolke reference');
    }

    const shareLinks = await NextcloudShareManager.getShareLinks(transfer.user_id);
    const wolkeLink = shareLinks.find(
      (link: NextcloudShareLink) => link.id === transfer.wolke_share_link_id && link.is_active
    );

    if (!wolkeLink) {
      throw new Error('Wolke connection no longer available');
    }

    const client = new NextcloudApiClient(wolkeLink.share_link);
    const webdavPath = `/public.php/webdav/${transfer.wolke_file_path}`;

    log.info('Proxying download from Wolke', {
      shareToken: shareToken.substring(0, 8),
      path: transfer.wolke_file_path,
    });

    const result = await client.downloadFile(webdavPath);

    await this.incrementDownloadCount(shareToken);

    return {
      ...result,
      fileName: transfer.file_name || 'download',
    };
  }

  async listUserTransfers(userId: string): Promise<TransferRecord[]> {
    await this.ensureInitialized();

    return this.postgres!.query<TransferRecord>(
      `SELECT id, share_token, file_name, file_size, mime_type,
              download_count, created_at, wolke_share_link_id, wolke_file_path, user_id
       FROM shared_media
       WHERE user_id = $1 AND media_type = 'transfer'
       ORDER BY created_at DESC
       LIMIT 50`,
      [userId]
    );
  }

  async deleteTransfer(userId: string, shareToken: string): Promise<boolean> {
    await this.ensureInitialized();

    const result = await this.postgres!.query<{ id: string }>(
      `DELETE FROM shared_media
       WHERE share_token = $1 AND user_id = $2 AND media_type = 'transfer'
       RETURNING id`,
      [shareToken, userId]
    );

    return result.length > 0;
  }

  private async incrementDownloadCount(shareToken: string): Promise<void> {
    try {
      await this.postgres!.query(
        `UPDATE shared_media SET download_count = download_count + 1
         WHERE share_token = $1 AND media_type = 'transfer'`,
        [shareToken]
      );
    } catch (error) {
      log.error('Failed to increment download count', { error });
    }
  }

  /**
   * Upload a file buffer to Nextcloud and create a transfer record.
   * Returns the share token for the transfer link.
   */
  async uploadAndCreateTransfer(
    userId: string,
    fileBuffer: Buffer,
    originalFilename: string,
    mimeType: string,
    wolkeShareLinkId: string,
    folderPath?: string
  ): Promise<{ shareToken: string; id: string }> {
    const shareLinks = await NextcloudShareManager.getShareLinks(userId);
    const wolkeLink = shareLinks.find(
      (link: NextcloudShareLink) => link.id === wolkeShareLinkId && link.is_active
    );

    if (!wolkeLink) {
      throw new Error('Wolke-Verbindung nicht gefunden oder deaktiviert');
    }

    const timestamp = Date.now();
    const ext = originalFilename.includes('.') ? '.' + originalFilename.split('.').pop() : '';
    const baseName = originalFilename.includes('.')
      ? originalFilename.substring(0, originalFilename.lastIndexOf('.'))
      : originalFilename;
    const safeFilename = `${baseName}_${timestamp}${ext}`;

    const targetFolder = folderPath || TRANSFER_FOLDER;

    const client = new NextcloudApiClient(wolkeLink.share_link);
    const uploadResult = await client.uploadFile(fileBuffer, safeFilename, targetFolder);

    if (!uploadResult.success) {
      throw new Error(uploadResult.message || 'Upload zu Wolke fehlgeschlagen');
    }

    const wolkeFilePath = targetFolder ? `${targetFolder}/${safeFilename}` : safeFilename;

    return this.createTransfer({
      userId,
      fileName: originalFilename,
      fileSize: fileBuffer.length,
      mimeType,
      wolkeShareLinkId,
      wolkeFilePath,
    });
  }
}

export const transferService = new TransferService();
