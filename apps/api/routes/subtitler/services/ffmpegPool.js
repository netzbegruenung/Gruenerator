/**
 * FFmpeg Process Pool
 *
 * Limits concurrent FFmpeg processes to prevent CPU saturation.
 * Uses a simple semaphore pattern - zero external dependencies.
 */

const { createLogger } = require('../../../utils/logger.js');
const log = createLogger('FFmpegPool');

class FFmpegPool {
  constructor(maxConcurrent = 2) {
    this.max = maxConcurrent;
    this.running = 0;
    this.queue = [];
    log.info(`FFmpegPool initialized with max ${maxConcurrent} concurrent processes`);
  }

  /**
   * Run a function with FFmpeg concurrency limiting
   * @param {Function} fn - Async function that runs FFmpeg
   * @param {string} label - Optional label for logging
   * @returns {Promise} - Result of fn()
   */
  async run(fn, label = 'unknown') {
    // If at capacity, wait in queue
    if (this.running >= this.max) {
      log.debug(`[${label}] Queued (running: ${this.running}, queued: ${this.queue.length})`);
      await new Promise(resolve => this.queue.push(resolve));
    }

    this.running++;
    log.debug(`[${label}] Started (running: ${this.running}, queued: ${this.queue.length})`);

    try {
      return await fn();
    } finally {
      this.running--;
      log.debug(`[${label}] Finished (running: ${this.running}, queued: ${this.queue.length})`);

      // Release next waiting job
      if (this.queue.length > 0) {
        const next = this.queue.shift();
        next();
      }
    }
  }

  /**
   * Get current pool status
   * @returns {Object} - { running, queued, max }
   */
  getStatus() {
    return {
      running: this.running,
      queued: this.queue.length,
      max: this.max
    };
  }
}

// Singleton instance - shared across all imports
// With 16 cores and 15GB RAM, we can handle 6 concurrent FFmpeg processes
const ffmpegPool = new FFmpegPool(6);

module.exports = { ffmpegPool, FFmpegPool };
