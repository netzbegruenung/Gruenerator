/**
 * Killswitch for queueing messages typed while a run is still streaming.
 *
 * assistant-ui gates the whole feature behind `thread.capabilities.queue`,
 * which this flag drives: with it off the send button turns back into the
 * cancel button, Enter stays inert during a run, and the queue list renders
 * nothing — the state before the feature existed, with no dead UI left over.
 *
 * Set by the main chat and the notebook. Two surfaces deliberately do not:
 *
 * - Mobile — `@assistant-ui/react-native` ships no queue primitives, so a send
 *   during a run would vanish into an invisible queue.
 * - The editor sidebar — it shares the main chat's model adapter and so
 *   inherits an interrupt guard that aborts the next run on an interrupted
 *   thread, which a queue would feed stranded turns. `useQueueInterruptGuard`
 *   cannot cover it: that guard recognises an interrupt only by the
 *   `requires-action` status the runtime sets for declared human tools. See
 *   the note at its `useLocalRuntime` call.
 *
 * The notebook is clear on that count — its own adapter has no interrupt path.
 */
export const MESSAGE_QUEUE_ENABLED = true;
