/**
 * Router state for a hop to bare /chat that keeps the thread the runtime is on.
 *
 * The /start composer sends into the hoisted runtime and then hands the running
 * thread to /chat. It cannot address the thread itself: assistant-ui reports a
 * freshly minted remoteId a commit after initialize() resolves, so at the
 * moment the run starts main may still look like a draft. ChatThreadRouting
 * claims the URL for it once the id is there.
 */
export const ADOPT_OPEN_THREAD_STATE = { adoptOpenThread: true } as const;

export function isAdoptOpenThreadState(state: unknown): boolean {
  return (
    typeof state === 'object' &&
    state !== null &&
    (state as { adoptOpenThread?: unknown }).adoptOpenThread === true
  );
}
