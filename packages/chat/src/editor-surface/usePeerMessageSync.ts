'use client';

import { type AssistantRuntime, ExportedMessageRepository } from '@assistant-ui/react';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import type { HocuspocusProvider } from '@hocuspocus/provider';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { convertToThreadMessageLike } from '../runtime/threadMessageConversion';
import { useChatConfigStore } from '../stores/chatConfigStore';

interface PeerSyncCollab {
  provider: HocuspocusProvider | null;
  broadcastNewMessage: () => void;
}

interface UsePeerMessageSyncArgs {
  threadId: string;
  runtime: AssistantRuntime;
  collab: PeerSyncCollab;
}

/**
 * Multi-user chat sync (v1, append-on-complete):
 * - When a peer broadcasts `chatNewMessage` on the chat-${threadId} room's
 *   Hocuspocus awareness, we refetch the canonical message list from Postgres
 *   and import it into the local AssistantRuntime via `thread.import`.
 * - When the local stream finishes (`isRunning` falls true → false), we
 *   broadcast our own `chatNewMessage` so peers refresh.
 *
 * Token-by-token streaming to peers is intentionally deferred (would require
 * Y.Text mutations during streaming on a Y.Array-backed message store);
 * append-on-complete is the surgical 80% solution.
 *
 * Safety: we never import while the local user is mid-stream — that would
 * replace the in-progress assistant message. The peer's update lands on the
 * next idle moment.
 */
export function usePeerMessageSync({ threadId, runtime, collab }: UsePeerMessageSyncArgs) {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  const queryClient = useQueryClient();

  const lastSeenPeerTickRef = useRef(0);
  // Refresh-in-flight guard. Lives outside the awareness effect so it
  // survives effect re-runs (provider/runtime dep changes) — a closure
  // variable would silently reset and allow concurrent refreshes.
  const pendingRefreshRef = useRef(false);

  useEffect(() => {
    const provider = collab.provider;
    if (!provider) return;
    const awareness = provider.awareness;
    if (!awareness) return;

    const localClientId = awareness.clientID;

    const tryRefresh = async () => {
      if (pendingRefreshRef.current) return;
      if (runtime.thread.getState().isRunning) return;
      pendingRefreshRef.current = true;
      try {
        const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
        if (!res.ok) return;
        const parsed = loadedThreadMessagesSchema.parse(await res.json());
        const converted = convertToThreadMessageLike(
          parsed as Parameters<typeof convertToThreadMessageLike>[0]
        );
        runtime.thread.import(ExportedMessageRepository.fromArray(converted));
        queryClient.setQueryData(['chat-thread-messages', threadId], converted);
      } catch {
        // best-effort — peer pings can be lossy
      } finally {
        pendingRefreshRef.current = false;
      }
    };

    const onChange = () => {
      const states = awareness.getStates();
      let latestPeerTick = lastSeenPeerTickRef.current;
      for (const [clientId, raw] of states) {
        if (clientId === localClientId) continue;
        const state = raw as { chatNewMessage?: { t?: number } } | undefined;
        const t = state?.chatNewMessage?.t;
        if (typeof t === 'number' && t > latestPeerTick) {
          latestPeerTick = t;
        }
      }
      if (latestPeerTick > lastSeenPeerTickRef.current) {
        lastSeenPeerTickRef.current = latestPeerTick;
        void tryRefresh();
      }
    };

    awareness.on('change', onChange);
    return () => {
      awareness.off('change', onChange);
    };
  }, [collab.provider, threadId, runtime, fetchFn, endpoints, queryClient]);

  // Broadcast on local stream completion (running → idle transition).
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const unsubscribe = runtime.thread.subscribe(() => {
      const isRunning = runtime.thread.getState().isRunning;
      if (wasRunningRef.current && !isRunning) {
        collab.broadcastNewMessage();
      }
      wasRunningRef.current = isRunning;
    });
    return () => {
      unsubscribe();
    };
  }, [runtime, collab]);
}
