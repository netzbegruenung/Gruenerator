/**
 * Logging utility for MCP Server
 * Provides structured logging with timestamps and categories
 */

// Log levels
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

// Current log level (can be set via environment)
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// Request statistics
const stats = {
  totalRequests: 0,
  searchRequests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  avgResponseTimeMs: 0,
  responseTimes: [],
  startTime: Date.now(),
  lastRequestTime: null,
  requestsByCollection: {},
  requestsBySearchMode: {},
};

/**
 * Format timestamp for logging
 */
function getTimestamp() {
  return new Date().toISOString();
}

/**
 * Log at DEBUG level
 */
function _debug(category: string, message: string, data: unknown = null) {
  if (currentLevel <= LOG_LEVELS.DEBUG) {
    const log: Record<string, unknown> = {
      timestamp: getTimestamp(),
      level: 'DEBUG',
      category,
      message,
    };
    if (data) log.data = data;
    console.error(JSON.stringify(log));
  }
}

/**
 * Log at INFO level
 */
export function info(category: string, message: string, data: unknown = null) {
  if (currentLevel <= LOG_LEVELS.INFO) {
    const log: Record<string, unknown> = {
      timestamp: getTimestamp(),
      level: 'INFO',
      category,
      message,
    };
    if (data) log.data = data;
    console.error(JSON.stringify(log));
  }
}

/**
 * Log at WARN level
 */
function _warn(category: string, message: string, data: unknown = null) {
  if (currentLevel <= LOG_LEVELS.WARN) {
    const log: Record<string, unknown> = {
      timestamp: getTimestamp(),
      level: 'WARN',
      category,
      message,
    };
    if (data) log.data = data;
    console.error(JSON.stringify(log));
  }
}

/**
 * Log at ERROR level
 */
export function error(category: string, message: string, data: unknown = null) {
  if (currentLevel <= LOG_LEVELS.ERROR) {
    const log: Record<string, unknown> = {
      timestamp: getTimestamp(),
      level: 'ERROR',
      category,
      message,
    };
    if (data) log.data = data;
    console.error(JSON.stringify(log));
    stats.errors++;
  }
}

/**
 * Log a search request
 */
export function logSearch(
  query,
  collection,
  searchMode,
  resultCount,
  responseTimeMs,
  cached = false
) {
  stats.totalRequests++;
  stats.searchRequests++;
  stats.lastRequestTime = Date.now();

  if (cached) {
    stats.cacheHits++;
  } else {
    stats.cacheMisses++;
  }

  // Track response times (keep last 100)
  stats.responseTimes.push(responseTimeMs);
  if (stats.responseTimes.length > 100) {
    stats.responseTimes.shift();
  }
  stats.avgResponseTimeMs =
    stats.responseTimes.reduce((a, b) => a + b, 0) / stats.responseTimes.length;

  // Track by collection
  stats.requestsByCollection[collection] = (stats.requestsByCollection[collection] || 0) + 1;

  // Track by search mode
  stats.requestsBySearchMode[searchMode] = (stats.requestsBySearchMode[searchMode] || 0) + 1;

  info(
    'Search',
    `Query: "${query.substring(0, 50)}..." | Collection: ${collection} | Mode: ${searchMode} | Results: ${resultCount} | Time: ${responseTimeMs}ms | Cached: ${cached}`
  );
}

/**
 * Get server statistics
 */
export function getStats() {
  const uptimeMs = Date.now() - stats.startTime;
  const uptimeHours = (uptimeMs / 1000 / 60 / 60).toFixed(2);

  return {
    uptime: {
      ms: uptimeMs,
      hours: parseFloat(uptimeHours),
      startedAt: new Date(stats.startTime).toISOString(),
    },
    requests: {
      total: stats.totalRequests,
      searches: stats.searchRequests,
      errors: stats.errors,
      lastRequestAt: stats.lastRequestTime ? new Date(stats.lastRequestTime).toISOString() : null,
    },
    performance: {
      avgResponseTimeMs: Math.round(stats.avgResponseTimeMs),
      cacheHitRate:
        stats.totalRequests > 0
          ? `${((stats.cacheHits / stats.totalRequests) * 100).toFixed(1)}%`
          : '0%',
    },
    breakdown: {
      byCollection: stats.requestsByCollection,
      bySearchMode: stats.requestsBySearchMode,
    },
  };
}

/**
 * Reset statistics (for testing)
 */
function _resetStats() {
  stats.totalRequests = 0;
  stats.searchRequests = 0;
  stats.cacheHits = 0;
  stats.cacheMisses = 0;
  stats.errors = 0;
  stats.avgResponseTimeMs = 0;
  stats.responseTimes = [];
  stats.lastRequestTime = null;
  stats.requestsByCollection = {};
  stats.requestsBySearchMode = {};
}
