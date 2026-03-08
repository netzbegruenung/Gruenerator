/**
 * Prefetch Performance Analytics
 *
 * Tracks and reports metrics for the intelligent prefetching system:
 * - Cache hit rate
 * - Time from click to render
 * - Memory usage
 * - Network bandwidth saved
 */

import { getCacheSize, isServiceWorkerActive } from '../../../../../utils/registerServiceWorker';

import { getCacheStats } from './svgCache';

// =============================================================================
// METRICS STATE
// =============================================================================

interface MetricsData {
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
  renderTimes: number[]; // Time from click to render (ms)
  networkRequests: number;
  serviceWorkerCacheSize?: number;
}

const metrics: MetricsData = {
  cacheHits: 0,
  cacheMisses: 0,
  totalRequests: 0,
  renderTimes: [],
  networkRequests: 0,
  serviceWorkerCacheSize: 0,
};

// Track when user clicks on illustration
const clickTimestamps = new Map<string, number>();

// =============================================================================
// TRACKING FUNCTIONS
// =============================================================================

/**
 * Record cache hit (illustration loaded from in-memory cache)
 */
export function recordCacheHit(illustrationId: string): void {
  metrics.cacheHits++;
  metrics.totalRequests++;

  // Calculate render time if we have a click timestamp
  const clickTime = clickTimestamps.get(illustrationId);
  if (clickTime) {
    const renderTime = Date.now() - clickTime;
    metrics.renderTimes.push(renderTime);
    clickTimestamps.delete(illustrationId);
  }
}

/**
 * Record cache miss (illustration fetched from network)
 */
export function recordCacheMiss(illustrationId: string): void {
  metrics.cacheMisses++;
  metrics.totalRequests++;
  metrics.networkRequests++;

  // Calculate render time if we have a click timestamp
  const clickTime = clickTimestamps.get(illustrationId);
  if (clickTime) {
    const renderTime = Date.now() - clickTime;
    metrics.renderTimes.push(renderTime);
    clickTimestamps.delete(illustrationId);
  }
}

/**
 * Record when user clicks on an illustration
 */
export function recordIllustrationClick(illustrationId: string): void {
  clickTimestamps.set(illustrationId, Date.now());
}

/**
 * Record network request (for bandwidth tracking)
 */
export function recordNetworkRequest(): void {
  metrics.networkRequests++;
}

// =============================================================================
// ANALYTICS FUNCTIONS
// =============================================================================

/**
 * Calculate cache hit rate as percentage
 */
export function getCacheHitRate(): number {
  if (metrics.totalRequests === 0) return 0;
  return (metrics.cacheHits / metrics.totalRequests) * 100;
}

/**
 * Get average render time in milliseconds
 */
export function getAverageRenderTime(): number {
  if (metrics.renderTimes.length === 0) return 0;
  const sum = metrics.renderTimes.reduce((a, b) => a + b, 0);
  return sum / metrics.renderTimes.length;
}

/**
 * Get median render time in milliseconds
 */
export function getMedianRenderTime(): number {
  if (metrics.renderTimes.length === 0) return 0;
  const sorted = [...metrics.renderTimes].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Get p95 render time in milliseconds (95th percentile)
 */
export function getP95RenderTime(): number {
  if (metrics.renderTimes.length === 0) return 0;
  const sorted = [...metrics.renderTimes].sort((a, b) => a - b);
  const index = Math.ceil(sorted.length * 0.95) - 1;
  return sorted[index];
}

/**
 * Get comprehensive performance report
 */
export async function getPerformanceReport() {
  const cacheStats = getCacheStats();
  const swStatus = await getCacheSize();
  const swActive = await isServiceWorkerActive();

  return {
    // Cache stats
    inMemoryCache: {
      entries: cacheStats.entries,
      memoryMB: parseFloat(cacheStats.totalMemoryMB),
      utilizationPercent: parseFloat(cacheStats.utilizationPercent),
      queueLength: cacheStats.queueLength,
    },

    // Service Worker cache
    serviceWorker: {
      active: swActive,
      cacheSize: swStatus.cacheSize || 0,
      cacheName: swStatus.cacheName || 'N/A',
    },

    // Hit rate metrics
    cachePerformance: {
      hitRate: parseFloat(getCacheHitRate().toFixed(2)),
      hits: metrics.cacheHits,
      misses: metrics.cacheMisses,
      totalRequests: metrics.totalRequests,
    },

    // Render time metrics
    renderPerformance: {
      averageMs: parseFloat(getAverageRenderTime().toFixed(2)),
      medianMs: parseFloat(getMedianRenderTime().toFixed(2)),
      p95Ms: parseFloat(getP95RenderTime().toFixed(2)),
      samples: metrics.renderTimes.length,
    },

    // Network metrics
    network: {
      requests: metrics.networkRequests,
      estimatedSavedRequests: metrics.cacheHits,
      estimatedBandwidthSavedKB: (metrics.cacheHits * 15).toFixed(2), // Avg 15KB per SVG
    },
  };
}

/**
 * Reset all metrics (useful for testing)
 */
export function resetMetrics(): void {
  metrics.cacheHits = 0;
  metrics.cacheMisses = 0;
  metrics.totalRequests = 0;
  metrics.renderTimes = [];
  metrics.networkRequests = 0;
  clickTimestamps.clear();
}
