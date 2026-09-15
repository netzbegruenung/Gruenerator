'use client';

import { useAui, useAuiState } from '@assistant-ui/react';
import { extractSlugSuffix } from '@gruenerator/shared/utils';
import { useEffect, useRef } from 'react';

import { getDefaultAgent } from '../lib/agents';
import { adoptAuiAction, auiPromise } from '../lib/auiAsync';
import { buildNotebookThreadPath } from '../lib/threadPath';
import {
  didLastThreadListFetchFail,
  getNotebookCollectionId,
  getThreadAgentId,
  getThreadSlugSuffix,
  getThreadType,
  resolveThreadBySlugSuffix,
} from '../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../stores/chatStore';

import { reconcileThreadUrl } from './threadUrlReconciler';

/** Legacy links that carry a bare thread id instead of a Notion-style slug. */
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ChatThreadRoutingProps {
  /** Current `:threadSlug` URL param (null on plain /chat). */
  threadSlug: string | null;
  /**
   * Canonicalise the URL for a change the runtime made on its own (a draft that
   * just minted, a generated title). Always a replace — see the file comment.
   */
  onNavigateToThread: (slug: string) => void;
  /** Deep-linked thread missing or deleted → back to the new-chat hero. */
  onThreadGone: () => void;
  /** The runtime left the open thread for a fresh draft → back to bare /chat. */
  onLeaveThread: () => void;
  /** Notebook threads open on their notebook surface instead of /chat. */
  onOpenNotebookThread: (path: string) => void;
}

/**
 * Binds the thread URL (`/chat/<titel>-<suffix>`) to the active assistant-ui
 * thread. The URL is the single source of truth for *which* thread is open.
 *
 * This used to be a two-way sync, with the store's `currentThreadId` as a third
 * opinion — and it oscillated: a slow `history.load()` from the thread you just
 * left wrote `currentThreadId` after the runtime had already settled on the new
 * one, the thread→URL effect followed that stale id, and the URL→thread effect
 * dutifully switched back. Every lap also pushed a history entry.
 *
 * So there are exactly two effects here, and only one of them writes the URL:
 *
 *  - URL → thread: the only place that calls `switchToThread`. Rapid clicks are
 *    safe by construction because assistant-ui cancels an in-flight switch on
 *    every new one (`_switchGeneration`), so the last URL wins.
 *  - thread → URL: fires only for transitions the runtime initiates on its own
 *    (mint, rename, thread gone) and only ever *replaces*. Since a user click is
 *    the only thing that pushes, Back can never replay an oscillation.
 *
 * App-agnostic: navigation goes through the injected callbacks, resolution
 * through the adapter's slug caches.
 */
