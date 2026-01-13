/**
 * Prefetch Performance Analytics
 *
 * Tracks and reports metrics for the intelligent prefetching system:
 * - Cache hit rate
 * - Time from click to render
 * - Memory usage
 * - Network bandwidth saved
 */

import { getCacheStats } from './svgCache';
import { getCacheSize, isServiceWorkerActive } from '../../../../../utils/registerServiceWorker';

// =============================================================================
// METRICS STATE
// =============================================================================

interface MetricsData {
    cacheHits: number;
    cacheMisses: number;
    totalRequests: number;
    renderTimes: number[];  // Time from click to render (ms)
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
    return sorted.length % 2 === 0
        ? (sorted[mid - 1] + sorted[mid]) / 2
        : sorted[mid];
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
 * Log performance report to console
 */
export async function logPerformanceReport(): Promise<void> {
    const report = await getPerformanceReport();

    console.group('🎨 Illustration Prefetch Performance Report');

    console.group('📊 Cache Performance');
    console.log(`Hit Rate: ${report.cachePerformance.hitRate}%`);
    console.log(`Hits: ${report.cachePerformance.hits}`);
    console.log(`Misses: ${report.cachePerformance.misses}`);
    console.log(`Total Requests: ${report.cachePerformance.totalRequests}`);
    console.groupEnd();

    console.group('⚡ Render Performance');
    console.log(`Average: ${report.renderPerformance.averageMs}ms`);
    console.log(`Median: ${report.renderPerformance.medianMs}ms`);
    console.log(`P95: ${report.renderPerformance.p95Ms}ms`);
    console.log(`Samples: ${report.renderPerformance.samples}`);
    console.groupEnd();

    console.group('💾 In-Memory Cache');
    console.log(`Entries: ${report.inMemoryCache.entries}`);
    console.log(`Memory: ${report.inMemoryCache.memoryMB}MB`);
    console.log(`Utilization: ${report.inMemoryCache.utilizationPercent}%`);
    console.log(`Queue Length: ${report.inMemoryCache.queueLength}`);
    console.groupEnd();

    console.group('🔄 Service Worker');
    console.log(`Active: ${report.serviceWorker.active ? 'Yes' : 'No'}`);
    console.log(`Cache Size: ${report.serviceWorker.cacheSize} entries`);
    console.log(`Cache Name: ${report.serviceWorker.cacheName}`);
    console.groupEnd();

    console.group('🌐 Network Savings');
    console.log(`Requests: ${report.network.requests}`);
    console.log(`Saved Requests: ${report.network.estimatedSavedRequests}`);
    console.log(`Estimated Bandwidth Saved: ${report.network.estimatedBandwidthSavedKB}KB`);
    console.groupEnd();

    console.groupEnd();
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

// =============================================================================
// AUTO-LOGGING (Optional)
// =============================================================================

// Log performance report every 5 minutes in development
if (import.meta.env.DEV) {
    const AUTO_LOG_INTERVAL = 5 * 60 * 1000; // 5 minutes

    setInterval(() => {
        if (metrics.totalRequests > 0) {
            logPerformanceReport();
        }
    }, AUTO_LOG_INTERVAL);
}

// Expose analytics functions to window for debugging
interface IllustrationAnalyticsWindow extends Window {
    illustrationAnalytics?: {
        getPerformanceReport: typeof getPerformanceReport;
        logPerformanceReport: typeof logPerformanceReport;
        resetMetrics: typeof resetMetrics;
        getCacheHitRate: typeof getCacheHitRate;
        getAverageRenderTime: typeof getAverageRenderTime;
    };
}

if (import.meta.env.DEV) {
    (window as unknown as IllustrationAnalyticsWindow).illustrationAnalytics = {
        getPerformanceReport,
        logPerformanceReport,
        resetMetrics,
        getCacheHitRate,
        getAverageRenderTime,
        getMedianRenderTime,
        getP95RenderTime,
    };

    console.log('💡 Illustration analytics available via window.illustrationAnalytics');
}
