/**
 * One running AI turn per chat thread. Several members may write into the same
 * team chat; a second send while a turn is still answering would interleave two
 * answers into one history. The lock is a Redis lease keyed by thread id,
 * acquired before the turn writes any row and released on every exit path.
 *
 * Fails open: a Redis outage returns a no-op lease so chatting keeps working
 * (the cost is losing the one-at-a-time guarantee, not the chat).
 */

import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { withTimeout } from '../../utils/withTimeout.js';

const log = createLogger('ThreadRunLock');

const KEY_PREFIX = 'chat:thread-run:';
/** Turn ceiling is 6 min; the margin covers a slow final persist. */
export const THREAD_RUN_TTL_MS = 7 * 60_000;
const REDIS_TIMEOUT_MS = 1_000;

const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export interface ThreadRunLease {
  /** Frees the lock if this lease still holds it. Never throws. */
  release(): Promise<void>;
}

const NOOP_LEASE: ThreadRunLease = { release: () => Promise.resolve() };

/** Resolves to `null` when another turn already runs in the thread. */
export async function acquireThreadRun(
  threadId: string,
  holder: string
): Promise<ThreadRunLease | null> {
  const key = KEY_PREFIX + threadId;
  try {
    if (!redisClient.isReady) throw new Error('Redis not ready');
    const got = await withTimeout(
      redisClient.set(key, holder, { NX: true, PX: THREAD_RUN_TTL_MS }),
      REDIS_TIMEOUT_MS,
      'thread run lock'
    );
    if (got === null) return null;
  } catch (err) {
    log.warn(`[ThreadRunLock] ${threadId}: lock unavailable, continuing without:`, err);
    return NOOP_LEASE;
  }

  let released = false;
  return {
    async release(): Promise<void> {
      if (released) return;
      released = true;
      try {
        await withTimeout(
          redisClient.eval(RELEASE_SCRIPT, { keys: [key], arguments: [holder] }),
          REDIS_TIMEOUT_MS,
          'thread run unlock'
        );
      } catch (err) {
        // The TTL frees it eventually.
        log.warn(`[ThreadRunLock] ${threadId}: release failed (TTL will free it):`, err);
      }
    },
  };
}
