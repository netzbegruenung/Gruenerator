'use client';

import { type AssistantRuntime, ExportedMessageRepository } from '@assistant-ui/react';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { resumeChatTurn } from '../runtime/GrueneratorModelAdapter';
import { splitLiveTurn } from '../runtime/resumableStream';
import { convertToThreadMessageLike } from '../runtime/threadMessageConversion';
import { useChatConfigStore } from '../stores/chatConfigStore';

import type { HocuspocusProvider } from '@hocuspocus/provider';

interface PeerSyncCollab {
  provider: HocuspocusProvider | null;
  broadcastNewMessage: () => void;
  /** Absent on surfaces that only sync on completion (the editor chat). */
  broadcastTurnStarted?: () => void;
}

interface UsePeerMessageSyncArgs {
  threadId: string;
  runtime: AssistantRuntime;
  collab: PeerSyncCollab;
}

/** After a turn-start tick the server may not have written the live row yet. */
const TURN_START_RETRY_MS = [800, 2000] as const;

type PeerAwarenessState = {
  chatNewMessage?: { t?: number };
  chatTurnStarted?: { t?: number };
};

/**
 * Multi-user chat sync:
 * - A peer's `chatNewMessage` / `chatTurnStarted` on the chat-${threadId} room's
 *   Hocuspocus awareness makes us refetch the canonical message list from
 *   Postgres and import it into the local AssistantRuntime via `thread.import`.
 * - When the last row is a live `streaming` assistant row (`metadata.live`, set
 *   by GET messages), the row is split off the import and the turn is re-attached
 *   through `thread.resumeRun` + `resumeChatTurn` — the same path the
 *   history-resume after a reload takes. The importer then renders it as a
 *   running turn (send disabled) and the answer streams in.
 * - When the local run starts / ends we broadcast so peers do the same. A run
 *   that was itself driven by a peer sync does not broadcast.
 *
 * Safety: we never import while the local runtime is running — that would
 * replace the in-progress assistant message. A tick that lands mid-run is
 * remembered and refreshed at the next idle moment.
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
  // A tick arrived while we were running; refresh once the run ends.
  const dirtyRef = useRef(false);
  // The run in flight was started by a peer sync (re-attach), not by us.
  const peerRunRef = useRef(false);
  // Stream ids already re-attached: a second sighting means the replay ended
  // and the row is just not finalized yet — import it as it is, no second run.
  const resumedStreamsRef = useRef(new Set<string>());
  const refreshRef = useRef<(retries: readonly number[]) => Promise<void>>(async () => {});

  useEffect(() => {
    resumedStreamsRef.current.clear();
    dirtyRef.current = false;
    peerRunRef.current = false;
  }, [threadId]);

  useEffect(() => {
    const provider = collab.provider;
    if (!provider) return;
    const awareness = provider.awareness;
    if (!awareness) return;

    const localClientId = awareness.clientID;
    let disposed = false;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const tryRefresh = async (retries: readonly number[]): Promise<void> => {
      if (disposed || pendingRefreshRef.current) return;
      if (runtime.thread.getState().isRunning) {
        dirtyRef.current = true;
        return;
      }
      pendingRefreshRef.current = true;
      let sawLive = false;
      try {
        const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
        if (!res.ok || disposed) return;
        const parsed = loadedThreadMessagesSchema.parse(await res.json());
        // The run may have started while the fetch was in flight.
        if (runtime.thread.getState().isRunning) {
          dirtyRef.current = true;
          return;
        }
        const split = splitLiveTurn(parsed);
        // Already re-attached and the row is still not finalized: what we
        // streamed is newer than the row. Keep it.
        if (split.live && resumedStreamsRef.current.has(split.live.streamId)) return;
        const live = split.live;
        const rows = live ? split.rows : parsed;
        const converted = convertToThreadMessageLike(
          rows as Parameters<typeof convertToThreadMessageLike>[0]
        );
        runtime.thread.import(ExportedMessageRepository.fromArray(converted));
        queryClient.setQueryData(['chat-thread-messages', threadId], converted);
        if (live) {
          sawLive = true;
          resumedStreamsRef.current.add(live.streamId);
          peerRunRef.current = true;
          const parentId = runtime.thread.getState().messages.at(-1)?.id ?? null;
          runtime.thread.resumeRun({
            parentId,
            stream: (options) => resumeChatTurn(live.streamId, live.partialText, options),
          });
        }
      } catch {
        // best-effort — peer pings can be lossy
      } finally {
        pendingRefreshRef.current = false;
      }
      const delay = retries[0];
      if (!sawLive && delay !== undefined) {
        const timer = setTimeout(() => {
          timers.delete(timer);
          void tryRefresh(retries.slice(1));
        }, delay);
        timers.add(timer);
      }
    };
    refreshRef.current = tryRefresh;

    const onChange = () => {
      const states = awareness.getStates();
      let latestPeerTick = lastSeenPeerTickRef.current;
      let turnStarted = false;
      for (const [clientId, raw] of states) {
        if (clientId === localClientId) continue;
        const state = raw as PeerAwarenessState | undefined;
        const tNew = state?.chatNewMessage?.t;
        const tStart = state?.chatTurnStarted?.t;
        if (typeof tNew === 'number' && tNew > latestPeerTick) latestPeerTick = tNew;
        if (typeof tStart === 'number' && tStart > latestPeerTick) {
          latestPeerTick = tStart;
          turnStarted = true;
        }
      }
      if (latestPeerTick > lastSeenPeerTickRef.current) {
        lastSeenPeerTickRef.current = latestPeerTick;
        void tryRefresh(turnStarted ? TURN_START_RETRY_MS : []);
      }
    };

    awareness.on('change', onChange);
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      awareness.off('change', onChange);
    };
  }, [collab.provider, threadId, runtime, fetchFn, endpoints, queryClient]);

  // Broadcast local run start / completion; refresh what we missed meanwhile.
  const wasRunningRef = useRef(false);
  useEffect(() => {
    const unsubscribe = runtime.thread.subscribe(() => {
      const isRunning = runtime.thread.getState().isRunning;
      const wasRunning = wasRunningRef.current;
      wasRunningRef.current = isRunning;
      if (!wasRunning && isRunning && !peerRunRef.current) {
        collab.broadcastTurnStarted?.();
      }
      if (wasRunning && !isRunning) {
        const wasPeerRun = peerRunRef.current;
        peerRunRef.current = false;
        if (!wasPeerRun) collab.broadcastNewMessage();
        // A peer-driven run ends on the replay's own ids: re-import the
        // canonical rows so later refreshes line up with them.
        if (wasPeerRun || dirtyRef.current) {
          dirtyRef.current = false;
          void refreshRef.current([]);
        }
      }
    });
    return () => {
      unsubscribe();
    };
  }, [runtime, collab]);
}
