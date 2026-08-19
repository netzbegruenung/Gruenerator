/**
 * assistant-ui 0.15 declares its thread-scope actions as returning `void`, but
 * they are `async` at runtime — see
 * `@assistant-ui/core/dist/store/runtime-clients/thread-list-runtime-client.js`
 * (`switchToThread: async (threadId, options) => { await runtime.switchToThread(...) }`)
 * and `runtime/api/thread-list-item-runtime.js` (`switchTo` returns the binding's
 * promise). Ignoring the real promise turns a rejection — the thread was deleted
 * while the action was in flight — into an unhandled rejection.
 *
 * The obvious workaround, `Promise.resolve().then(() => action())`, also
 * *defers* the call by a microtask. For thread-list items that is a bug in its
 * own right: an item is bound by its position in the list, so a list that
 * reorders in between (any `list()` refresh does) makes the action land on a
 * different thread than the one that was clicked. These helpers call
 * synchronously and only adopt the result.
 *
 * The casts are the assertion that the runtime disagrees with the `.d.ts`.
 */

/** Adopt the promise an assistant-ui action actually returns. */
export function auiPromise(result: void): Promise<void> {
  return Promise.resolve(result as unknown as Promise<void> | undefined);
}

/** Fire an assistant-ui action now and route its rejection to `onError`. */
export function adoptAuiAction(result: void, onError: (err: unknown) => void): void {
  void auiPromise(result).catch(onError);
}
