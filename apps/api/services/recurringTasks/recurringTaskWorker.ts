/**
 * EXPERIMENTAL — background poller that fires due recurring tasks (recurring_tasks).
 *
 * Built on the shared createIntervalWorker. Each tick claims due tasks
 * (FOR UPDATE SKIP LOCKED → cluster-safe, advances next_run_at in the txn) and runs
 * each through recurringTaskRunner. Unlike the board schedule worker there is no
 * separate queue: the runner executes the agent + delivers inline. Started from
 * server.ts.
 */
import { createIntervalWorker } from '../../utils/intervalWorker.js';
import { createLogger } from '../../utils/logger.js';

import { runRecurringTask } from './recurringTaskRunner.js';
import { claimDueRecurringTasks, sweepStaleRecurringRuns } from './recurringTasksRepository.js';

const log = createLogger('RecurringTaskWorker');

const CHECK_INTERVAL_MS = 60 * 1000; // every minute

const worker = createIntervalWorker({
  name: 'RecurringTaskWorker',
  intervalMs: CHECK_INTERVAL_MS,
  initialDelayMs: 45_000,
  tick: async () => {
    // ZUERST aufräumen: ein Lauf, den ein Absturz mitgerissen hat, steht sonst
    // für immer auf 'running' und der Unique-Index sperrt die Aufgabe dauerhaft.
    const swept = await sweepStaleRecurringRuns();
    if (swept > 0)
      log.warn(`${swept} Lauf/Läufe mit abgelaufener Frist als fehlgeschlagen verbucht`);

    const due = await claimDueRecurringTasks();
    // Run sequentially: each run holds a model slot, and the claim already advanced
    // next_run_at so a slow batch won't re-fire the same task on the next tick.
    for (const { task, runId } of due) {
      await runRecurringTask(task, runId);
    }
  },
});

export function startRecurringTaskWorker(): void {
  worker.start();
}

export function stopRecurringTaskWorker(): void {
  worker.stop();
}
