/**
 * FFmpeg Process Pool
 *
 * Limits concurrent FFmpeg processes to prevent CPU saturation.
 * Uses a simple semaphore pattern - zero external dependencies.
 */

import { createLogger } from '../../utils/logger.js';

const log = createLogger('FFmpegPool');

interface PoolStatus {
  running: number;
  queued: number;
  max: number;
}

class FFmpegPool {
  private max: number;
  private running: number = 0;
  private queue: Array<() => void> = [];

  constructor(maxConcurrent: number = 2) {
    this.max = maxConcurrent;
    log.info(`FFmpegPool initialized with max ${maxConcurrent} concurrent processes`);
  }

  async run<T>(fn: () => Promise<T>, label: string = 'unknown'): Promise<T> {
    if (this.running >= this.max) {
      log.debug(`[${label}] Queued (running: ${this.running}, queued: ${this.queue.length})`);
      await new Promise<void>(resolve => this.queue.push(resolve));
    }

    this.running++;
    log.debug(`[${label}] Started (running: ${this.running}, queued: ${this.queue.length})`);

    try {
      return await fn();
    } finally {
      this.running--;
      log.debug(`[${label}] Finished (running: ${this.running}, queued: ${this.queue.length})`);

      if (this.queue.length > 0) {
        const next = this.queue.shift();
        if (next) next();
      }
    }
  }

  getStatus(): PoolStatus {
    return {
      running: this.running,
      queued: this.queue.length,
      max: this.max
    };
  }
}

const ffmpegPool = new FFmpegPool(6);

export { ffmpegPool, FFmpegPool };
export type { PoolStatus };
