/**
 * Redis-backed Checkpointer for LangGraph
 *
 * Enables cross-worker checkpoint persistence for cluster deployments.
 * Implements BaseCheckpointSaver interface from @langchain/langgraph.
 */

import { BaseCheckpointSaver } from '@langchain/langgraph';

import { createLogger } from '../../utils/logger.js';

import type { RedisClientType } from 'redis';

const log = createLogger('Checkpointer');
const CHECKPOINT_TTL = 7200; // 2 hours to match session TTL

/**
 * Redis-backed checkpoint saver for LangGraph state persistence
 * Stores checkpoints, metadata, and pending writes in Redis with TTL
 */
export class RedisCheckpointer extends BaseCheckpointSaver {
  private client: RedisClientType;

  constructor(redisClient: RedisClientType) {
    super();
    this.client = redisClient;
    log.debug(`Initialized (TTL=${CHECKPOINT_TTL}s)`);
  }

  /**
   * JSON replacer function to filter out circular references and non-serializable objects
   * This is used during JSON.stringify to skip problematic values
   */
  private _createReplacer(): (key: string, value: unknown) => unknown {
    const seen = new WeakSet();
    const nonSerializableTypes = [
      'IncomingMessage',
      'ServerResponse',
      'Socket',
      'Server',
      'TLSSocket',
      'HTTPParser',
      'ReadableState',
      'WritableState',
    ];

    return (key: string, value: unknown): unknown => {
      // Skip known problematic keys
      if (key === 'req' || key === 'res') {
        return undefined;
      }

      // Handle null/undefined
      if (value === null || value === undefined) {
        return value;
      }

      // Handle primitives
      if (typeof value !== 'object') {
        return value;
      }

      // Detect circular references
      if (seen.has(value)) {
        return undefined;
      }

      // Check for non-serializable object types
      if (
        (value as Record<string, unknown>).constructor &&
        nonSerializableTypes.includes((value as Record<string, unknown>).constructor.name)
      ) {
        return undefined;
      }

      // Track this object to detect circular refs
      if (typeof value === 'object' && value !== null) {
        seen.add(value);
      }

      return value;
    };
  }

  /**
   * Generate Redis key for checkpoint data
   */
  private _getCheckpointKey(threadId: string, checkpointNs: string = ''): string {
    return `langgraph:checkpoint:${threadId}:${checkpointNs}`;
  }

  /**
   * Generate Redis key for checkpoint metadata
   */
  private _getMetadataKey(threadId: string, checkpointNs: string = ''): string {
    return `langgraph:metadata:${threadId}:${checkpointNs}`;
  }

  /**
   * Generate Redis key for pending writes
   */
  private _getWritesKey(threadId: string, checkpointNs: string = ''): string {
    return `langgraph:writes:${threadId}:${checkpointNs}`;
  }

  /**
   * Retrieve a checkpoint tuple for given configuration
   * Required by BaseCheckpointSaver interface
   */
  async getTuple(config: any): Promise<any> {
    const threadId = config?.configurable?.thread_id as string | undefined;
    const checkpointNs = (config?.configurable?.checkpoint_ns as string | undefined) || '';

    if (!threadId) return undefined;

    try {
      const checkpointKey = this._getCheckpointKey(threadId, checkpointNs);
      const metadataKey = this._getMetadataKey(threadId, checkpointNs);
      const writesKey = this._getWritesKey(threadId, checkpointNs);

      const [checkpointData, metadataData, writesData] = await Promise.all([
        this.client.get(checkpointKey),
        this.client.get(metadataKey),
        this.client.get(writesKey),
      ]);

      if (!checkpointData) return undefined;

      const checkpoint = JSON.parse(checkpointData as string);
      const metadata = metadataData ? JSON.parse(metadataData as string) : {};
      const pendingWrites = writesData ? JSON.parse(writesData as string) : [];

      return { config, checkpoint, metadata, pendingWrites };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug(`getTuple error for ${threadId}: ${errorMessage}`);
      return undefined;
    }
  }

  /**
   * Store a checkpoint with configuration and metadata
   * Required by BaseCheckpointSaver interface
   */
  async put(config: any, checkpoint: any, metadata: any): Promise<any> {
    const threadId = config?.configurable?.thread_id as string | undefined;
    const checkpointNs = (config?.configurable?.checkpoint_ns as string | undefined) || '';

    if (!threadId) return config;

    try {
      const checkpointKey = this._getCheckpointKey(threadId, checkpointNs);
      const metadataKey = this._getMetadataKey(threadId, checkpointNs);
      const replacer = this._createReplacer();

      await Promise.all([
        this.client.setEx(checkpointKey, CHECKPOINT_TTL, JSON.stringify(checkpoint, replacer)),
        this.client.setEx(
          metadataKey,
          CHECKPOINT_TTL,
          JSON.stringify(metadata || {}, this._createReplacer())
        ),
      ]);

      return config;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug(`put error for ${threadId}: ${errorMessage}`);
      return config;
    }
  }

  /**
   * Store intermediate writes (pending writes) linked to checkpoint
   * Required by BaseCheckpointSaver interface
   */
  async putWrites(config: any, writes: any[], taskId: string): Promise<void> {
    const threadId = config?.configurable?.thread_id as string | undefined;
    const checkpointNs = (config?.configurable?.checkpoint_ns as string | undefined) || '';

    if (!threadId) return;

    try {
      const writesKey = this._getWritesKey(threadId, checkpointNs);
      const existingData = await this.client.get(writesKey);
      const existingWrites = existingData ? JSON.parse(existingData as string) : [];
      const allWrites = [...existingWrites, ...writes];

      await this.client.setEx(
        writesKey,
        CHECKPOINT_TTL,
        JSON.stringify(allWrites, this._createReplacer())
      );
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug(`putWrites error for ${threadId}: ${errorMessage}`);
    }
  }

  /**
   * List checkpoints matching configuration and filter criteria
   * Required by BaseCheckpointSaver interface
   */
  async *list(config: any, filter: any = {}): AsyncGenerator<any> {
    const threadId = config?.configurable?.thread_id;
    if (!threadId) return;

    try {
      const pattern = `langgraph:checkpoint:${threadId}:*`;
      const keys: string[] = [];

      let cursor = 0;
      do {
        const result = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
        cursor = result.cursor as any;
        keys.push(...result.keys);
      } while (cursor !== 0);

      for (const key of keys) {
        const checkpointData = await this.client.get(key);
        if (checkpointData) {
          const checkpoint = JSON.parse(checkpointData as string);
          yield { config, checkpoint, metadata: {}, pendingWrites: [] };
        }
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug(`list error for ${threadId}: ${errorMessage}`);
    }
  }

  /**
   * Delete all checkpoints and writes for a thread
   * Optional method for cleanup
   */
  async deleteThread(threadId: string): Promise<void> {
    try {
      const patterns = [
        `langgraph:checkpoint:${threadId}:*`,
        `langgraph:metadata:${threadId}:*`,
        `langgraph:writes:${threadId}:*`,
      ];

      for (const pattern of patterns) {
        let cursor = 0;
        do {
          const result = await this.client.scan(cursor as any, { MATCH: pattern, COUNT: 100 });
          cursor = result.cursor as any;
          if (result.keys.length > 0) await this.client.del(result.keys);
        } while (cursor !== 0);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log.debug(`deleteThread error for ${threadId}: ${errorMessage}`);
    }
  }
}
