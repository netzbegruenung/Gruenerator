import { getPostgresInstance } from '../database/services/PostgresService.js';
import { NextcloudShareManager } from '../utils/integrations/nextcloud/shareManager.js';
import { createLogger } from '../utils/logger.js';

import NextcloudApiClient, { type DownloadFileResult } from './api-clients/nextcloudApiClient.js';

import type { NextcloudShareLink } from '../utils/integrations/nextcloud/types.js';

const log = createLogger('transfer');

/**
 * Read-only remnant of the removed transfer feature (Wolke access is
 * read-only now, so no new transfers can be created). Existing
 * `shared_media` rows with media_type 'transfer' stay downloadable via the
 * public share routes until they expire.
 */
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

    const client = await NextcloudApiClient.create(wolkeLink.share_link);
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
}

export const transferService = new TransferService();
