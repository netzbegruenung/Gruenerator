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

/**
 * Atomic acquire. ARGV: holder, user id, ttl. A free key is taken; a key held by
 * the SAME user is taken over (her own stale turn — a crashed worker or a
 * dropped stream must not lock her out of her own chat for the full TTL); a key
 * held by anybody else is refused. The holder is stored as `<userId>:<holder>`.
 */
const ACQUIRE_SCRIPT = `
if redis.call('set', KEYS[1], ARGV[1], 'NX', 'PX', ARGV[3]) then return 1 end
local cur = redis.call('get', KEYS[1])
if cur and string.sub(cur, 1, string.len(ARGV[2]) + 1) == ARGV[2] .. ':' then
  redis.call('set', KEYS[1], ARGV[1], 'PX', ARGV[3])
  return 1
end
return 0`;

const RELEASE_SCRIPT = `if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end`;

export interface ThreadRunLease {
  /** Frees the lock if this lease still holds it. Never throws. */
  release(): Promise<void>;
}

const NOOP_LEASE: ThreadRunLease = { release: () => Promise.resolve() };

/**
 * Resolves to `null` when a turn of ANOTHER user already runs in the thread.
 * A turn of the same user is taken over (see ACQUIRE_SCRIPT).
 */
export async function acquireThreadRun(
  threadId: string,
  userId: string,
  holderId: string
): Promise<ThreadRunLease | null> {
  const key = KEY_PREFIX + threadId;
  const holder = `${userId}:${holderId}`;
  try {
    if (!redisClient.isReady) throw new Error('Redis not ready');
    const got = await withTimeout(
      redisClient.eval(ACQUIRE_SCRIPT, {
        keys: [key],
        arguments: [holder, userId, String(THREAD_RUN_TTL_MS)],
      }),
      REDIS_TIMEOUT_MS,
      'thread run lock'
    );
    if (Number(got) !== 1) return null;
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
