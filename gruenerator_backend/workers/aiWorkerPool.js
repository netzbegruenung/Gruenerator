const { Worker } = require('worker_threads');
const path = require('path');
const config = require('./worker.config');
const PrivacyCounter = require('../utils/privacyCounter');

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
    
    // Unified message handler for all responses
    worker.on('message', (message) => {
      this.handleWorkerMessage(index, message);
    });
    
    worker.on('error', (error) => {
      console.error(`Worker ${index} Fehler:`, error);
      // Handle all pending requests from this worker with an error
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
    
    console.log(`[AIWorkerPool] Received ${type} from worker ${workerIndex} for request ${requestId}`);
    
    const pendingRequest = this.pendingRequests.get(requestId);
    if (!pendingRequest) {
      console.warn(`[AIWorkerPool] Received response for unknown request ${requestId}`);
      return;
    }
    
    const { resolve, reject, timeout } = pendingRequest;
    
    if (type === 'response') {
      // Remove from pending and clear timeout
      this.pendingRequests.delete(requestId);
      this.workers[workerIndex].pendingRequests.delete(requestId);
      clearTimeout(timeout);
      
      console.log(`[AIWorkerPool] Successful response for request ${requestId} (${data.content?.length || 0} chars)`);
      // Optional: log full response payload for testing
      try {
        const cfg = require('./worker.config');
        if (cfg?.logging?.fullResponses) {
          // Avoid blowing up logs if content is huge: still print full object as requested
          console.log(`[AIWorkerPool][FullResponse ${requestId}]`, JSON.stringify(data, null, 2));
        }
      } catch (_) {}
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
      // Only log critical milestones if needed
    }
    else if (type === 'error') {
      // Remove from pending and clear timeout
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
    
    // Reject all pending requests for this worker
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
    // Basic round-robin selection
    const workerIndex = this.currentWorker;
    this.currentWorker = (this.currentWorker + 1) % this.workers.length;
    return { workerIndex, worker: this.workers[workerIndex].instance };
  }

  async processRequest(data, req = null) {
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
    
    // Handle privacy mode provider selection
    let processedData = { ...data };
    
    if (data.usePrivacyMode && this.privacyCounter && req) {
      try {
        // Get user ID from request (prioritize user.id, fallback to sessionID)
        const userId = req.user?.id || req.sessionID;
        
        if (userId) {
          // Get provider based on request count
          const privacyProvider = await this.privacyCounter.getProviderForUser(userId);
          
          // Override any existing provider selection for privacy mode
          processedData.provider = privacyProvider;
          
          console.log(`[AIWorkerPool] Privacy mode: User ${userId} routed to ${privacyProvider}`);
        } else {
          console.warn('[AIWorkerPool] Privacy mode enabled but no user ID found, using default provider');
        }
      } catch (error) {
        console.error('[AIWorkerPool] Privacy mode error:', error);
        // Continue with original data on error
      }
    }
    
    console.log(`[AIWorkerPool] Processing request ${requestId}:`, {
      type: processedData.type,
      usePrivacyMode: processedData.usePrivacyMode,
      useBedrock: processedData.useBedrock,
      provider: processedData.provider || 'default'
    });

    return new Promise((resolve, reject) => {
      const { workerIndex, worker } = this.selectWorker();
      
      // Setup timeout before sending
      const timeout = setTimeout(() => {
        console.error(`[AIWorkerPool] Timeout for request ${requestId} after ${config.worker.requestTimeout}ms`);
        this.pendingRequests.delete(requestId);
        this.workers[workerIndex].pendingRequests.delete(requestId);
        reject(new Error(`Worker Timeout nach ${config.worker.requestTimeout}ms`));
      }, config.worker.requestTimeout);
      
      // Store the promise resolvers
      this.pendingRequests.set(requestId, { resolve, reject, timeout, workerIndex, startTime: Date.now() });
      this.workers[workerIndex].pendingRequests.add(requestId);
      
      // Send the message to the worker with request ID
      const message = {
        type: 'request',
        requestId,
        data: processedData
      };
      
      worker.postMessage(message);
    });
  }

  shutdown() {
    // Reject all pending requests
    for (const [requestId, { reject }] of this.pendingRequests.entries()) {
      reject(new Error('Worker pool shutting down'));
    }
    this.pendingRequests.clear();
    
    // Terminate all workers
    return Promise.all(this.workers.map(worker => worker.instance.terminate()));
  }
}

module.exports = AIWorkerPool;
