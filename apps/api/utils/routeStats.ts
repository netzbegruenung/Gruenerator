/**
 * Route Statistics Tracking
 * Tracks API route usage for analytics
 * Extracted from routes.js for better modularity
 */

/**
 * Normalize a route path by replacing dynamic segments with placeholders
 */
export function normalizeRoute(path: string): string {
  return path
    // Replace UUIDs
    .replace(/\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, '/:uuid')
    // Replace numeric IDs
    .replace(/\/\d+/g, '/:id')
    // Replace MongoDB ObjectIDs
    .replace(/\/[0-9a-f]{24}/g, '/:objectid');
}

/**
 * Route usage statistics tracker
 * Buffers stats in memory for periodic batch updates
 */
export class RouteStatsTracker {
  private stats: Map<string, number>;

  constructor() {
    this.stats = new Map();
  }

  /**
   * Track a route access
   */
  track(method: string, path: string): void {
    try {
      const routePattern = normalizeRoute(path);
      const key = `${method} ${routePattern}`;
      this.stats.set(key, (this.stats.get(key) || 0) + 1);
    } catch {
      // Ignore tracking errors
    }
  }

  /**
   * Get current stats (returns a copy)
   */
  getStats(): Map<string, number> {
    return new Map(this.stats);
  }

  /**
   * Get stats as plain object
   */
  getStatsObject(): Record<string, number> {
    return Object.fromEntries(this.stats);
  }

  /**
   * Check if there are any stats to flush
   */
  hasStats(): boolean {
    return this.stats.size > 0;
  }

  /**
   * Clear stats and return the previous values
   */
  flush(): Map<string, number> {
    const batch = new Map(this.stats);
    this.stats.clear();
    return batch;
  }
}

export default RouteStatsTracker;
