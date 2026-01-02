/**
 * Worker Process Shutdown Handler
 * Handles graceful shutdown of worker processes with resource cleanup
 */

import type { Server } from 'http';
import type {
  WorkerShutdownOptions,
  WorkerShutdownHandler,
  ShutdownableResource,
  Logger,
  ClusterMessage
} from './types.js';

const defaultLogger: Logger = {
  info: (msg: string) => console.log(`[Worker] ${msg}`),
  warn: (msg: string) => console.warn(`[Worker] ${msg}`),
  error: (msg: string) => console.error(`[Worker] ${msg}`),
  debug: (msg: string) => console.debug(`[Worker] ${msg}`)
};

/**
 * Shutdown a single resource safely
 */
async function shutdownResource(resource: ShutdownableResource): Promise<void> {
  try {
    if (resource.shutdown) {
      await resource.shutdown();
    } else if (resource.quit) {
      await resource.quit();
    } else if (resource.terminate) {
      await resource.terminate();
    } else if (resource.close) {
      await new Promise<void>((resolve, reject) => {
        resource.close!((err?: Error) => {
          if (err) reject(err);
          else resolve();
        });
      });
    }
  } catch (error) {
    // Log but don't throw - we want to continue shutting down other resources
    console.error('[Worker] Resource shutdown error:', error);
  }
}

/**
 * Create a shutdown handler for a worker process
 */
export function createWorkerShutdownHandler(
  options: WorkerShutdownOptions
): WorkerShutdownHandler {
  const logger = options.logger ?? defaultLogger;
  const { resources, server, onComplete } = options;
  let inProgress = false;

  const shutdown = async (signal: string): Promise<void> => {
    if (inProgress) {
      return;
    }
    inProgress = true;

    logger.debug(`Worker ${process.pid} received ${signal}`);

    try {
      // Shutdown all resources
      for (const resource of resources) {
        await shutdownResource(resource);
      }

      // Close the HTTP server
      if (server) {
        await new Promise<void>(resolve => {
          server.close(() => {
            logger.debug(`Worker ${process.pid} server closed`);
            resolve();
          });
        });
      }

      // Notify master that shutdown is complete
      if (process.send) {
        process.send({ type: 'shutdown-complete' });
      }

      onComplete?.();
      process.exit(0);
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      logger.error(`Worker ${process.pid} shutdown error: ${err.message}`);

      if (process.send) {
        process.send({ type: 'shutdown-complete' });
      }

      process.exit(1);
    }
  };

  const handleMessage = async (msg: ClusterMessage): Promise<void> => {
    if (msg.type === 'shutdown' && !inProgress) {
      await shutdown('master-signal');
    }
  };

  const registerSignalHandlers = (): void => {
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('message', handleMessage);
  };

  return {
    get inProgress() {
      return inProgress;
    },
    shutdown,
    handleMessage,
    registerSignalHandlers
  };
}

export default createWorkerShutdownHandler;
