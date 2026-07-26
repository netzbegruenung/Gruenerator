/**
 * Verdigado Provider Slot
 *
 * Verdigado's LiteLLM gateway is single-slot (one in-flight chat completion at a
 * time, backed by Ollama on a single GPU). This module provides a Redis try-lock
 * so concurrent chat requests on the GPT-OSS / Gemma 4 lanes deterministically
 * route the FIRST request to Verdigado and OVERFLOW subsequent concurrent
 * requests to Regolo until the slot frees.
 *
 * Cluster-safe: SET NX EX is atomic across worker processes.
 * Crash-safe: 60s TTL means a crashed worker's lock auto-expires.
 * Release-safe: Lua DEL-if-equal prevents releasing a different request's lock
 * after our own TTL expired.
 */
import { createLogger } from '../../utils/logger.js';
import { redisClient } from '../../utils/redis/client.js';

const log = createLogger('VerdigadoSlot');

const LOCK_KEY = 'provider_lock:verdigado';
const LOCK_TTL_SECONDS = 60;

const RELEASE_SCRIPT = `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
else
  return 0
end
`;

export async function tryAcquireVerdigadoSlot(requestId: string): Promise<boolean> {
  // Without this guard an unreachable Redis doesn't reject — node-redis queues
  // the SET and retries reconnecting forever, hanging every overflow-lane
  // request (and the CI test run, which has no Redis).
  if (!redisClient.isReady) {
    log.warn('Redis not ready; falling through to overflow provider');
    return false;
  }
  try {
    const result = await redisClient.set(LOCK_KEY, requestId, {
      NX: true,
      EX: LOCK_TTL_SECONDS,
    });
    return result === 'OK';
  } catch (err) {
    log.warn(
      `Redis SET NX failed; falling through to overflow provider: ${err instanceof Error ? err.message : String(err)}`
    );
    return false;
  }
}

export async function releaseVerdigadoSlot(requestId: string): Promise<void> {
  if (!redisClient.isReady) return;
  try {
    await redisClient.eval(RELEASE_SCRIPT, {
      keys: [LOCK_KEY],
      arguments: [requestId],
    });
  } catch (err) {
    log.warn(
      `Verdigado slot release failed (lock will auto-expire in ${LOCK_TTL_SECONDS}s): ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
