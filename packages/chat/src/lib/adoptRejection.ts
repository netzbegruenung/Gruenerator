/**
 * assistant-ui's `aui` client types its fire-and-forget methods
 * (`threads.switchToThread`, `threadListItem.generateTitle`, …) as returning
 * `void`, while the implementation returns a promise. A rejection — e.g.
 * generating a title for a thread whose `initialize()` failed, which throws
 * `has status "new"` — therefore escapes as an unhandled rejection and lands in
 * Sentry as an uncaught error.
 *
 * Adopt the promise when there is one; do nothing when the method really did
 * return void.
 */
export function adoptRejection(result: unknown, onError: (err: unknown) => void): void {
  if (result instanceof Promise) {
    result.catch(onError);
  }
}
