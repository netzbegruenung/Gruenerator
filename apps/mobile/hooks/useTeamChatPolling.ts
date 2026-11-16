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
        runGeneration++;
      }
    });

    const tick = async () => {
      if (busy || disposed) return;
      busy = true;
      const generation = runGeneration;
      try {
        const rows = await getMobileChatApiClient().get<TeamSyncRow[]>(
          `/api/chat-service/messages?threadId=${encodeURIComponent(threadId)}`
        );
        if (disposed || generation !== runGeneration) return;
        lastSignature.current = applyTeamChatRows({
          rows,
          thread: runtime.current?.thread ?? null,
          lastSignature: lastSignature.current,
          convert: (r) =>
            convertToThreadMessageLike(r as Parameters<typeof convertToThreadMessageLike>[0]),
        });
      } catch {
        // swallow-ok: best-effort — the next tick tries again
      } finally {
        busy = false;
      }
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
