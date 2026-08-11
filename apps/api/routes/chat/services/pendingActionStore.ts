import { createLogger } from '../../../utils/logger.js';
import { parseJSON } from '../../../utils/parseJSON.js';
import redisClient from '../../../utils/redis/client.js';

import type { PendingAction } from '../../../agents/langgraph/ChatGraph/types.js';

const log = createLogger('PendingActionStore');

const TTL_SECONDS = 5 * 60; // 5 minutes
const REDIS_PREFIX = 'pending_action:';

/**
 * How long one execution may hold the claim. Long enough for the slowest
 * action (document generation + Yjs write), short enough that a process that
 * dies mid-execution does not wedge the card for the rest of the TTL.
 */
const CLAIM_TTL_SECONDS = 120;

function key(threadId: string, actionId: string): string {
  return `${REDIS_PREFIX}${threadId}:${actionId}`;
}

function claimKey(threadId: string, actionId: string): string {
  return `${key(threadId, actionId)}:claim`;
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
      log.error(`Failed to store pending action ${action.actionId}:`, err);
    }
  },

  async get(threadId: string, actionId: string): Promise<PendingAction | null> {
    try {
      const raw = await redisClient.get(key(threadId, actionId));
      if (!raw) return null;
      return parseJSON<PendingAction>(raw);
    } catch (err) {
      log.error(`Failed to get pending action ${actionId}:`, err);
      return null;
    }
  },

  /**
   * Take exclusive ownership of an action before executing it. Returns false
   * when someone else already holds it.
   *
   * The action row itself cannot be the lock: it must survive a failed
   * execution so the card's "erneut versuchen" still has something to retry.
   * That leaves a window between reading the action and finishing the side
   * effect in which a second confirm — another tab, another device, a double
   * tap — would execute the same action again, and most action types have no
   * dedupe of their own (`share_doc` does; `save_as_doc` would simply create a
   * second document). SET NX is the atomic claim that closes it.
   */
  async claim(threadId: string, actionId: string): Promise<boolean> {
    try {
      const res = await redisClient.set(claimKey(threadId, actionId), '1', {
        condition: 'NX',
        expiration: { type: 'EX', value: CLAIM_TTL_SECONDS },
      });
      return res === 'OK';
    } catch (err) {
      // Fail closed: without a working claim we cannot promise single
      // execution, and refusing is the recoverable half of that trade.
      log.error(`Failed to claim pending action ${actionId}:`, err);
      return false;
    }
  },

  /** Hand the action back after a failed execution so a retry can claim it. */
  async releaseClaim(threadId: string, actionId: string): Promise<void> {
    try {
      await redisClient.del(claimKey(threadId, actionId));
    } catch (err) {
      log.error(`Failed to release claim for pending action ${actionId}:`, err);
    }
  },

  async delete(threadId: string, actionId: string): Promise<void> {
    try {
      await redisClient.del([key(threadId, actionId), claimKey(threadId, actionId)]);
    } catch (err) {
      log.error(`Failed to delete pending action ${actionId}:`, err);
    }
  },
};
