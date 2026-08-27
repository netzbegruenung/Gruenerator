/**
 * Idle deadline for a model stream — pure, timer-only, no imports, so both
 * answer paths can share ONE definition of "this stream has stalled".
 *
 * Why shared: the chat has two paths that stream an answer. `streamWithFallback`
 * (single-pass) had this guard; the agentic loop had nothing but a 120s
 * wall clock, and the tier-3.5 demotion routes most turns through the loop — so
 * the protected path was rarely the one users hit. A second, independent timer
 * would only let the two definitions drift apart.
 *
 * Idle-based, not one-shot, and that distinction is the whole point. The
 * deadline exists to catch a HANG, but a reasoning model holds its answer back
 * until thinking completes — it can stream reasoning deltas well past the window
 * and still be perfectly healthy. `touch()` marks liveness and rearms; a stream
 * emitting NOTHING for the full window is declared hung. Reasoning counts as
 * liveness exactly like text.
 *
 * The caller supplies `makeError` so each path keeps its own typed failure
 * (the single-pass path's must stay a `StreamFailure` to drive its fallback)
 * without this module having to know about either.
 *
 * `isBusy` covers the second reason a healthy stream can go quiet: the agentic
 * tool phase parks the iterator for as long as a tool call runs (up to 90s for
 * a generation tool). That silence is the tool working, not the lane dying, so
 * the window is re-armed instead of fired while the predicate says busy. The
 * tool's own per-call timeout stays the bound there.
 */

export interface IdleDeadline {
  /** Rejects with `makeError()` once the stream has been silent for the window.
   *  Race this against the stream's `next()`. */
  deadline: Promise<never>;
  /** Aborts at the same moment — combine into the request's signal so a stalled
   *  provider call is actually torn down, not just abandoned. */
  signal: AbortSignal;
  /** Disarm; call in a `finally` so a completed stream frees the timer. */
  clear: () => void;
  /** Mark liveness (any chunk, text or reasoning) and rearm the window. */
  touch: () => void;
}

export function createIdleDeadline(
  deadlineMs: number,
  makeError: () => Error,
  /** Optional: while this returns true, silence is expected and the window is
   *  re-armed rather than fired. */
  isBusy?: () => boolean
): IdleDeadline {
  const controller = new AbortController();
  let timeoutHandle: NodeJS.Timeout | undefined;
  let lastActivity = Date.now();
  let settled = false;

  const deadline = new Promise<never>((_, reject) => {
    const arm = (ms: number): void => {
      timeoutHandle = setTimeout(() => {
        if (isBusy?.() === true) {
          // Work is in flight — treat it as liveness and start the window over.
          lastActivity = Date.now();
          arm(deadlineMs);
          return;
        }
        const idleFor = Date.now() - lastActivity;
        if (idleFor >= deadlineMs) {
          settled = true;
          controller.abort();
          reject(makeError());
          return;
        }
        // Activity landed since this timer was armed — wait out the remainder.
        arm(deadlineMs - idleFor);
      }, ms);
    };
    arm(deadlineMs);
  });
  // Kein Fehler geht verloren — wer `deadline` awaitet, sieht die Ablehnung.
  // swallow-ok: nur Unterdrückung der unhandled-rejection, wenn der Stream vorher sauber geklärt wurde
  deadline.catch(() => {});

  return {
    deadline,
    signal: controller.signal,
    clear: () => {
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
    },
    touch: () => {
      if (!settled) lastActivity = Date.now();
    },
  };
}
