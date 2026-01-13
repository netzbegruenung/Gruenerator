/**
 * SVG Cache with Intelligent Prefetching
 *
 * Eliminates 100-500ms SVG fetch delays by:
 * 1. In-memory LRU cache with 50MB limit
 * 2. Pre-computed color variants (8 colors per SVG)
 * 3. Three-tier priority prefetching (visible → high → background)
 * 4. RequestIdleCallback for non-blocking background loads
 */

import type { SvgDef } from './types';
import { ILLUSTRATION_COLORS } from './types';
import { getIllustrationPath } from './registry';
import { recordCacheHit, recordCacheMiss, recordNetworkRequest } from './prefetchAnalytics';

// =============================================================================
// TYPES
// =============================================================================

interface CachedSVG {
    rawSvg: string;                      // Original SVG text
    colorVariants: Map<string, string>;  // color → base64 data URL
    dataUrl: string | null;              // Default (no color manipulation)
    timestamp: number;                   // For LRU eviction
    size: number;                        // Estimated memory in bytes
}

interface PrefetchTask {
    id: string;
    priority: number;
    def: SvgDef;
}

// =============================================================================
// CACHE STATE
// =============================================================================

const cache = new Map<string, CachedSVG>();
let totalMemory = 0;
const MAX_MEMORY = 50 * 1024 * 1024; // 50MB

// Priority queues
const prefetchQueue: PrefetchTask[] = [];
let isPrefetching = false;

// Hover state
let hoverTimer: number | null = null;

// =============================================================================
// SVG PROCESSING
// =============================================================================

/**
 * Fetch SVG text from path
 */
async function fetchSvgText(path: string): Promise<string> {
    const response = await fetch(path);
    if (!response.ok) {
        throw new Error(`Failed to fetch SVG: ${response.statusText}`);
    }
    return response.text();
}

/**
 * Ensure SVG has required xmlns attribute
 */
function ensureXmlns(svgText: string): string {
    if (!svgText.includes('xmlns="http://www.w3.org/2000/svg"')) {
        return svgText.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    }
    return svgText;
}

/**
 * Replace SVG colors with target color
 */
