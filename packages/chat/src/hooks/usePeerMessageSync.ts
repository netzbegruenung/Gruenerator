'use client';

import { type AssistantRuntime, ExportedMessageRepository } from '@assistant-ui/react';
import { loadedThreadMessagesSchema } from '@gruenerator/shared/chat';
import { QueryClientContext } from '@tanstack/react-query';
import { useContext, useEffect, useRef, useState } from 'react';

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

type ServerTurnSignal = { kind?: 'started' | 'message'; by?: string | null; t?: number };

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
export function usePeerMessageSync({ threadId, runtime, collab }: UsePeerMessageSyncArgs): {
  peerRunning: boolean;
} {
  const fetchFn = useChatConfigStore((s) => s.fetch);
  const endpoints = useChatConfigStore((s) => s.endpoints);
  // Optional: the bridge mounts this in hosts without a QueryClientProvider.
  const queryClient = useContext(QueryClientContext);

  const lastSeenPeerTickRef = useRef(0);
  // Latest collab callbacks, so the subscribe effect does not re-run (and
  // re-subscribe) every time the hook above hands out a fresh object.
  const collabRef = useRef(collab);
  collabRef.current = collab;
  // A tick arrived while we were running; refresh once the run ends.
  const dirtyRef = useRef(false);
  // The run in flight was started by a peer sync (re-attach), not by us.
  const peerRunRef = useRef(false);
  // Same fact as state, for the composer: a peer's turn is not ours to stop.
  const [peerRunning, setPeerRunning] = useState(false);
  const setPeerRun = (v: boolean) => {
    peerRunRef.current = v;
    setPeerRunning(v);
  };
  // Stream ids already re-attached: a second sighting means the replay ended
  // and the row is just not finalized yet — import it as it is, no second run.
  const resumedStreamsRef = useRef(new Set<string>());
  const refreshRef = useRef<(retries: readonly number[]) => Promise<void>>(async () => {});

  useEffect(() => {
    resumedStreamsRef.current.clear();
    dirtyRef.current = false;
    lastSeenPeerTickRef.current = 0;
    setPeerRun(false);
  }, [threadId]);

  useEffect(() => {
    const provider = collab.provider;
    if (!provider) return;
    const awareness = provider.awareness;
    if (!awareness) return;

    const localClientId = awareness.clientID;
    let disposed = false;
    // Per effect run: a refresh of the thread we just left must neither block
    // the new thread's ticks nor import into it (`disposed` guards that).
    let pending = false;
    // A tick that landed mid-refresh: run once more when this one is done.
    let refetchAfter: readonly number[] | null = null;
    const timers = new Set<ReturnType<typeof setTimeout>>();

    const tryRefresh = async (retries: readonly number[]): Promise<void> => {
      if (disposed) return;
      if (pending) {
        if (!refetchAfter || retries.length > refetchAfter.length) refetchAfter = retries;
        return;
      }
      if (runtime.thread.getState().isRunning) {
        dirtyRef.current = true;
        return;
      }
      pending = true;
      let sawLive = false;
      try {
        const res = await fetchFn(`${endpoints.messages}?threadId=${threadId}`);
        if (!res.ok || disposed) return;
        const json: unknown = await res.json();
        // The user may have switched threads, or started a run, meanwhile.
        if (disposed) return;
        if (runtime.thread.getState().isRunning) {
          dirtyRef.current = true;
          return;
        }
        const parsed = loadedThreadMessagesSchema.parse(json);
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
        queryClient?.setQueryData(['chat-thread-messages', threadId], converted);
        if (live) {
          sawLive = true;
          resumedStreamsRef.current.add(live.streamId);
          setPeerRun(true);
          const parentId = runtime.thread.getState().messages.at(-1)?.id ?? null;
          runtime.thread.resumeRun({
            parentId,
            stream: (options) => resumeChatTurn(live.streamId, live.partialText, options),
          });
        }
      } catch {
        // best-effort — peer pings can be lossy
      } finally {
        pending = false;
      }
      if (disposed) return;
      if (refetchAfter) {
        const next = refetchAfter;
        refetchAfter = null;
        await tryRefresh(next);
        return;
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

    // Server-side signal: the API writes `turnSignal` into the room whenever it
    // persists a turn step, so turns from the app or the API reach us too. It
    // takes the same refresh path as the awareness nudge above.
    const signals = provider.document.getMap<ServerTurnSignal>('turnSignal');
    const onServerSignal = () => {
      const signal = signals.get('signal');
      if (!signal) return;
      const me = (awareness.getLocalState() as { user?: { id?: string } } | null)?.user?.id;
      // Our own turn is already handled by the local runtime; a second tab of
      // the same person is not running and still refreshes.
      if (signal.by && signal.by === me && runtime.thread.getState().isRunning) return;
      void tryRefresh(signal.kind === 'started' ? TURN_START_RETRY_MS : []);
    };
    signals.observe(onServerSignal);
    return () => {
      disposed = true;
      timers.forEach(clearTimeout);
      awareness.off('change', onChange);
      signals.unobserve(onServerSignal);
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
        collabRef.current.broadcastTurnStarted?.();
      }
      if (wasRunning && !isRunning) {
        const wasPeerRun = peerRunRef.current;
        if (wasPeerRun) setPeerRun(false);
        if (!wasPeerRun) collabRef.current.broadcastNewMessage();
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
  }, [runtime]);

  return { peerRunning };
}
