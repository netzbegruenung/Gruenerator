import type { WorkerConfigRoot } from './types.js';

const config: WorkerConfigRoot = {
  worker: {
    workersPerNode: parseInt(process.env.AI_WORKER_COUNT ?? '', 10) || 1,

    requestTimeout: parseInt(process.env.REQUEST_TIMEOUT ?? '', 10) || 120000,

    rateLimit: {
      maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS ?? '', 10) || 250,
      timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW ?? '', 10) || 60000,
      maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT ?? '', 10) || 10,
    },

    retry: {
      maxRetries: parseInt(process.env.MAX_RETRIES ?? '', 10) || 3,
      baseDelay: parseInt(process.env.RETRY_BASE_DELAY ?? '', 10) || 1000,
      maxDelay: parseInt(process.env.RETRY_MAX_DELAY ?? '', 10) || 120000,
      retryableErrors: [
        'rate_limit',
        'timeout',
        'network_error',
        'internal_server_error',
        '429',
        '500',
        '503',
      ],
      useBackupOnFail: process.env.USE_BACKUP_ON_FAIL !== 'false',
      backupRetryCount: parseInt(process.env.BACKUP_RETRY_COUNT ?? '', 10) || 2,
    },

    messaging: {
      progressUpdates: process.env.PROGRESS_UPDATES !== 'false',
      internalTimeout: parseInt(process.env.INTERNAL_TIMEOUT ?? '', 10) || 110000,
      validateResponses: process.env.VALIDATE_RESPONSES !== 'false',
      debugLogging: process.env.DEBUG_LOGGING === 'true',
    },

    debug: {
      enabled: process.env.DEBUG_MODE === 'true',
      verbose: process.env.VERBOSE_LOGGING === 'true',
      delayResponseMs: parseInt(process.env.DELAY_RESPONSE_MS ?? '', 10) || 0,
    },
  },

  logging: {
    level: process.env.LOG_LEVEL || 'full',
    aiRequests: process.env.LOG_AI_REQUESTS !== 'false',
    performance: process.env.LOG_PERFORMANCE !== 'false',
    fullResponses: process.env.LOG_FULL_RESPONSES === 'true',
  },
};

export default config;
