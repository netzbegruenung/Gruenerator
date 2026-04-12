import { env } from '../config/env.js';

import type { WorkerConfigRoot } from './types.js';

const config: WorkerConfigRoot = {
  worker: {
    workersPerNode: env.AI_WORKER_COUNT,

    requestTimeout: env.REQUEST_TIMEOUT,

    rateLimit: {
      maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
      timeWindow: env.RATE_LIMIT_TIME_WINDOW,
      maxConcurrent: env.RATE_LIMIT_MAX_CONCURRENT,
    },

    retry: {
      maxRetries: env.MAX_RETRIES,
      baseDelay: env.RETRY_BASE_DELAY,
      maxDelay: env.RETRY_MAX_DELAY,
      retryableErrors: [
        'rate_limit',
        'timeout',
        'network_error',
        'internal_server_error',
        '429',
        '500',
        '503',
      ],
      useBackupOnFail: env.USE_BACKUP_ON_FAIL,
      backupRetryCount: env.BACKUP_RETRY_COUNT,
    },

    messaging: {
      progressUpdates: env.PROGRESS_UPDATES,
      internalTimeout: env.INTERNAL_TIMEOUT,
      validateResponses: env.VALIDATE_RESPONSES,
      debugLogging: env.DEBUG_LOGGING,
    },

    debug: {
      enabled: env.DEBUG_MODE,
      verbose: env.VERBOSE_LOGGING,
      delayResponseMs: env.DELAY_RESPONSE_MS,
    },
  },

  logging: {
    level: env.LOG_LEVEL,
    aiRequests: env.LOG_AI_REQUESTS,
    performance: env.LOG_PERFORMANCE,
    fullResponses: env.LOG_FULL_RESPONSES,
  },
};

export default config;
