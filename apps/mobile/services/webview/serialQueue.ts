export interface SerialQueue {
  enqueue: (task: () => Promise<void>) => Promise<void>;
  /** Drops queued tasks and silences the error of the one running. */
  cancel: () => void;
}

/**
 * Runs tasks one after another. A multi-page share arrives as one `SHARE_FILE`
 * per page, and a second share sheet cannot open while the first is up.
 *
 * When a task fails, everything queued before the failure is dropped: the pages
 * of a batch are posted back to back, so they are all waiting by then, and the
 * user gets one error instead of one per page. Tasks enqueued afterwards run.
 */
export function createSerialQueue(onError: (err: unknown) => void): SerialQueue {
  let tail: Promise<void> = Promise.resolve();
  let generation = 0;
  return {
    enqueue: (task) => {
      const enqueuedIn = generation;
      tail = tail.then(async () => {
        if (enqueuedIn !== generation) return;
        try {
          await task();
        } catch (err) {
          if (enqueuedIn !== generation) return;
          generation += 1;
          onError(err);
        }
      });
      return tail;
    },
    cancel: () => {
      generation += 1;
    },
  };
}
