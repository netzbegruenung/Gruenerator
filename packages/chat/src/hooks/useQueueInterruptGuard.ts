import { useEffect } from 'react';

import { notifyWarning } from '../lib/notify';

import type { AssistantRuntime } from '@assistant-ui/react';

/**
 * Drops waiting turns when the assistant stops to ask the user something.
 *
 * An `ask_human` interrupt parks the run at `requires-action`, which ends the
 * run as far as the queue is concerned: it advances and sends the next turn.
 * That turn is genuinely appended to the thread and only then refused by the
 * adapter's re-invocation guard, which throws `AbortError`. The result is a
 * user message stranded behind an unanswered question with an empty assistant
 * turn under it — and the queue does it again for every remaining entry.
 *
 * Clearing is safe against the alternative reading (hold them until the
 * question is answered) because the answer is what the question is waiting
 * for; a queued turn written before the question existed was not a reply to
 * it. Better to hand it back than to spend it on a run that cannot happen.
 *
 * The subscriber wins the race by construction: `requires-action` is published
 * synchronously through the store notification, while the queue only advances
 * on a microtask after `runEnd`.
 */
export function useQueueInterruptGuard(runtime: AssistantRuntime): void {
  useEffect(() => {
    const unsubscribe = runtime.thread.subscribe(() => {
      const composer = runtime.thread.composer;
      const queued = composer.getState().queue;
      if (queued.length === 0) return;

      const last = runtime.thread.getState().messages.at(-1);
      const awaitingAnswer =
        last?.role === 'assistant' &&
        last.status.type === 'requires-action' &&
        last.content.some(
          (part) =>
            part.type === 'tool-call' &&
            part.toolName === 'ask_human' &&
            !('result' in part && part.result)
        );
      if (!awaitingAnswer) return;

      // Ids first: removing an item mutates the queue, and walking the live
      // array while it shrinks would skip every second entry.
      for (const id of queued.map((item) => item.id)) composer.removeQueueItem(id);
      notifyWarning(
        queued.length === 1 ? 'Wartende Nachricht entfernt' : 'Wartende Nachrichten entfernt',
        'Bitte zuerst die Rückfrage beantworten.'
      );
    });
    return () => {
      unsubscribe();
    };
  }, [runtime]);
}
