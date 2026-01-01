/**
 * Memory Storage
 * In-memory storage adapter for Crawlee to avoid persistence issues
 */

export class MemoryStorage {
  private data: Map<string, any>;
  private queues: Map<string, any[]>;

  constructor() {
    this.data = new Map();
    this.queues = new Map();
  }

  async getValue(key: string): Promise<any> {
    return this.data.get(key) || null;
  }

  async setValue(key: string, value: any): Promise<void> {
    this.data.set(key, value);
  }

  async deleteValue(key: string): Promise<void> {
    this.data.delete(key);
  }

  async clear(): Promise<void> {
    this.data.clear();
    this.queues.clear();
  }

  // Queue-specific methods
  async addRequest(queueId: string, request: any): Promise<void> {
    if (!this.queues.has(queueId)) {
      this.queues.set(queueId, []);
    }
    this.queues.get(queueId)!.push(request);
  }

  async getRequest(queueId: string): Promise<any> {
    const queue = this.queues.get(queueId);
    return queue && queue.length > 0 ? queue.shift() : null;
  }

  async isEmpty(queueId: string): Promise<boolean> {
    const queue = this.queues.get(queueId);
    return !queue || queue.length === 0;
  }
}
