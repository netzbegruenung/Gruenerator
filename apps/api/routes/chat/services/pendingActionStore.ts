import { createLogger } from '../../../utils/logger.js';
import { parseJSON } from '../../../utils/parseJSON.js';
import redisClient from '../../../utils/redis/client.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('PendingActionStore');

const TTL_SECONDS = 5 * 60; // 5 minutes
const REDIS_PREFIX = 'pending_action:';

function key(threadId: string, actionId: string): string {
  return `${REDIS_PREFIX}${threadId}:${actionId}`;
}

export const pendingActionStore = {
  async store(action: PendingAction): Promise<void> {
    try {
      await redisClient.setEx(
        key(action.threadId, action.actionId),
        TTL_SECONDS,
        JSON.stringify(action)
      );
      log.info(
        `Stored pending action ${action.actionId} (${action.type}) for thread ${action.threadId}`
      );
    } catch (err) {
      log.error(`Failed to store pending action ${action.actionId}:`, { error: err });
    }
  },

  async get(threadId: string, actionId: string): Promise<PendingAction | null> {
    try {
      const raw = await redisClient.get(key(threadId, actionId));
      if (!raw) return null;
      return parseJSON<PendingAction>(raw);
    } catch (err) {
      log.error(`Failed to get pending action ${actionId}:`, { error: err });
      return null;
    }
  },

  async delete(threadId: string, actionId: string): Promise<void> {
    try {
      await redisClient.del(key(threadId, actionId));
    } catch (err) {
      log.error(`Failed to delete pending action ${actionId}:`, { error: err });
    }
  },
};
