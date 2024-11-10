const { Worker } = require('worker_threads');
const path = require('path');

class AIRequestManager {
  constructor(maxWorkers = 3) {
    this.workers = [];
    this.maxWorkers = maxWorkers;
    this.requestQueue = [];
    this.activeRequests = 0;
  }

  async processRequest(requestData) {
    return new Promise((resolve, reject) => {
      const handleRequest = () => {
        if (this.activeRequests >= this.maxWorkers) {
          this.requestQueue.push({ requestData, resolve, reject });
          return;
        }

        this.activeRequests++;
        const worker = new Worker(path.join(__dirname, '../workers/aiWorker.js'));

        worker.on('message', (result) => {
          this.activeRequests--;
          worker.terminate();
          resolve(result);
          this.processNextRequest();
        });

        worker.on('error', (error) => {
          this.activeRequests--;
          worker.terminate();
          reject(error);
          this.processNextRequest();
        });

        worker.postMessage(requestData);
      };

      handleRequest();
    });
  }

  processNextRequest() {
    if (this.requestQueue.length > 0 && this.activeRequests < this.maxWorkers) {
      const { requestData, resolve, reject } = this.requestQueue.shift();
      this.processRequest(requestData).then(resolve).catch(reject);
    }
  }
}

module.exports = new AIRequestManager();