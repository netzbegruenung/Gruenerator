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
      
      // Retry-Einstellungen
      retry: {
        maxRetries: 3,
        baseDelay: 1000, // 1 Sekunde
      }
    },
    
    // Logging-Einstellungen
    logging: {
      level: process.env.LOG_LEVEL || 'info',
      aiRequests: true,
      performance: true
    }
  };