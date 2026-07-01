/**
 * Background poller that fires due board schedules (board_scheduled_runs).
 *
 * Built on the shared createIntervalWorker; the whole body is one claim-and-enqueue
 * call. No execution logic lives here — a fired schedule just enqueues an
 * agent_tasks row that the existing boardAgentWorker drains through runFlow.
 */
import { createIntervalWorker } from '../../utils/intervalWorker.js';

import { claimAndEnqueueDueSchedules } from './boardScheduleService.js';

const CHECK_INTERVAL_MS = 60 * 1000; // every minute

const worker = createIntervalWorker({
  name: 'BoardScheduleWorker',
  intervalMs: CHECK_INTERVAL_MS,
  initialDelayMs: 30_000,
  tick: async () => {
    await claimAndEnqueueDueSchedules();
  },
});

export function startBoardScheduleWorker(): void {
  worker.start();
}

export function stopBoardScheduleWorker(): void {
  worker.stop();
}
