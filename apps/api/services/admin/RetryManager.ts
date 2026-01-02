/**
 * RetryManager - Retry mechanism for failed API calls
 *
 * Persists failed batch updates to disk for later retry
 */

import fs from 'fs/promises';
import { createLogger } from '../../utils/logger.js';
import type { GrueneApiClient } from './GrueneApiClient.js';
import type { BatchUpdateEntry } from './types.js';

const log = createLogger('RetryManager');

const RETRY_FILE = '/var/tmp/gruenerator-offboarding-retry.json';

export class RetryManager {
  /**
   * Load retry entries from disk
   * @returns Array of batch entries to retry, or null if no retries exist
   */
  static async loadRetries(): Promise<BatchUpdateEntry[] | null> {
    try {
      const data = await fs.readFile(RETRY_FILE, 'utf8');
      return JSON.parse(data);
    } catch (error: any) {
      if (error.code === 'ENOENT') {
        return null; // File doesn't exist
      }
      throw error;
    }
  }

  /**
   * Save retry entries to disk
   * @param data - Array of batch entries to save
   */
  static async saveRetries(data: BatchUpdateEntry[]): Promise<void> {
    try {
      await fs.writeFile(RETRY_FILE, JSON.stringify(data, null, 2));
    } catch (error: any) {
      log.error('Failed to save retry data:', error.message);
      throw error;
    }
  }

  /**
   * Process pending retries
   * @param apiClient - Grüne API client instance
   */
  static async processRetries(apiClient: GrueneApiClient): Promise<void> {
    const retries = await this.loadRetries();
    if (!retries || retries.length === 0) {
      return;
    }

    try {
      await apiClient.batchUpdateOffboardingUsers(retries);
      await this.saveRetries([]);
      log.info(`Successfully processed ${retries.length} retry entries`);
    } catch (error: any) {
      log.error('Failed to process retries:', error.message);
      throw error;
    }
  }
}
