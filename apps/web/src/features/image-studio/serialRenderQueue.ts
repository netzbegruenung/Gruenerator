/**
 * A bounded-concurrency task queue with join-on-identical-key.
 *
 * Built for offscreen canvas renders: each one mounts a whole React root with
 * a Konva stage, so letting a thread's worth of them run at once multiplies
 * peak memory instead of finishing sooner. Callers asking for the *same* thing
 * — a chat sharepic's hero card and its own variant chip always do — share one
 * run rather than queueing a duplicate.
 *
 * The limit is small but deliberately not 1. Most of a render's wall-clock is
 * idle: mounting React, loading the background image, waiting out the
 * renderer's readiness floor before the first capture is worth attempting.
 * Only the capture itself is CPU. Measured over 5 sharepics (15 renders),
 * fully serial took 8.3s against 1.8s for the old unbounded version, while a
 * small overlap keeps the peak bounded and recovers most of that time.
 */

interface QueuedTask<T> {
  key: string;
  task: () => Promise<T>;
  waiters: ((result: T) => void)[];
}

export interface SerialQueue<T> {
  /**
   * Runs `task`, or joins an identical in-flight or pending one. Resolves with
   * that run's result. Never rejects — `task` itself is expected to absorb its
   * failures and resolve with whatever the caller should treat as "no result".
   */
  run: (key: string, task: () => Promise<T>) => Promise<T>;
}

export function createSerialQueue<T>(concurrency = 3): SerialQueue<T> {
  const pending: QueuedTask<T>[] = [];
  const running = new Set<QueuedTask<T>>();

  const pump = (): void => {
    while (running.size < concurrency) {
      const next = pending.shift();
      if (!next) return;
      running.add(next);
      void next.task().then((result) => {
        running.delete(next);
        // Snapshot the waiters: one of them may enqueue again on resolve, and
        // that belongs to a later run, not this one.
        [...next.waiters].forEach((resolve) => resolve(result));
        pump();
      });
    }
  };

  return {
    run(key, task) {
      return new Promise<T>((resolve) => {
        for (const active of running) {
          if (active.key === key) {
            active.waiters.push(resolve);
            return;
          }
        }
        const queued = pending.find((entry) => entry.key === key);
        if (queued) {
          queued.waiters.push(resolve);
          return;
        }
        pending.push({ key, task, waiters: [resolve] });
        pump();
      });
    },
  };
}
