module.exports = {
    worker: {
      // Anzahl der AI-Worker pro Server-Worker
      workersPerNode: 4,
      
      // Timeout-Einstellungen
      requestTimeout: 120000, // 2 Minuten (120000ms)
      
      // Rate Limiting pro Worker
      rateLimit: {
        maxRequests: 500,
        timeWindow: 60000, // 1 Minute
        maxConcurrent: 25
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
      level:  'info',
      aiRequests: true,
      performance: true
    }
  };