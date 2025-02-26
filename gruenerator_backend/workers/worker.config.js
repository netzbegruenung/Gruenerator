module.exports = {
    worker: {
      // Anzahl der AI-Worker aus Umgebungsvariable oder Standardwert
      workersPerNode: parseInt(process.env.AI_WORKER_COUNT, 10) || 2,
      
      // Timeout-Einstellungen
      requestTimeout: parseInt(process.env.REQUEST_TIMEOUT, 10) || 120000, // 2 Minuten (120000ms)
      
      // Rate Limiting pro Worker
      rateLimit: {
        maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 250,
        timeWindow: parseInt(process.env.RATE_LIMIT_TIME_WINDOW, 10) || 60000, // 1 Minute
        maxConcurrent: parseInt(process.env.RATE_LIMIT_MAX_CONCURRENT, 10) || 10
      },
      
      // Erweiterte Retry-Einstellungen
      retry: {
        maxRetries: parseInt(process.env.MAX_RETRIES, 10) || 3,
        baseDelay: parseInt(process.env.RETRY_BASE_DELAY, 10) || 1000,    // 1 Sekunde Basis-Verzögerung
        maxDelay: parseInt(process.env.RETRY_MAX_DELAY, 10) || 120000,    // 2 Minuten maximale Verzögerung
        retryableErrors: [
          'rate_limit',
          'timeout',
          'network_error',
          'internal_server_error',
          '429',
          '500',
          '503'
        ],
        useBackupOnFail: process.env.USE_BACKUP_ON_FAIL !== 'false',  // Standardmäßig aktiviert
        backupRetryCount: parseInt(process.env.BACKUP_RETRY_COUNT, 10) || 2
      },
      
      // Neue Message-Protokoll-Einstellungen
      messaging: {
        // Unterstütze Fortschrittsberichte für lange Anfragen
        progressUpdates: process.env.PROGRESS_UPDATES !== 'false',
        // Interne Timeout-Kontrolle (10s weniger als das Haupt-Timeout für Aufräumarbeiten)
        internalTimeout: parseInt(process.env.INTERNAL_TIMEOUT, 10) || 110000,
        // Validierung von Antworten aktivieren
        validateResponses: process.env.VALIDATE_RESPONSES !== 'false',
        // Debug-Logging
        debugLogging: process.env.DEBUG_LOGGING === 'true'
      },
      
      // Debug-Einstellungen
      debug: {
        // Debug-Modus aktivieren
        enabled: process.env.DEBUG_MODE === 'true',
        // Ausführliche Logs
        verbose: process.env.VERBOSE_LOGGING === 'true',
        // Minimale Verzögerung zwischen API-Antwort und Senden (hilft Race Conditions zu vermeiden)
        delayResponseMs: parseInt(process.env.DELAY_RESPONSE_MS, 10) || 0
      }
    },
    
    // Logging-Einstellungen
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      aiRequests: process.env.LOG_AI_REQUESTS !== 'false',
      performance: process.env.LOG_PERFORMANCE !== 'false',
      // Detaillierte Antwort-Logs
      fullResponses: process.env.LOG_FULL_RESPONSES === 'true'
    }
  };