/**
 * OffboardingService - Main orchestration for user offboarding
 *
 * Coordinates API client, retry manager, and user deletion/anonymization
 */

import { env } from '../../config/env.js';
import { createLogger } from '../../utils/logger.js';

import { GrueneApiClient } from './GrueneApiClient.js';
import { GrueneratorOffboarding } from './GrueneratorOffboarding.js';
import { RetryManager } from './RetryManager.js';

import type {
  GrueneApiConfig,
  OffboardingUser,
  BatchUpdateEntry,
  OffboardingResult,
} from './types.js';

const log = createLogger('OffboardingService');

// Default configuration
export const DEFAULT_CONFIG: GrueneApiConfig = {
  GRUENE_API_BASEURL: env.GRUENE_API_BASEURL ?? 'https://app.gruene.de',
  GRUENE_API_USERNAME: env.GRUENE_API_USERNAME,
  GRUENE_API_PASSWORD: env.GRUENE_API_PASSWORD,
  GRUENE_API_KEY: env.GRUENE_API_KEY,
  BATCH_SIZE: 200,
  REQUEST_LIMIT: 1000,
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
  async *fetchOffboardingUsers(): AsyncGenerator<OffboardingUser> {
    let after: string | null = null;

    // A fetch failure must NOT be swallowed: silently breaking here makes a failed
    // Grüne API call indistinguishable from an empty offboarding queue, so the run
    // reports success with zero users processed. Let the error propagate (the client
    // already logs it) so runOffboarding/dryRunOffboarding fail loudly instead.
    while (true) {
      const response = await this.apiClient.findUsersToOffboard(this.config.REQUEST_LIMIT, after);
      const users = response.data || [];

      for (const user of users) {
        yield user;
      }

      after = response.meta?.cursorNext || null;
      if (!after) {
        break;
      }
    }
  }

  /**
   * Process users in batches
   */
  async *processUserBatches(): AsyncGenerator<BatchUpdateEntry[]> {
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
          status: result.status,
        });

        if (upserts.length >= this.config.BATCH_SIZE) {
          yield [...upserts];
          upserts.length = 0; // Clear array
        }
      } catch (error: unknown) {
        log.error(
          `Error processing user ${user.username}:`,
          error instanceof Error ? error.message : String(error)
        );
        break;
      }
    }

    if (upserts.length > 0) {
      yield upserts;
    }
  }

  /**
   * Run the complete offboarding process
   * @param options.dryRun - When true, no users are deleted/anonymized and nothing is
   *   reported upstream; the result reports how many users *would* be processed.
   */
  async runOffboarding(options: { dryRun?: boolean } = {}): Promise<OffboardingResult> {
    const { dryRun = false } = options;

    if (dryRun) {
      return this.dryRunOffboarding();
    }

    const startTime = Date.now();
    const counts = { deleted: 0, anonymized: 0, not_found: 0, failed: 0 };
    let retriesProcessed = 0;
    let success = true;

    log.info('Starting Grünerator offboarding process');

    try {
      retriesProcessed = await RetryManager.processRetries(this.apiClient);
    } catch (error: unknown) {
      log.error('Retry processing failed:', error instanceof Error ? error.message : String(error));
      success = false;
    }

    for await (const batch of this.processUserBatches()) {
      for (const entry of batch) {
        counts[entry.status] = (counts[entry.status] || 0) + 1;
      }

      try {
        await this.apiClient.batchUpdateOffboardingUsers(batch);
        log.info(`Successfully reported ${batch.length} processed users to API`);
      } catch (error: unknown) {
        log.error(
          'Failed to report processed users to API:',
          error instanceof Error ? error.message : String(error)
        );
        success = false;

        try {
          await RetryManager.saveRetries(batch);
          log.info('Saved failed batch for retry');
        } catch (retryError: unknown) {
          log.error(
            'Failed to save retry data:',
            retryError instanceof Error ? retryError.message : String(retryError)
          );
        }
        break;
      }
    }

    const result: OffboardingResult = {
      success,
      dryRun: false,
      processed: counts.deleted + counts.anonymized + counts.not_found + counts.failed,
      wouldProcess: 0,
      deleted: counts.deleted,
      anonymized: counts.anonymized,
      notFound: counts.not_found,
      failed: counts.failed,
      retriesProcessed,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    log.info(
      `Offboarding completed in ${result.durationMs}ms: ${result.processed} processed ` +
        `(${result.deleted} deleted, ${result.anonymized} anonymized, ${result.notFound} not found, ${result.failed} failed)`
    );

    return result;
  }

  /**
   * Walk the full offboarding set without mutating anything, counting how many users
   * would be processed. Delete-vs-anonymize cannot be predicted (deletion is attempted
   * first with anonymization as fallback), so we only distinguish found vs not-found.
   */
  private async dryRunOffboarding(): Promise<OffboardingResult> {
    const startTime = Date.now();
    let wouldProcess = 0;
    let notFound = 0;
    let failed = 0;

    log.info('Starting Grünerator offboarding DRY RUN (no changes will be made)');

    for await (const user of this.fetchOffboardingUsers()) {
      try {
        const grueneratorUser = await this.grueneratorOffboarding.findUserInGruenerator(user);
        if (grueneratorUser) {
          wouldProcess += 1;
        } else {
          notFound += 1;
        }
      } catch (error: unknown) {
        failed += 1;
        log.warn(
          `Dry-run lookup failed for ${user.username}:`,
          error instanceof Error ? error.message : String(error)
        );
      }
    }

    const result: OffboardingResult = {
      success: true,
      dryRun: true,
      processed: wouldProcess + notFound + failed,
      wouldProcess,
      deleted: 0,
      anonymized: 0,
      notFound,
      failed,
      retriesProcessed: 0,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    };

    log.info(
      `Offboarding dry run completed in ${result.durationMs}ms: ${wouldProcess} would be processed, ` +
        `${notFound} not found in DB, ${failed} lookup errors`
    );

    return result;
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
    const result = await service.runOffboarding();
    process.exit(result.success ? 0 : 1);
  } catch (error: unknown) {
    log.error(
      'Offboarding service failed:',
      error instanceof Error ? error.message : String(error)
    );
    process.exit(1);
  }
}