function replaceColors(svgText: string, color: string): string {
    let result = svgText;
    // Replace unDraw primary color (case insensitive)
    result = result.replace(/#6c63ff/gi, color);
    // Replace Open Doodles primary color
    result = result.replace(/#ff5678/gi, color);
    return result;
}

/**
 * Convert SVG text to base64 data URL
 */
function svgToDataUrl(svgText: string): string {
    try {
        const base64 = window.btoa(unescape(encodeURIComponent(svgText)));
        return `data:image/svg+xml;base64,${base64}`;
    } catch (err) {
        console.error('Failed to encode SVG to base64:', err);
        // Fallback to URL encoding
        const encoded = encodeURIComponent(svgText);
        return `data:image/svg+xml;charset=utf-8,${encoded}`;
    }
}

/**
 * Estimate memory size of cached SVG entry
 */
function estimateSize(rawSvg: string, colorVariants: Map<string, string>): number {
    let size = rawSvg.length * 2; // UTF-16
    colorVariants.forEach(dataUrl => {
        size += dataUrl.length * 2;
    });
    return size;
}

/**
 * Pre-compute all color variants for an SVG
 */
function precomputeColorVariants(rawSvg: string): Map<string, string> {
    const variants = new Map<string, string>();

    // Generate variant for each predefined color
    ILLUSTRATION_COLORS.forEach(({ color }) => {
        const coloredSvg = replaceColors(rawSvg, color);
        const dataUrl = svgToDataUrl(coloredSvg);
        variants.set(color, dataUrl);
    });

    return variants;
}

// =============================================================================
// LRU EVICTION
// =============================================================================

/**
 * Evict least recently used entries until memory is under limit
 */
function evictLRU(): void {
    if (totalMemory < MAX_MEMORY) return;

    // Sort by timestamp (oldest first)
    const entries = Array.from(cache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);

    // Evict oldest until under 80% of limit
    const target = MAX_MEMORY * 0.8;
    for (const [id, cached] of entries) {
        if (totalMemory < target) break;

        cache.delete(id);
        totalMemory -= cached.size;
    }
}

// =============================================================================
// CORE CACHE API
// =============================================================================

/**
 * Get cached SVG synchronously (instant return)
 * Returns null if not cached
 */
export function getCachedSVG(id: string, color?: string): string | null {
    const cached = cache.get(id);
    if (!cached) return null;

    // Update timestamp (LRU)
    cached.timestamp = Date.now();

    // Track cache hit
    recordCacheHit(id);

    // Return color variant if requested
    if (color && cached.colorVariants.has(color)) {
        return cached.colorVariants.get(color)!;
    }

    // Return default if no color specified
    return cached.dataUrl;
}

/**
 * Fetch and cache SVG with all color variants
 * Returns base64 data URL for specified color (or default)
 */
async function fetchAndCacheSVG(id: string, def: SvgDef, color?: string): Promise<string> {
    try {
        // Track cache miss and network request
        recordCacheMiss(id);
        recordNetworkRequest();

        const path = getIllustrationPath(def);
        const rawSvg = await fetchSvgText(path);

        // Ensure xmlns
        const finalSvg = ensureXmlns(rawSvg);

        // Pre-compute all color variants
        const colorVariants = precomputeColorVariants(finalSvg);

        // Create default data URL (no color manipulation)
        const dataUrl = svgToDataUrl(finalSvg);

        // Calculate size and create cache entry
        const size = estimateSize(finalSvg, colorVariants);
        const cached: CachedSVG = {
            rawSvg: finalSvg,
            colorVariants,
            dataUrl,
            timestamp: Date.now(),
            size,
        };

        // Add to cache
        cache.set(id, cached);
        totalMemory += size;

        // Evict if over limit
        evictLRU();

        // Return requested color variant or default
        if (color && colorVariants.has(color)) {
            return colorVariants.get(color)!;
        }
        return dataUrl;

    } catch (err) {
        console.error(`Failed to fetch SVG ${id}:`, err);
        throw err;
    }
}

/**
 * Get SVG (async) - fetches if not cached
 */
export async function getSVG(id: string, def: SvgDef, color?: string): Promise<string> {
    const cached = getCachedSVG(id, color);
    if (cached) return cached;

    return fetchAndCacheSVG(id, def, color);
}

// =============================================================================
// PREFETCH PRIORITY QUEUE
// =============================================================================

/**
 * Process prefetch queue with RequestIdleCallback
 */
function processPrefetchQueue(): void {
    if (isPrefetching || prefetchQueue.length === 0) return;

    isPrefetching = true;

    // Sort by priority (highest first)
    prefetchQueue.sort((a, b) => b.priority - a.priority);

    const BATCH_SIZE = 5;
    let processed = 0;

    function processBatch(deadline?: IdleDeadline): void {
        // Process tasks while we have idle time
        while (
            prefetchQueue.length > 0 &&
            processed < BATCH_SIZE &&
            (!deadline || deadline.timeRemaining() > 10)
        ) {
            const task = prefetchQueue.shift()!;

            // Skip if already cached
            if (cache.has(task.id)) {
                processed++;
                continue;
            }

            // Fetch and cache (don't await)
            fetchAndCacheSVG(task.id, task.def).catch(err => {
                // Silent fail - will fetch on demand if needed
                console.warn(`Background prefetch failed for ${task.id}:`, err);
            });

            processed++;
        }

        // Schedule next batch if more tasks remain
        if (prefetchQueue.length > 0) {
            if ('requestIdleCallback' in window) {
                requestIdleCallback(processBatch, { timeout: 5000 });
            } else {
                // Fallback for Safari
                setTimeout(() => processBatch(), 100);
            }
        } else {
            isPrefetching = false;
        }
    }

    // Start processing
    if ('requestIdleCallback' in window) {
        requestIdleCallback(processBatch, { timeout: 1000 });
    } else {
        setTimeout(() => processBatch(), 0);
    }
}

/**
 * Add tasks to prefetch queue
 */
function queuePrefetch(tasks: PrefetchTask[]): void {
    prefetchQueue.push(...tasks);
    processPrefetchQueue();
}

// =============================================================================
// PUBLIC PREFETCH API
// =============================================================================

/**
 * Prefetch visible illustrations (high priority)
 * Returns immediately, fetches in background
 */
export function prefetchVisible(illustrations: Array<{ id: string; def: SvgDef }>): void {
    const tasks: PrefetchTask[] = illustrations
        .filter(({ id }) => !cache.has(id))
        .map(({ id, def }) => ({
            id,
            def,
            priority: 10, // Highest priority
        }));

    if (tasks.length === 0) return;

    // Use Promise.all for parallel fetching (not queued)
    Promise.all(
        tasks.map(({ id, def }) => fetchAndCacheSVG(id, def))
    ).catch(err => {
        console.warn('Prefetch visible failed:', err);
    });
}

/**
 * Prefetch illustrations during idle time (background)
 */
export function prefetchBackground(illustrations: Array<{ id: string; def: SvgDef }>): void {
    const tasks: PrefetchTask[] = illustrations
        .filter(({ id }) => !cache.has(id))
        .map(({ id, def }) => ({
            id,
            def,
            priority: 1, // Low priority
        }));

    if (tasks.length === 0) return;

    queuePrefetch(tasks);
}

/**
 * Prefetch high priority illustrations (likely to be used soon)
 */
export function prefetchHighPriority(illustrations: Array<{ id: string; def: SvgDef }>): void {
    const tasks: PrefetchTask[] = illustrations
        .filter(({ id }) => !cache.has(id))
        .map(({ id, def }) => ({
            id,
            def,
            priority: 5, // Medium priority
        }));

    if (tasks.length === 0) return;

    queuePrefetch(tasks);
}

// =============================================================================
// HOVER-BASED PREDICTIVE PREFETCH
// =============================================================================

/**
 * User is hovering over thumbnail - prefetch after 200ms
 */
export function onThumbnailHover(id: string, def: SvgDef): void {
    // Cancel any existing hover timer
    if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
    }

    // Schedule prefetch after 200ms
    hoverTimer = window.setTimeout(() => {
        if (!cache.has(id)) {
            fetchAndCacheSVG(id, def).catch(err => {
                console.warn(`Hover prefetch failed for ${id}:`, err);
            });
        }
        hoverTimer = null;
    }, 200);
}

/**
 * User stopped hovering - cancel scheduled prefetch
 */
export function onThumbnailLeave(): void {
    if (hoverTimer !== null) {
        clearTimeout(hoverTimer);
        hoverTimer = null;
    }
}

// =============================================================================
// CACHE STATS (for analytics)
// =============================================================================

export function getCacheStats() {
    return {
        entries: cache.size,
        totalMemoryMB: (totalMemory / (1024 * 1024)).toFixed(2),
        maxMemoryMB: (MAX_MEMORY / (1024 * 1024)).toFixed(2),
        utilizationPercent: ((totalMemory / MAX_MEMORY) * 100).toFixed(1),
        queueLength: prefetchQueue.length,
    };
}

/**
 * Clear cache (useful for development/testing)
 */
export function clearCache(): void {
    cache.clear();
    totalMemory = 0;
    prefetchQueue.length = 0;
    isPrefetching = false;
}
