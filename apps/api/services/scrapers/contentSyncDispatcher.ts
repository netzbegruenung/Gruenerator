/**
 * Starts the Content Sync workflow on GitHub by `workflow_dispatch` instead of
 * relying on its `schedule:` crons.
 *
 * GitHub throttles scheduled events on this repo: for weeks only ~5 of the 18
 * daily slots fired, at arbitrary hours (#2972, #3048). Dispatch events are not
 * throttled, so the API keeps the clock and GitHub only runs the jobs.
 *
 * Runs in every cluster worker; each slot is claimed once in Redis (SET NX), so
 * N workers and any number of restarts inside the window dispatch it once.
 * Enabled only where CONTENT_SYNC_DISPATCH_TOKEN is set — production, not test.
 */
import { env } from '../../config/env.js';
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';
import { ensureConnected, redisClient } from '../../utils/redis/client.js';

const log = createLogger('ContentSyncDispatcher');

export type ContentSyncMode = 'full' | 'hourly';

export interface ContentSyncSlot {
  mode: ContentSyncMode;
  start: Date;
}

// Same slots as the crons in .github/workflows/content-sync.yml (UTC).
const FULL_SLOT = { hour: 2, minute: 17 };
const HOURLY_MINUTE = 23;
const HOURLY_FIRST_HOUR = 4;
const HOURLY_LAST_HOUR = 20;

const SLOT_WINDOW_MS = 30 * 60 * 1000;
// Outlives the window, so a restart late in the window can't dispatch again.
const CLAIM_TTL_S = 60 * 60;
// After a failed dispatch the claim is shortened to this instead of deleted, so
// the whole cluster retries at most once per minute rather than once per worker.
const RETRY_AFTER_S = 60;
const REQUEST_TIMEOUT_MS = 15_000;

const DISPATCH_URL =
  'https://api.github.com/repos/netzbegruenung/Gruenerator/actions/workflows/content-sync.yml/dispatches';

function utcSlot(now: Date, hour: number, minute: number): Date {
  return new Date(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), hour, minute)
  );
}

/** The slot `now` falls into ([start, start + 30 min]), or null. */
export function dueContentSyncSlot(now: Date): ContentSyncSlot | null {
  const slots: ContentSyncSlot[] = [
    { mode: 'full', start: utcSlot(now, FULL_SLOT.hour, FULL_SLOT.minute) },
  ];
  for (let hour = HOURLY_FIRST_HOUR; hour <= HOURLY_LAST_HOUR; hour++) {
    slots.push({ mode: 'hourly', start: utcSlot(now, hour, HOURLY_MINUTE) });
  }
  const t = now.getTime();
  return (
    slots.find((slot) => t >= slot.start.getTime() && t - slot.start.getTime() <= SLOT_WINDOW_MS) ??
    null
  );
}

type ClaimStore = Pick<typeof redisClient, 'set'>;

/** Dispatches the slot due at `now`, if any and not yet claimed. */
export async function dispatchDueContentSync(
  now: Date,
  token: string,
  redis: ClaimStore
): Promise<void> {
  const slot = dueContentSyncSlot(now);
  if (!slot) return;

  const key = `content-sync:dispatch:${slot.start.toISOString()}`;
  const claimed = await redis.set(key, slot.mode, { NX: true, EX: CLAIM_TTL_S });
  if (!claimed) return;

  let failure: string;
  try {
    const res = await fetch(DISPATCH_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref: 'master', inputs: { mode: slot.mode } }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
    if (res.status === 204 || res.status === 200) {
      log.info(`Dispatched ${slot.mode} Content Sync for ${slot.start.toISOString()}`);
      return;
    }
    failure = `HTTP ${res.status}: ${(await res.text()).slice(0, 500)}`;
  } catch (err: unknown) {
    failure = err instanceof Error ? err.message : String(err);
  }

  log.error(
    `Dispatching ${slot.mode} Content Sync for ${slot.start.toISOString()} failed — ${failure}`
  );
  await redis.set(key, 'failed', { EX: RETRY_AFTER_S });
}

export function startContentSyncDispatcher(): void {
  const token = env.CONTENT_SYNC_DISPATCH_TOKEN;
  if (!token) {
    log.info('CONTENT_SYNC_DISPATCH_TOKEN not set — Content Sync is not dispatched from here');
    return;
  }
  createIntervalWorker({
    name: 'ContentSyncDispatcher',
    intervalMs: 60 * 1000,
    initialDelayMs: 20_000,
    tick: async () => {
      await ensureConnected();
      await dispatchDueContentSync(new Date(), token, redisClient);
    },
  }).start();
}
