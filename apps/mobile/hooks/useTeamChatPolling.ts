import { type AssistantRuntime } from '@assistant-ui/react-native';
import {
  convertToThreadMessageLike,
  isThreadCollaborative,
  useAgentStore,
  subscribeThreadTags,
} from '@gruenerator/chat';
import { useIsFocused } from 'expo-router';
import { type RefObject, useEffect, useRef, useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import {
  applyTeamChatRows,
  TEAM_CHAT_POLL_MS,
  type TeamSyncRow,
} from '../components/chat/teamChatSync';
import { getMobileChatApiClient } from '../services/chatConfig';

// Outside the hook on purpose: the React Compiler cannot lower try/catch with
// optional chaining or a finalizer (test/reactCompilerCoverage.vitest.ts).

/** Best effort: `null` when the request fails — the next tick tries again. */
async function fetchTeamChatRows(threadId: string): Promise<TeamSyncRow[] | null> {
  try {
    return await getMobileChatApiClient().get<TeamSyncRow[]>(
      `/api/chat-service/messages?threadId=${encodeURIComponent(threadId)}`
    );
  } catch {
    // swallow-ok: best-effort — the next tick tries again
    return null;
  }
}

/** A failed import leaves the thread as it was; the signature stays unchanged. */
function importTeamChatRows(
  rows: TeamSyncRow[],
  thread: Parameters<typeof applyTeamChatRows>[0]['thread'],
  lastSignature: string | null
): string | null {
  try {
    return applyTeamChatRows({
      rows,
      thread,
      lastSignature,
      convert: (r) =>
        convertToThreadMessageLike(r as Parameters<typeof convertToThreadMessageLike>[0]),
    });
  } catch {
    // swallow-ok: the next tick retries the import
    return lastSignature;
  }
}

/**
 * Live sync of a team chat on the phone: while the thread is open, on screen
 * and the app in the foreground, ask the server for its messages every few
 * seconds. Web gets the same news pushed over Hocuspocus awareness; the native
 * app ships no Yjs stack, so this polls instead (see `teamChatSync`).
 * Private threads are never polled.
 */
export function useTeamChatPolling(runtime: RefObject<AssistantRuntime | null>) {
  // The store's id, not the route's: a project chat started from "new" is
  // minted into the store once its thread exists.
  const threadId = useAgentStore((s) => s.currentThreadId);
  const collaborative = useSyncExternalStore(
    subscribeThreadTags,
    () => (threadId ? isThreadCollaborative(threadId) : false),
    () => false
  );
  const focused = useIsFocused();
  const lastSignature = useRef<string | null>(null);

  useEffect(() => {
    lastSignature.current = null;
  }, [threadId]);

  useEffect(() => {
    if (!threadId || !collaborative || !focused) return;
    let disposed = false;
    let busy = false;
    let timer: ReturnType<typeof setInterval> | null = null;

    // Bumped whenever a local run starts or ends: a fetch that spans one holds
    // rows from before it and must not be imported.
    let runGeneration = 0;
    let wasRunning = false;
    const unsubscribeRuns = runtime.current?.thread.subscribe(() => {
      const running = runtime.current?.thread.getState().isRunning ?? false;
      if (running !== wasRunning) {
        wasRunning = running;
        runGeneration += 1;
      }
    });

    const tick = async () => {
      if (busy || disposed) return;
      busy = true;
      const generation = runGeneration;
      const rows = await fetchTeamChatRows(threadId);
      busy = false;
      if (!rows || disposed || generation !== runGeneration) return;
      lastSignature.current = importTeamChatRows(
        rows,
        runtime.current?.thread ?? null,
        lastSignature.current
      );
    };

    const start = () => {
      if (timer) return;
      void tick();
      timer = setInterval(() => void tick(), TEAM_CHAT_POLL_MS);
    };
    const stop = () => {
      if (timer) clearInterval(timer);
      timer = null;
    };
    if (AppState.currentState === 'active') start();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') start();
      else stop();
    });
    return () => {
      disposed = true;
      unsubscribeRuns?.();
      stop();
      sub.remove();
    };
  }, [threadId, collaborative, focused, runtime]);
}
