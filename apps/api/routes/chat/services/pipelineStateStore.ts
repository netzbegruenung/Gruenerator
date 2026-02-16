import { createLogger } from '../../../utils/logger.js';

import type { ProcessedAttachmentMeta } from './attachmentProcessingService.js';
import type { ChatGraphState, ImageAttachment } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('PipelineStateStore');

const TTL_MS = 10 * 60 * 1000; // 10 minutes
const CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

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
  validMessages: unknown[];
  forcedTool: boolean;
  rawDocumentIds?: string[];
}

interface StoredPipelineState {
  classifiedState: ChatGraphState;
  requestContext: StoredRequestContext;
  createdAt: number;
}

const store = new Map<string, StoredPipelineState>();

const cleanupTimer = setInterval(() => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, value] of store) {
    if (now - value.createdAt > TTL_MS) {
      store.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    log.debug(`Cleaned ${cleaned} expired pipeline state(s), ${store.size} remaining`);
  }
}, CLEANUP_INTERVAL_MS);

// Don't block process exit
if (cleanupTimer.unref) cleanupTimer.unref();

export const pipelineStateStore = {
  store(threadId: string, data: Omit<StoredPipelineState, 'createdAt'>): void {
    store.set(threadId, { ...data, createdAt: Date.now() });
    log.info(`Stored pipeline state for thread ${threadId} (${store.size} total)`);
  },

  get(threadId: string): StoredPipelineState | undefined {
    const entry = store.get(threadId);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > TTL_MS) {
      store.delete(threadId);
      log.debug(`Pipeline state for thread ${threadId} expired`);
      return undefined;
    }
    return entry;
  },

  delete(threadId: string): void {
    store.delete(threadId);
  },

  get size(): number {
    return store.size;
  },
};
