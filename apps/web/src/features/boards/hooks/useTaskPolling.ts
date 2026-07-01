/**
 * Shared "start an agent task, then poll its status until terminal" loop.
 *
 * Both the manual "Grünerator-Agent starten" run and a schedule's "Jetzt starten"
 * do the same thing: enqueue a task (202 → taskId), then poll a status endpoint
 * until the run settles. This hook owns that loop + the `isRunning` flag; callers
 * supply how to start, how to poll, and what to do once the run settles.
 */
import { type BoardRunStatus } from '@gruenerator/contracts';
import { useCallback, useState } from 'react';

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 80; // ~4 min, covers source fetch + generation

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const TERMINAL: ReadonlySet<BoardRunStatus> = new Set<BoardRunStatus>([
  'completed',
  'failed',
  'awaiting_review',
]);

export interface TaskPollingRun<TStatus extends { status: BoardRunStatus }> {
  /** Enqueue the task. Return its id, or null if it couldn't start (already toasted). */
  start: () => Promise<string | null>;
  /** Fetch current status for `taskId`. Return null to treat as transient + keep polling. */
  poll: (taskId: string) => Promise<TStatus | null>;
  /** Called once when the run reaches a terminal status (completed/failed/awaiting_review). */
  onSettled: (result: TStatus) => void;
}

export function useTaskPolling<TStatus extends { status: BoardRunStatus }>() {
  const [isRunning, setIsRunning] = useState(false);

  const runWithPolling = useCallback(
    async (run: TaskPollingRun<TStatus>) => {
      if (isRunning) return;
      setIsRunning(true);
      try {
        const taskId = await run.start();
        if (!taskId) return;
        for (let attempt = 0; attempt < POLL_MAX_ATTEMPTS; attempt++) {
          await delay(POLL_INTERVAL_MS);
          const result = await run.poll(taskId);
          if (result && TERMINAL.has(result.status)) {
            run.onSettled(result);
            return;
          }
        }
      } finally {
        setIsRunning(false);
      }
    },
    [isRunning]
  );

  return { isRunning, runWithPolling };
}
