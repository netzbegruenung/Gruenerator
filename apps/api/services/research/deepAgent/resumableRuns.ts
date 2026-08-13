/**
 * Continues a research whose process died, and clears out the ones nobody
 * will continue.
 *
 * Two things that only make sense together with `checkpointer.ts` and
 * `runRegistry.ts`, kept apart from both because they are the CONSUMER side:
 * the checkpointer writes state, the registry says which state belongs to
 * what, and this is the only thing that ever reads either back.
 *
 * ## Why resuming is not automatic
 *
 * A boot-time sweep that picks up every open run would be wrong in three ways
 * at once: production forks one process per core, so every worker would grab
 * the same threads; a research costs minutes of model time and a Linkup
 * allowance, so a restart loop would spend both; and nobody is watching the
 * chat that the run belonged to any more, so the result would arrive nowhere.
 *
 * So resuming is an explicit act — `pnpm --filter @gruenerator/api resume-research`
 * lists what is open and continues one thread by id. The retention sweep, by
 * contrast, IS automatic: it costs nothing, and unbounded growth is the failure
 * mode it exists to prevent.
 */

import { createLogger } from '../../../utils/logger.js';

import { listResumableRuns, purgeExpiredRuns, RETENTION_DAYS } from './runRegistry.js';

const log = createLogger('DeepResearchResume');

/** Same cadence as the other cleanup services; retention is measured in days. */
const SWEEP_INTERVAL_MS = 6 * 60 * 60 * 1000;

let intervalId: ReturnType<typeof setInterval> | null = null;

/**
 * Starts the retention sweep.
 *
 * Called from `server.ts` next to the other cleanup schedulers, which means the
 * MASTER process in production — one sweeper, not one per worker. The first
 * pass is delayed rather than run at boot: a deploy restarts every instance at
 * once, and a synchronised DELETE storm across them is the one moment the
 * database least needs it.
 */
export function startDeepResearchCleanup(): void {
  if (intervalId) return;
  intervalId = setInterval(() => {
    void purgeExpiredRuns().catch((error: unknown) => {
      log.warn(`[Cleanup] Durchlauf fehlgeschlagen: ${String(error)}`);
    });
  }, SWEEP_INTERVAL_MS);
  if (typeof intervalId.unref === 'function') intervalId.unref();
  log.info(
    `Deep-Research-Aufräumen gestartet (alle ${SWEEP_INTERVAL_MS / 3600000} h, Frist ${RETENTION_DAYS} d)`
  );
}

export function stopDeepResearchCleanup(): void {
  if (!intervalId) return;
  clearInterval(intervalId);
  intervalId = null;
}

/** What the resume script prints — one line per continuable research. */
export async function describeResumableRuns(): Promise<string[]> {
  const runs = await listResumableRuns();
  return runs.map((r) => {
    const age = Math.round((Date.now() - new Date(r.started_at).getTime()) / 60_000);
    return `${r.thread_id}  ${age} min alt  ${r.question.slice(0, 80)}`;
  });
}
