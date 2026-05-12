import { createLogger } from '../../../utils/logger.js';
import { parseJSON } from '../../../utils/parseJSON.js';
import redisClient from '../../../utils/redis/client.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { ChatGraphState, ImageAttachment } from '../../../agents/langgraph/ChatGraph/types.js';
import type { ModelMessage } from 'ai';

const log = createLogger('PipelineStateStore');

const TTL_SECONDS = 10 * 60; // 10 minutes
const REDIS_PREFIX = 'pipeline_state:';

export interface StoredRequestContext {
  userId: string;
  agentId: string;
  enabledTools: Record<string, boolean>;
  modelId?: string;
  actualThreadId?: string;
  isNewThread: boolean;
  processedMeta: ProcessedAttachmentMeta[];
  imageAttachments: ImageAttachment[];
  memoryContext: string | null;
  memoryRetrieveTimeMs: number;
  validMessages: ModelMessage[];
  forcedTool: boolean;
  rawDocumentIds?: string[];
}

interface StoredPipelineState {
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  createdAt: number;
}

export const pipelineStateStore = {
  async store(threadId: string, data: Omit<StoredPipelineState, 'createdAt'>): Promise<void> {
    const entry: StoredPipelineState = { ...data, createdAt: Date.now() };
    try {
      await redisClient.setEx(REDIS_PREFIX + threadId, TTL_SECONDS, JSON.stringify(entry));
      log.info(`Stored pipeline state for thread ${threadId}`);
    } catch (err) {
      log.error(`Failed to store pipeline state for thread ${threadId}:`, { error: err });
    }
  },

  async get(threadId: string): Promise<StoredPipelineState | undefined> {
    try {
      const raw = await redisClient.get(REDIS_PREFIX + threadId);
      if (!raw) return undefined;
      return parseJSON<StoredPipelineState>(raw);
    } catch (err) {
      log.error(`Failed to get pipeline state for thread ${threadId}:`, { error: err });
      return undefined;
    }
  },

  async delete(threadId: string): Promise<void> {
    try {
      await redisClient.del(REDIS_PREFIX + threadId);
    } catch (err) {
      log.error(`Failed to delete pipeline state for thread ${threadId}:`, { error: err });
    }
  },
};
