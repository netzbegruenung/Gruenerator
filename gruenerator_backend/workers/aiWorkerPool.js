const { Worker } = require('worker_threads');
const path = require('path');
const config = require('./worker.config');

class AIWorkerPool {
  constructor(numWorkers = config.worker.workersPerNode) {
    this.workers = [];
    this.currentWorker = 0;
    
    for (let i = 0; i < numWorkers; i++) {
      this.createWorker(i);
    }
  }

  createWorker(index) {
    const worker = new Worker(path.join(__dirname, 'aiWorker.js'));
    
    worker.on('error', (error) => {
      console.error(`Worker ${index} Fehler:`, error);
      this.replaceWorker(index);
    });

    worker.on('exit', (code) => {
      if (code !== 0) {
        console.error(`Worker ${index} exited with code ${code}`);
        this.replaceWorker(index);
      }
    });

    this.workers[index] = worker;
  }

  replaceWorker(index) {
    const oldWorker = this.workers[index];
    oldWorker.terminate();
    
    const newWorker = new Worker(path.join(__dirname, 'aiWorker.js'));
    newWorker.on('error', (error) => {
      console.error(`Worker ${index} Fehler:`, error);
      this.replaceWorker(index);
    });
    
    this.workers[index] = newWorker;
  }

  async processRequest(data) {
    return new Promise((resolve, reject) => {
      const worker = this.workers[this.currentWorker];
      this.currentWorker = (this.currentWorker + 1) % this.workers.length;

      const timeout = setTimeout(() => {
        reject(new Error('Worker Timeout nach ' + config.worker.requestTimeout + 'ms'));
      }, config.worker.requestTimeout);

      worker.postMessage(data);

      worker.once('message', (result) => {
        clearTimeout(timeout);
        if (result.success) {
          resolve(result);
        } else {
          reject(new Error(result.error));
        }
      });
    });
  }

  shutdown() {
    return Promise.all(this.workers.map(worker => worker.terminate()));
  }
}

module.exports = AIWorkerPool;