export function ChatThreadRouting({
  threadSlug,
  onNavigateToThread,
  onThreadGone,
  onLeaveThread,
  onOpenNotebookThread,
}: ChatThreadRoutingProps) {
  const aui = useAui();
  const suffix = threadSlug ? extractSlugSuffix(threadSlug) : null;

  // ---------------------------------------------------------------- URL → thread
  useEffect(() => {
    if (!threadSlug) {
      // Bare /chat means "no thread": park the runtime on a draft so the
      // composer opens a new conversation instead of silently continuing the
      // last one. Guarded on main actually holding a persisted thread — on a
      // cold boot the runtime already starts on a draft, and an unconditional
      // call here would cancel the switch a deep link is about to make.
      // Content queued by another surface: AutoMessageSender owns that hand-off
      // and starts its own thread for it. A second switch here would race it.
      const { pendingMessage, pendingDraft, pendingInitialAssistantMessage } =
        useAgentStore.getState();
      if (pendingMessage || pendingDraft || pendingInitialAssistantMessage) return;

      const state = aui.threads.getState();
      const mainRemoteId =
        state.threadItems.find((t) => t.id === state.mainThreadId)?.remoteId ?? null;
      if (mainRemoteId) {
        adoptAuiAction(aui.threads.switchToNewThread(), (err) => {
          console.warn('[ChatThreadRouting] Could not start a new thread:', err);
        });
      }
      return;
    }

    // Already on the thread the URL names? Then there is nothing to switch, and
    // asking anyway is not free: `_startSwitchToThread` bumps the generation
    // counter — cancelling any in-flight switch — BEFORE it discovers, via
    // `if (this._mainThreadId === data.id) return`, that it has no work to do.
    // This is the main path, not an edge case: minting a thread and its later
    // generated title each rewrite the URL for the thread that is already open.
    // Read the runtime's own main thread, not the store mirror, so a stale id
    // can never suppress a real switch.
    const settled = aui.threads.getState();
    const settledRemoteId =
      settled.threadItems.find((t) => t.id === settled.mainThreadId)?.remoteId ?? null;
    if (
      settledRemoteId &&
      (suffix ? getThreadSlugSuffix(settledRemoteId) === suffix : settledRemoteId === threadSlug)
    ) {
      useAgentStore.getState().setChatViewMode('thread');
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await aui.threads.getLoadThreadsPromise();
        if (cancelled) return;

        let remoteId: string | null = null;
        if (suffix) {
          remoteId = resolveThreadBySlugSuffix(suffix);
          if (!remoteId && didLastThreadListFetchFail()) {
            // The initial list load failed (network blip, cold backend, etc.) —
            // assistant-ui swallows that failure internally and just leaves the
            // list empty, so an empty result here doesn't mean the thread is
            // actually gone. Retry once with a fresh fetch before giving up.
            await aui.threads.reload();
            if (cancelled) return;
            remoteId = resolveThreadBySlugSuffix(suffix);
          }
        } else if (UUID_RE.test(threadSlug)) {
          // Legacy link carrying a bare thread id (Projekt chat rows still build
          // these for threads that predate the slug backfill). It needs no cache
          // entry: switchToThread resolves an unknown id via the adapter's
          // fetch(). Without this branch such a link opened a blank thread.
          remoteId = threadSlug;
        }
        if (!remoteId) {
          onThreadGone();
          return;
        }

        if (getThreadType(remoteId) === 'notebook') {
          const collectionId = getNotebookCollectionId(remoteId);
          if (collectionId) {
            onOpenNotebookThread(buildNotebookThreadPath(collectionId, remoteId));
            return;
          }
        }

        const store = useAgentStore.getState();
        // Opening a specific thread is an explicit pick: drop queued auto-send
        // state so a stale persisted value can't make AutoMessageSender hijack
        // it into a brand-new thread. Deep links need this as much as clicks.
        store.setPendingInitialAssistantMessage(null);
        // ChatPage derives the thread view from the URL already; this is for the
        // consumers that read the flag directly (e.g. the collab bridge).
        store.setChatViewMode('thread');

        await auiPromise(aui.threads.switchToThread(remoteId));
        if (cancelled) return;

        // A switch that lost the race resolves just like one that won:
        // assistant-ui bumps `_switchGeneration` and the superseded call returns
        // silently, leaving main on the other thread. Restoring "our" agent then
        // is actively harmful — AgentSwitchListener skips its structural guard
        // while main holds no thread and answers the change with a brand-new
        // thread, wiping the one the newer click just opened. Let that newer
        // effect run finish the job.
        const after = aui.threads.getState();
        const settledAfter =
          after.threadItems.find((t) => t.id === after.mainThreadId)?.remoteId ?? null;
        if (settledAfter !== remoteId) return;

        // Restore the thread's agent AFTER the switch: AgentSwitchListener then
        // sees a main thread whose agent already matches and skips its "new
        // agent → new thread" reset without needing a suppression flag.
        const agentId = getThreadAgentId(remoteId);
        const targetAgent = agentId && agentId !== getDefaultAgent() ? agentId : null;
        if (useAgentStore.getState().selectedAgentId !== targetAgent) {
          useAgentStore.getState().setSelectedAgent(targetAgent);
        }
      } catch (err) {
        // The thread can vanish between the cache lookup and the switch: the
        // adapter's fetch() then rejects with "Thread <id> not found".
        console.warn('[ChatThreadRouting] Failed to open thread from URL:', err);
        if (!cancelled) onThreadGone();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [threadSlug, suffix, aui, onThreadGone, onOpenNotebookThread]);

  // ---------------------------------------------------------------- thread → URL
  // Two primitive selectors rather than one object: a fresh object per render
  // would never compare equal and would re-run this on every store tick.
  const mainRemoteId = useAuiState(
    (s) => s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.remoteId ?? null
  );
  const mainTitle = useAuiState(
    (s) => s.threads.threadItems.find((t) => t.id === s.threads.mainThreadId)?.title ?? null
  );
  // Seeded with whatever main already holds rather than null: on a URL that
  // names no thread the two are told apart by exactly this — a thread that was
  // open before this mounted (prev = main) must not claim the URL, one minted
  // from a draft (prev = null) must. A cold boot starts at null, main a draft.
  const prevRemoteRef = useRef<string | null | undefined>(undefined);
  if (prevRemoteRef.current === undefined) {
    const boot = aui.threads.getState();
    prevRemoteRef.current =
      boot.threadItems.find((t) => t.id === boot.mainThreadId)?.remoteId ?? null;
  }

  useEffect(() => {
    const prevRemoteId = prevRemoteRef.current ?? null;
    prevRemoteRef.current = mainRemoteId;

    const action = reconcileThreadUrl({
      mainRemoteId,
      mainSuffix: mainRemoteId ? getThreadSlugSuffix(mainRemoteId) : null,
      mainTitle,
      threadSlug,
      suffix,
      prevRemoteId,
      slugStillResolves: suffix ? resolveThreadBySlugSuffix(suffix) != null : false,
    });

    if (action.type === 'replace') onNavigateToThread(action.slug);
    else if (action.type === 'leave') onLeaveThread();
    else if (action.type === 'gone') onThreadGone();
  }, [
    mainRemoteId,
    mainTitle,
    threadSlug,
    suffix,
    onNavigateToThread,
    onThreadGone,
    onLeaveThread,
  ]);

  return null;
}
