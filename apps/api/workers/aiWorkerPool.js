import { Worker } from 'worker_threads';
import path from 'path';
import { fileURLToPath } from 'url';
import config from './worker.config.js';
import { PrivacyCounter } from '../services/counters/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class AIWorkerPool {
  constructor(numWorkers = config.worker.workersPerNode, redisClient = null) {
    this.workers = [];
    this.currentWorker = 0;
    this.pendingRequests = new Map();
    this.privacyCounter = redisClient ? new PrivacyCounter(redisClient) : null;

    for (let i = 0; i < numWorkers; i++) {
      this.createWorker(i);
    }
  }

  createWorker(index) {
    const worker = new Worker(path.join(__dirname, 'aiWorker.js'));

    worker.on('message', (message) => {
      this.handleWorkerMessage(index, message);
    });

    worker.on('error', (error) => {
      console.error(`Worker ${index} Fehler:`, error);
      this.handleWorkerFailure(index, error);
      this.replaceWorker(index);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${index} exited with code ${code}`);
        this.handleWorkerFailure(index, new Error(`Worker exited with code ${code}`));
        this.replaceWorker(index);
      }
    });

    this.workers[index] = {
      instance: worker,
      pendingRequests: new Set(),
      status: 'ready'
    };
  }

  handleWorkerMessage(workerIndex, message) {
    const { type, requestId, data, error } = message;

    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.warn(`[AIWorkerPool] Received response for unknown request ${requestId}`);
      return;
    }

    const { resolve, reject, timeout } = pendingRequest;

    if (type === 'response') {
      this.pendingRequests.delete(requestId);
      this.workers[workerIndex].pendingRequests.delete(requestId);
      clearTimeout(timeout);

      resolve({
        content: data.content,
        stop_reason: data.stop_reason,
        tool_calls: data.tool_calls,
        raw_content_blocks: data.raw_content_blocks,
        success: data.success,
        metadata: {
          ...data.metadata,
          workerIndex,
          requestId,
          processedAt: new Date().toISOString()
        }
      });
    }
    else if (type === 'progress') {
      // Progress updates removed for cleaner logs
    }
    else if (type === 'error') {
      this.pendingRequests.delete(requestId);
      this.workers[workerIndex].pendingRequests.delete(requestId);
      clearTimeout(timeout);

      console.error(`[AIWorkerPool] Error for request ${requestId}:`, error);
      reject(new Error(error));
    }
    else {
      console.warn(`[AIWorkerPool] Unknown message type: ${type}`);
      this.pendingRequests.delete(requestId);
      this.workers[workerIndex].pendingRequests.delete(requestId);
      clearTimeout(timeout);
      reject(new Error(`Unknown message type: ${type}`));
    }
  }

  handleWorkerFailure(workerIndex, error) {
    const worker = this.workers[workerIndex];
    if (!worker) return;

    for (const requestId of worker.pendingRequests) {
      const pendingRequest = this.pendingRequests.get(requestId);
      if (pendingRequest) {
        const { reject, timeout } = pendingRequest;
        clearTimeout(timeout);
        reject(new Error(`Worker ${workerIndex} failed: ${error.message}`));
        this.pendingRequests.delete(requestId);
      }
    }

    worker.pendingRequests.clear();
  }

  replaceWorker(index) {
    const oldWorker = this.workers[index]?.instance;
    if (oldWorker) {
      try {
        oldWorker.terminate();
      } catch (e) {
        console.warn(`Could not terminate worker ${index}:`, e);
      }
    }

    this.createWorker(index);
  }

  selectWorker() {
    const workerIndex = this.currentWorker;
    this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    return { workerIndex, worker: this.workers[workerIndex].instance };
  }

  async processRequest(data, req = null) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;

    let processedData = { ...data };

    if (data.usePrivacyMode && this.privacyCounter && req) {
      try {
        const userId = req.user?.id || req.sessionID;

        if (userId) {
          const privacyProvider = await this.privacyCounter.getProviderForUser(userId);
          processedData.provider = privacyProvider;
        } else {
          console.warn('[AIWorkerPool] Privacy mode enabled but no user ID found, using default provider');
        }
      } catch (error) {
        console.error('[AIWorkerPool] Privacy mode error:', error);
      }
    }

    return new Promise((resolve, reject) => {
      const { workerIndex, worker } = this.selectWorker();

      const timeout = setTimeout(() => {
        console.error(`[AIWorkerPool] Timeout for request ${requestId} after ${config.worker.requestTimeout}ms`);
        this.pendingRequests.delete(requestId);
        this.workers[workerIndex].pendingRequests.delete(requestId);
        reject(new Error(`Worker Timeout nach ${config.worker.requestTimeout}ms`));
      }, config.worker.requestTimeout);

      this.pendingRequests.set(requestId, { resolve, reject, timeout, workerIndex, startTime: Date.now() });
      this.workers[workerIndex].pendingRequests.add(requestId);

      const message = {
        type: 'request',
        requestId,
        data: processedData
      };

      worker.postMessage(message);
    });
  }

  shutdown() {
    for (const [requestId, { reject }] of this.pendingRequests.entries()) {
      reject(new Error('Worker pool shutting down'));
    }
    this.pendingRequests.clear();

    return Promise.all(this.workers.map(worker => worker.instance.terminate()));
  }
}

export default AIWorkerPool;
