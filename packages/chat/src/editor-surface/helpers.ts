import type { EditorAssistantState } from './types';

/**
 * Pure reducer for the thread-bootstrap gate. Extracted so the loading/error/
 * ready branching is unit-testable without React or react-query.
 */
export function deriveGateState(input: {
  error: unknown;
  isLoading: boolean;
  threadId: string | null | undefined;
}): { status: 'error'; error: Error } | { status: 'loading' } | { status: 'ready' } {
  if (input.error) {
    return {
      status: 'error',
      error: input.error instanceof Error ? input.error : new Error(String(input.error)),
    };
  }
  if (input.isLoading || !input.threadId) {
    return { status: 'loading' };
  }
  return { status: 'ready' };
}

/**
 * Whether the async-loaded thread history should be imported into the runtime.
 * `useLocalRuntime` snapshots `initialMessages` only on first render, so history
 * arriving later must be imported explicitly — but never while a stream is in
 * flight (that would clobber the in-progress assistant message) and only once.
 */
export function shouldImportHistory(input: {
  alreadyImported: boolean;
  messageCount: number;
  isRunning: boolean;
}): boolean {
  if (input.alreadyImported) return false;
  if (input.messageCount === 0) return false;
  if (input.isRunning) return false;
  return true;
}

/** Type guard narrowing the exposed state to its ready branch. */
export function isReady(
  state: EditorAssistantState
): state is Extract<EditorAssistantState, { status: 'ready' }> {
  return state.status === 'ready';
}
