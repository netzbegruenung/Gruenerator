/**
 * Resumable chat streams: every SSE byte of a turn is teed into Redis (keyed by
 * the turn's placeholder assistant row id), so a client that reloads or loses
 * its connection can re-attach and replay the turn from byte 0 while it is
 * still running.
 *
 * The live response is still written straight to `res` — the store is only a
 * second sink. `ctx.run()` from assistant-stream would route the producer's own
 * response through the store as well, putting Redis and a 100 ms poll on every
 * live token; the context here is used for `resume`/`status`/`delete` only.
 */

import {
  createResumableStreamContext,
  type ResumableStreamStore,
} from 'assistant-stream/resumable';
import {
  createRedisResumableStreamStore,
  type NodeRedisLike,
} from 'assistant-stream/resumable/redis';

import { createLogger } from '../../utils/logger.js';
import redisClient from '../../utils/redis/client.js';
import { withTimeout } from '../../utils/withTimeout.js';

const log = createLogger('ResumableStreams');

/**
 * Above the turn ceiling (6 min) — every append refreshes it, so only a
 * producer that died mid-turn lets a stream expire. Until then a crashed turn
 * still reads as `streaming`; its readers end when the keys expire.
 */
export const STREAM_TTL_MS = 10 * 60_000;

// assistant-stream declares node-redis ^5 as its peer; we run 6.x. The adapter
// is structural and every call it makes (SET NX EX, sendCommand with
// typeMapping, multi().execAsPipeline) still exists in v6 — but v6's overloaded
// generics don't line up with `NodeRedisLike`, hence the boundary cast.
const createStore = (): ResumableStreamStore =>
  createRedisResumableStreamStore(redisClient as unknown as NodeRedisLike, {
    keyPrefix: 'chat:stream',
    defaultTtlMs: STREAM_TTL_MS,
  });

// Readers only (status / resume / delete). Producers get their own store per
// turn: the Redis store remembers every lease it hands out in a Map that only
// `delete()` clears, so one long-lived producer store would grow per turn.
const store = createStore();

const context = createResumableStreamContext({
  store,
  ttlMs: STREAM_TTL_MS,
  onError: (streamId, error) => log.warn(`[ResumableStreams] ${streamId}:`, error),
});

/**
 * Redis calls on a request path. node-redis queues commands while it is
 * disconnected, so without this a Redis outage would hang every chat turn and
 * every history load instead of just making turns non-resumable.
 */
const REDIS_TIMEOUT_MS = 1_000;
function guarded<T>(label: string, call: () => Promise<T>): Promise<T> {
  if (!redisClient.isReady) return Promise.reject(new Error('Redis not ready'));
  return withTimeout(call(), REDIS_TIMEOUT_MS, label);
}

export const resumableStreams = {
  status: (streamId: string) => guarded('stream status', () => context.status(streamId)),
  /** The turn replayed from its first byte, then tailed until it finishes. */
  resume: (streamId: string) => guarded('stream resume', () => context.resume(streamId)),
  delete: (streamId: string) => guarded('stream delete', () => context.delete(streamId)),
};

export interface StreamRecorder {
  /** Queue SSE bytes for the store. Never throws, never blocks the caller. */
  record(frame: string): void;
  /** Flush what is queued, then mark the stream finished. */
  finish(): Promise<void>;
}

/**
 * Start recording a turn under `streamId`. Returns null when the stream can't
 * be acquired (Redis down, id already taken) — the turn then simply isn't
 * resumable, it runs exactly as before.
 *
 * Appends are serialized and coalesced: while one XADD is in flight, further
 * frames pile up and go out as one chunk. `onCancelled` fires once when an
 * append finds the stream deleted — that is how a cancel from another worker
 * reaches the producer.
 */
export async function startStreamRecorder(
  streamId: string,
  opts: { onCancelled?: () => void; store?: ResumableStreamStore } = {}
): Promise<StreamRecorder | null> {
  const target = opts.store ?? createStore();
  if (!opts.store && !redisClient.isReady) return null;
  let lease;
  try {
    const acquisition = await withTimeout(
      target.acquireLease!(streamId, { ttlMs: STREAM_TTL_MS }),
      REDIS_TIMEOUT_MS,
      'stream acquire'
    );
    if (acquisition.role !== 'producer') return null;
    lease = acquisition.lease;
  } catch (err) {
    log.warn(`[ResumableStreams] acquire failed for ${streamId} (turn not resumable):`, err);
    return null;
  }

  const encoder = new TextEncoder();
  let queued = '';
  let inFlight: Promise<void> | null = null;
  let stopped = false;
  let cancelled = false;
  let finished = false;

  const pump = async (): Promise<void> => {
    while (queued && !stopped) {
      const chunk = queued;
      queued = '';
      try {
        await target.append(streamId, encoder.encode(chunk), lease);
      } catch (err) {
        stopped = true;
        const status = await target.status(streamId).catch(() => null);
        if (status === 'missing') {
          cancelled = true;
          log.info(`[ResumableStreams] ${streamId} was cancelled`);
          opts.onCancelled?.();
        } else {
          log.warn(`[ResumableStreams] append failed for ${streamId}, recording stops:`, err);
        }
      }
    }
    inFlight = null;
  };

  return {
    record(frame) {
      if (stopped || finished) return;
      queued += frame;
      inFlight ??= pump();
    },
    async finish() {
      if (finished) return;
      finished = true;
      await inFlight;
      if (cancelled) return;
      // A failed append leaves a gap in the stored bytes: mark the stream
      // failed so a reader ends instead of tailing it until the TTL.
      const status = stopped ? 'error' : 'done';
      const error = stopped ? 'recording incomplete' : undefined;
      await target.finalize(streamId, status, error, lease).catch((err: unknown) => {
        log.warn(`[ResumableStreams] finalize failed for ${streamId}:`, err);
      });
    },
  };
}
