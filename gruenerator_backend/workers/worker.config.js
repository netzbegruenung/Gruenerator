module.exports = {
    worker: {
      // Anzahl der AI-Worker: 1 normal, 4 im Produktionsmodus
      workersPerNode: process.env.PRODUCTION_MODE === 'true' ? 4 : 1,
      
      // Timeout-Einstellungen
      requestTimeout: 120000, // 2 Minuten (120000ms)
      
      // Rate Limiting pro Worker
      rateLimit: {
        maxRequests: process.env.PRODUCTION_MODE === 'true' ? 500 : 100,
        timeWindow: 60000, // 1 Minute
        maxConcurrent: process.env.PRODUCTION_MODE === 'true' ? 25 : 5
      },
      
      // Erweiterte Retry-Einstellungen
      retry: {
        maxRetries: 3,
        baseDelay: 1000,    // 1 Sekunde Basis-Verzögerung
        maxDelay: 120000,    // 2 Minuten maximale Verzögerung
        retryableErrors: [
          'rate_limit',
          'timeout',
          'network_error',
          'internal_server_error',
          '429',
          '500',
          '503'
        ],
        useBackupOnFail: true,  // Aktiviert Backup-Provider bei Fehler
        backupRetryCount: 2     // Maximale Anzahl von Backup-Versuchen
      }
    },
    
    // Logging-Einstellungen
    logging: {
      level: process.env.NODE_ENV === 'production' ? 'info' : 'debug',
      aiRequests: true,
      performance: true
    }
  };