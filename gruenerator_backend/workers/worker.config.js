module.exports = {
    worker: {
      // Anzahl der AI-Worker pro Server-Worker
      workersPerNode: process.env.AI_WORKERS_PER_NODE || 4,
      
      // Timeout-Einstellungen
      requestTimeout: 30000, // 30 Sekunden
      
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
        maxDelay: 30000,    // 30 Sekunden maximale Verzögerung
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
      },
      
      // Backup-Provider Einstellungen
      backup: {
        enabled: true,
        provider: 'openai',
        modelMapping: {
          'claude-3-5-sonnet-20241022': 'gpt-4-turbo-preview',
          'claude-3-opus-20240229': 'gpt-4-turbo-preview',
          'claude-2.1': 'gpt-4'
        },
        maxTokens: 8000,
        timeout: 30000
      }
    },
    
    // Logging-Einstellungen
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      aiRequests: true,
      performance: true
    }
  };