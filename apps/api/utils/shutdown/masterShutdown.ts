/**
 * Master Process Shutdown Handler
 * Handles graceful shutdown of cluster master and all workers
 */

import cluster from 'cluster';

import type { MasterShutdownOptions, MasterShutdownHandler, Logger } from './types.js';

const DEFAULT_WORKER_TIMEOUT = 10000; // 10 seconds

const defaultLogger: Logger = {
  info: (msg: string) => console.log(`[Master] ${msg}`),
  warn: (msg: string) => console.warn(`[Master] ${msg}`),
  error: (msg: string) => console.error(`[Master] ${msg}`),
  debug: (msg: string) => console.debug(`[Master] ${msg}`),
};

/**
 * Create a shutdown handler for the master process
 */
export function createMasterShutdownHandler(
  options: MasterShutdownOptions = {}
): MasterShutdownHandler {
  const logger = options.logger ?? defaultLogger;
  const workerTimeout = options.workerTimeout ?? DEFAULT_WORKER_TIMEOUT;
  let inProgress = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (inProgress) {
      logger.debug(`Shutdown already in progress, ignoring ${signal}`);
      return;
    }
    inProgress = true;

    logger.info(`Received ${signal}, initiating graceful shutdown`);

    const workers = Object.values(cluster.workers || {}).filter(
      (w): w is cluster.Worker => w !== undefined
    );

    // Disconnect all workers
    workers.forEach((worker) => {
      worker.disconnect();
    });

    // Wait for workers to shut down with timeout
    const shutdownPromises = workers.map((worker) => {
      return new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          logger.warn(`Worker ${worker.process.pid} timeout, forcing kill`);
          worker.kill('SIGKILL');
          resolve();
        }, workerTimeout);

        // Send shutdown message
        worker.send({ type: 'shutdown' });

        worker.on('message', (msg: { type: string }) => {
          if (msg.type === 'shutdown-complete') {
            clearTimeout(timeout);
            logger.debug(`Worker ${worker.process.pid} shutdown complete`);
            options.onWorkerShutdown?.(worker.process.pid || 0);
            resolve();
          }
        });

        worker.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    });

    await Promise.all(shutdownPromises);

    logger.info('All workers shut down successfully');
    options.onComplete?.();
    process.exit(0);
  };

  const registerSignalHandlers = (): void => {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  };

  return {
    get inProgress() {
      return inProgress;
    },
    shutdown,
    registerSignalHandlers,
  };
}

export default createMasterShutdownHandler;
