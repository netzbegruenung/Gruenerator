/**
 * EXPERIMENTAL — background poller that fires due recurring tasks (recurring_tasks).
 *
 * Built on the shared createIntervalWorker. Each tick claims due tasks
 * (FOR UPDATE SKIP LOCKED → cluster-safe, advances next_run_at in the txn) and runs
 * each through recurringTaskRunner. Unlike the board schedule worker there is no
 * separate queue: the runner executes the agent + delivers inline. Gated by
 * env.RECURRING_TASKS_ENABLED at the call site (server.ts).
 */
import { createIntervalWorker } from '../../utils/intervalWorker.js';

import { runRecurringTask } from './recurringTaskRunner.js';
import { claimDueRecurringTasks } from './recurringTasksRepository.js';

const CHECK_INTERVAL_MS = 60 * 1000; // every minute

const worker = createIntervalWorker({
  name: 'RecurringTaskWorker',
  intervalMs: CHECK_INTERVAL_MS,
  initialDelayMs: 45_000,
  tick: async () => {
    const due = await claimDueRecurringTasks();
    // Run sequentially: each run holds a model slot, and the claim already advanced
    // next_run_at so a slow batch won't re-fire the same task on the next tick.
    for (const task of due) {
      await runRecurringTask(task);
    }
  },
});

export function startRecurringTaskWorker(): void {
  worker.start();
}

export function stopRecurringTaskWorker(): void {
  worker.stop();
}
