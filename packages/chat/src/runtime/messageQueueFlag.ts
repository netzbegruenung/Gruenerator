/**
 * Killswitch for queueing messages typed while a run is still streaming.
 *
 * assistant-ui gates the whole feature behind `thread.capabilities.queue`,
 * which this flag drives: with it off the send button turns back into the
 * cancel button, Enter stays inert during a run, and the queue list renders
 * nothing — the state before the feature existed, with no dead UI left over.
 *
 * Web only. Mobile deliberately does not set it: `@assistant-ui/react-native`
 * ships no queue primitives, so a send during a run would vanish into an
 * invisible queue there.
 */
export const MESSAGE_QUEUE_ENABLED = true;
