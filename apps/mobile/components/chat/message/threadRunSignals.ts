// Imported from the store-only entry point rather than the package barrel: that
// barrel re-exports the runtime adapters, so pulling it in here would drag the
// whole streaming stack onto a module whose entire job is two setState calls.
import { useAgentStore, useChatConfigStore } from '@gruenerator/chat/stores';

/**
 * Tells the backend that the next run REPLACES the thread's last turn instead
 * of appending it.
 *
 * The signal is written here and consumed once by the shared model adapter
 * (`GrueneratorModelAdapter` → `consumeRunSignals`), which mobile drives too.
 * Only the writing half was missing: without it a regenerate or an edit leaves
 * the superseded turn behind in `chat_messages`, so the persisted thread grows
 * a duplicate every time — invisible in the session, wrong on reload and on
 * every other device.
 *
 * Web's equivalents are `MessageActions.handleRegenerate` and
 * `UserMessage`'s editor `save`. Both are one-shot and thread-scoped, so a
 * signal that never gets consumed (user cancels) cannot leak into another
 * thread's run.
 *
 * Split out of the components so the rule is stated once and can be tested
 * without a renderer.
 */

/** Flag the next run as a regenerate of the last assistant turn. */
export function flagRegenerate(): void {
  const threadId = useAgentStore.getState().currentThreadId;
  if (!threadId) return;
  useChatConfigStore.getState().signalRegenerate(threadId);
}

/** Flag the next run as an edit-resubmit starting from a persisted message. */
export function flagEditResubmit(messageId: string): void {
  const threadId = useAgentStore.getState().currentThreadId;
  if (!threadId || !messageId) return;
  useChatConfigStore.getState().signalEditResubmit(threadId, messageId);
}
