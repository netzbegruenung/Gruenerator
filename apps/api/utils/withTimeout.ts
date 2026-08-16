/**
 * Bound the latency of a best-effort side call (memory lookup, share-link
 * check, one of the classifier's small resolvers) on the user's critical path.
 * The underlying operation is NOT cancelled — this only stops the caller from
 * waiting.
 *
 * `label` exists because every caller catches the rejection and logs the
 * message: without it four call sites cannot be told apart in one log line.
 * NOT for the agentic loop's tool wrapper — that one has to turn a timeout into
 * a tool RESULT (`{error}`) rather than a rejection, so its own copy stays where
 * it is (§4.4 of the architecture paper).
 */
export class TimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`${label} timed out after ${ms}ms`);
    this.name = 'TimeoutError';
  }
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new TimeoutError(label, ms)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err: unknown) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}
