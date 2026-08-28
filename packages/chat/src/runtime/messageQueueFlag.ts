/**
 * Killswitch for queueing messages typed while a run is still streaming.
 *
 * assistant-ui gates the whole feature behind `thread.capabilities.queue`,
 * which this flag drives: with it off the send button turns back into the
 * cancel button, Enter stays inert during a run, and the queue list renders
 * nothing — the state before the feature existed, with no dead UI left over.
 *
 * Set by every web surface: the main chat, the notebook and the editor sidebar.
 * Mobile deliberately does not — `@assistant-ui/react-native` ships no queue
 * primitives, so a send during a run would vanish into an invisible queue.
 *
 * A surface that enables this needs an answer for clarification interrupts,
 * which end a run without answering it and would otherwise let the queue feed
 * turns into an adapter that refuses them. The two on
 * `createGrueneratorModelAdapter` pair the flag with `useQueueInterruptGuard`;
 * the notebook needs nothing, its own adapter has no interrupt path at all.
 */
export const MESSAGE_QUEUE_ENABLED = true;
