/**
 * Mem0 Extraction Throttle
 *
 * mem0's extraction pipeline is purely additive (see mem0ai/oss's
 * ADDITIVE_EXTRACTION_PROMPT — every call adds new rows, it never merges).
 * Running the gatekeeper + extraction on every single turn is the main
 * driver of unbounded memory growth. OpenWebUI reviews every 10 user turns;
 * LobeHub extracts once per topic. This throttles the same way: at most
 * once every EXTRACTION_INTERVAL_TURNS turns per thread.
 */

import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/index.js';

const log = createLogger('Mem0ExtractionThrottle');

const EXTRACTION_INTERVAL_TURNS = 3;
// Bounds key growth for abandoned threads; unrelated to any conversation TTL.
const THROTTLE_KEY_TTL_SECONDS = 30 * 24 * 60 * 60;

function throttleKey(threadId: string): string {
  return `mem0:extraction-turns:${threadId}`;
}

/**
 * Returns true if this turn should run the memory gatekeeper/extraction.
 * Increments a per-thread turn counter and only allows extraction every
 * EXTRACTION_INTERVAL_TURNS-th turn.
 */
export async function shouldAttemptExtractionThisTurn(threadId: string): Promise<boolean> {
  // isReady guard, not just try/catch: against an unreachable Redis,
  // node-redis queues the command and reconnects forever instead of
  // rejecting, so a bare await here would hang the whole background memory
  // job rather than fail into the catch block. See
  // apps/api/services/providers/verdigadoSlot.ts for the same pattern.
  if (!redisClient.isReady) {
    log.warn('[Mem0ExtractionThrottle] Redis not ready, allowing extraction this turn');
    return true;
  }

  try {
    const count = await redisClient.incr(throttleKey(threadId));
    if (count === 1) {
      await redisClient.expire(throttleKey(threadId), THROTTLE_KEY_TTL_SECONDS);
    }
    return count % EXTRACTION_INTERVAL_TURNS === 0;
  } catch (error) {
    log.warn('[Mem0ExtractionThrottle] Redis error, allowing extraction this turn:', error);
    return true;
  }
}
