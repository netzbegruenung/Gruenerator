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
  expires_at?: Date | null;
  password_hash?: string | null;
  transfer_message?: string | null;
}

interface CreateTransferParams {
  userId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  wolkeShareLinkId: string;
  wolkeFilePath: string;
  passwordHash?: string;
  expiresAt?: Date;
  message?: string;
}

interface TransferOptions {
  password?: string;
  expiresInDays?: number;
  message?: string;
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
        status, wolke_share_link_id, wolke_file_path, is_library_item,
        password_hash, expires_at, transfer_message
      ) VALUES ($1, $2, 'transfer', $3, $4, $5, 'ready', $6, $7, FALSE, $8, $9, $10)
      RETURNING id`,
      [
        params.userId,
        shareToken,
        params.fileName,
        params.fileSize,
        params.mimeType,
        params.wolkeShareLinkId,
        params.wolkeFilePath,
        params.passwordHash ?? null,
        params.expiresAt ?? null,
        params.message ?? null,
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

  /**
   * Proxy-download a transfer file from Nextcloud.
   * Accepts pre-loaded share data to avoid redundant DB queries.
   */
  async proxyDownloadWithRecord(record: {
    user_id: string;
    wolke_share_link_id?: string | null;
    wolke_file_path?: string | null;
    file_name?: string | null;
  }): Promise<DownloadFileResult & { fileName: string }> {
    if (!record.wolke_share_link_id || !record.wolke_file_path) {
      throw new Error('Transfer has no Wolke reference');
    }

    const shareLinks = await NextcloudShareManager.getShareLinks(record.user_id);
    const wolkeLink = shareLinks.find(
      (link: NextcloudShareLink) => link.id === record.wolke_share_link_id && link.is_active
    );

    if (!wolkeLink) {
      throw new Error('Wolke connection no longer available');
    }

    const client = new NextcloudApiClient(wolkeLink.share_link);
    const webdavPath = `/public.php/webdav/${record.wolke_file_path}`;

    log.info('Proxying download from Wolke', {
      path: record.wolke_file_path,
    });

    const result = await client.downloadFile(webdavPath);

    return {
      ...result,
      fileName: record.file_name || 'download',
    };
  }

  async proxyDownload(shareToken: string): Promise<DownloadFileResult & { fileName: string }> {
    const transfer = await this.getTransferByToken(shareToken);
    if (!transfer) {
      throw new Error('Transfer not found');
    }

    return this.proxyDownloadWithRecord(transfer);
  }

  async listUserTransfers(userId: string): Promise<TransferRecord[]> {
    await this.ensureInitialized();

    return this.postgres!.query<TransferRecord>(
      `SELECT id, share_token, file_name, file_size, mime_type,
              download_count, created_at, wolke_share_link_id, wolke_file_path, user_id,
              expires_at, password_hash, transfer_message
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
    folderPath?: string,
    options?: TransferOptions
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

    // Ensure the transfer folder exists (auto-create on first use)
    await client.ensureFolder(targetFolder);

    const uploadResult = await client.uploadFile(fileBuffer, safeFilename, targetFolder);

    if (!uploadResult.success) {
      throw new Error(uploadResult.message || 'Upload zu Wolke fehlgeschlagen');
    }

    const wolkeFilePath = targetFolder ? `${targetFolder}/${safeFilename}` : safeFilename;

    // Hash password if provided (scrypt format: "salt:hash")
    let passwordHash: string | undefined;
    if (options?.password) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(options.password, salt, 64).toString('hex');
      passwordHash = `${salt}:${hash}`;
    }

    // Calculate expiry
    let expiresAt: Date | undefined;
    if (options?.expiresInDays && options.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }

    return this.createTransfer({
      userId,
      fileName: originalFilename,
      fileSize: fileBuffer.length,
      mimeType,
      wolkeShareLinkId,
      wolkeFilePath,
      passwordHash,
      expiresAt,
      message: options?.message,
    });
  }

  /**
   * Stream-based upload for large files (up to 2GB).
   * Reads from a temp file path instead of holding the buffer in memory.
   */
  async uploadAndCreateTransferStream(
    userId: string,
    filePath: string,
    originalFilename: string,
    mimeType: string,
    fileSize: number,
    wolkeShareLinkId: string,
    folderPath?: string,
    options?: TransferOptions
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

    await client.ensureFolder(targetFolder);

    const uploadResult = await client.uploadFileStream(filePath, safeFilename, targetFolder);

    if (!uploadResult.success) {
      throw new Error(uploadResult.message || 'Upload zu Wolke fehlgeschlagen');
    }

    const wolkeFilePath = targetFolder ? `${targetFolder}/${safeFilename}` : safeFilename;

    let passwordHash: string | undefined;
    if (options?.password) {
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = crypto.scryptSync(options.password, salt, 64).toString('hex');
      passwordHash = `${salt}:${hash}`;
    }

    let expiresAt: Date | undefined;
    if (options?.expiresInDays && options.expiresInDays > 0) {
      expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + options.expiresInDays);
    }

    return this.createTransfer({
      userId,
      fileName: originalFilename,
      fileSize,
      mimeType,
      wolkeShareLinkId,
      wolkeFilePath,
      passwordHash,
      expiresAt,
      message: options?.message,
    });
  }
}

export const transferService = new TransferService();
