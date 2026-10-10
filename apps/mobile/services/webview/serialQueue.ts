/**
 * Runs tasks one after another. A multi-page share arrives as one `SHARE_FILE`
 * per page, and a second share sheet cannot open while the first is up.
 * A failed task is reported and does not stop the ones queued behind it.
 */
export function createSerialQueue(
  onError: (err: unknown) => void
): (task: () => Promise<void>) => Promise<void> {
  let tail: Promise<void> = Promise.resolve();
  return (task) => {
    tail = tail.then(task).catch(onError);
    return tail;
  };
}
