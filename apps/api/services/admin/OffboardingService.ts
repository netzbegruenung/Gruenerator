/**
 * OffboardingService - Main orchestration for user offboarding
 *
 * Coordinates API client, retry manager, and user deletion/anonymization
 */

import { createLogger } from '../../utils/logger.js';
import { GrueneApiClient } from './GrueneApiClient.js';
import { RetryManager } from './RetryManager.js';
import { GrueneratorOffboarding } from './GrueneratorOffboarding.js';
import type {
  GrueneApiConfig,
  OffboardingUser,
  BatchUpdateEntry
} from './types.js';

const log = createLogger('OffboardingService');

// Default configuration
export const DEFAULT_CONFIG: GrueneApiConfig = {
  GRUENE_API_BASEURL: process.env.GRUENE_API_BASEURL || 'https://app.gruene.de',
  GRUENE_API_USERNAME: process.env.GRUENE_API_USERNAME,
  GRUENE_API_PASSWORD: process.env.GRUENE_API_PASSWORD,
  GRUENE_API_KEY: process.env.GRUENE_API_KEY,
  BATCH_SIZE: 200,
  REQUEST_LIMIT: 1000
};

export class OffboardingService {
  private apiClient: GrueneApiClient;
  public grueneratorOffboarding: GrueneratorOffboarding;
  private config: GrueneApiConfig;

  constructor(config: GrueneApiConfig = DEFAULT_CONFIG) {
    this.config = config;
    this.apiClient = new GrueneApiClient(config);
    this.grueneratorOffboarding = new GrueneratorOffboarding();
  }

  /**
   * Generator function to fetch all users needing offboarding
   */
  async* fetchOffboardingUsers(): AsyncGenerator<OffboardingUser> {
    let after: string | null = null;

    while (true) {
      try {
        const response = await this.apiClient.findUsersToOffboard(this.config.REQUEST_LIMIT, after);
        const users = response.data || [];

        for (const user of users) {
          yield user;
        }

        after = response.meta?.cursorNext || null;
        if (!after) {
          break;
        }
      } catch (error: any) {
        log.error('Failed to fetch users from API:', error.message);
        break;
      }
    }
  }

  /**
   * Process users in batches
   */
  async* processUserBatches(): AsyncGenerator<BatchUpdateEntry[]> {
    const upserts: BatchUpdateEntry[] = [];

    for await (const user of this.fetchOffboardingUsers()) {
      try {
        const result = await this.grueneratorOffboarding.processUser(user);

        if (result.status === 'failed') {
          log.warn(`User processing failed: ${user.username} - ${result.message}`);
          continue;
        }

        log.info(`User processed: ${user.username} - ${result.status} - ${result.message}`);

        upserts.push({
          id: user.id,
          status: result.status
        });

        if (upserts.length >= this.config.BATCH_SIZE) {
          yield [...upserts];
          upserts.length = 0; // Clear array
        }
      } catch (error: any) {
        log.error(`Error processing user ${user.username}:`, error.message);
        break;
      }
    }

    if (upserts.length > 0) {
      yield upserts;
    }
  }

  /**
   * Run the complete offboarding process
   * @returns True if successful, false otherwise
   */
  async runOffboarding(): Promise<boolean> {
    log.info('Starting Grünerator offboarding process');

    try {
      // First, process any retries
      await RetryManager.processRetries(this.apiClient);
    } catch (error: any) {
      log.error('Retry processing failed:', error.message);
      return false;
    }

    // Process new offboarding requests
    for await (const batch of this.processUserBatches()) {
      try {
        await this.apiClient.batchUpdateOffboardingUsers(batch);
        log.info(`Successfully reported ${batch.length} processed users to API`);
      } catch (error: any) {
        log.error('Failed to report processed users to API:', error.message);

        try {
          await RetryManager.saveRetries(batch);
          log.info('Saved failed batch for retry');
        } catch (retryError: any) {
          log.error('Failed to save retry data:', retryError.message);
        }
        break;
      }
    }

    log.info('Offboarding process completed');
    return true;
  }

  /**
   * Validate configuration
   * @throws Error if configuration is invalid
   */
  static validateConfig(config: GrueneApiConfig = DEFAULT_CONFIG): void {
    if (!config.GRUENE_API_BASEURL) {
      throw new Error('Missing required configuration: GRUENE_API_BASEURL');
    }

    // Check that either basic auth or API key is configured
    const hasBasicAuth = config.GRUENE_API_USERNAME && config.GRUENE_API_PASSWORD;
    const hasApiKey = config.GRUENE_API_KEY;

    if (!hasBasicAuth && !hasApiKey) {
      throw new Error('Either basic auth (username/password) or API key must be configured');
    }

    // Database validation is handled by ProfileService and PostgresService initialization
  }
}

/**
 * CLI entry point for standalone execution
 */
export async function runOffboardingCLI(): Promise<void> {
  try {
    OffboardingService.validateConfig();
    const service = new OffboardingService();
    const success = await service.runOffboarding();
    process.exit(success ? 0 : 1);
  } catch (error: any) {
    log.error('Offboarding service failed:', error.message);
    process.exit(1);
  }
}
