import { useEffect, useMemo } from 'react';

import { notifyWarning } from '../lib/notify';

import type { AssistantRuntime } from '@assistant-ui/react';

/**
 * The adapter's "this thread is now waiting on an answer" signal.
 *
 * Two things need to meet that cannot see each other: the model adapter, built
 * before the runtime exists, and the queue, which only exists once the runtime
 * does. Create the signal first, hand `notify` to the adapter as `onInterrupt`,
 * then hand the whole thing to `useQueueInterruptGuard` with the runtime.
 */
export interface InterruptSignal {
  notify: () => void;
  subscribe: (listener: () => void) => () => void;
}

/** Stable for the lifetime of the component — one per thread runtime. */
export function useInterruptSignal(): InterruptSignal {
  return useMemo(() => {
    const listeners = new Set<() => void>();
    return {
      notify: () => {
        // Copy: a listener that unsubscribes itself would otherwise mutate the
        // set mid-iteration.
        for (const listener of [...listeners]) listener();
      },
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
  }, []);
}

/**
 * Drops waiting turns when the assistant stops to ask the user something.
 *
 * A clarification interrupt ends the run as far as the queue is concerned: it
 * advances and sends the next turn. That turn is genuinely appended to the
 * thread and only then refused by the adapter's re-invocation guard, which
 * throws `AbortError`. The result is a user message stranded behind an
 * unanswered question with an empty assistant turn under it — and the queue
 * does it again for every remaining entry.
 *
 * The signal comes from the adapter rather than from the message status. Both
 * describe the same event — the backend sends the `ask_human` tool call and the
 * `interrupt` that suspends the turn together, from one `suspendTurn` call —
 * but only the adapter's version reaches every surface. `requires-action` is
 * set by the runtime for tools named in `unstable_humanToolNames`, which only
 * the main chat declares, while the adapter arms its refusal regardless. Reading
 * the status instead would have looked like cover for the editor sidebar and
 * been none.
 *
 * Clearing is safe against the alternative reading (hold them until the
 * question is answered) because the answer is what the question is waiting
 * for; a queued turn written before the question existed was not a reply to
 * it. Better to hand it back than to spend it on a run that cannot happen.
 *
 * Call it next to the `useLocalRuntime` whose adapter feeds the signal, so the
 * composer being emptied belongs to the thread that was interrupted. On the
 * main chat that is inside the per-thread runtime hook, not around the thread
 * list: an interrupt on a thread the user has since left must not take the
 * queue of the one they are looking at.
 */
export function useQueueInterruptGuard(runtime: AssistantRuntime, signal: InterruptSignal): void {
  useEffect(
    () =>
      signal.subscribe(() => {
        const composer = runtime.thread.composer;
        const queued = composer.getState().queue;
        if (queued.length === 0) return;

        // Ids first, and the count before the loop. `remove` in core's message
        // queue rebuilds both lanes with `filter`, so this snapshot keeps all
        // its entries and neither would be wrong today — but the queue API is
        // still `unstable_`, and an upstream switch to in-place removal would
        // otherwise silently turn this into a half-emptied queue and a plural
        // toast for one turn.
        const count = queued.length;
        for (const id of queued.map((item) => item.id)) composer.removeQueueItem(id);
        notifyWarning(
          count === 1 ? 'Wartende Nachricht entfernt' : 'Wartende Nachrichten entfernt',
          'Bitte zuerst die Rückfrage beantworten.'
        );
      }),
    [runtime, signal]
  );
}
