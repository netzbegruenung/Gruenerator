'use client';

import { useAui } from '@assistant-ui/react';
import { buildChatThreadSlug, extractSlugSuffix } from '@gruenerator/shared/utils';
import { useEffect, useRef } from 'react';

import { getDefaultAgent } from '../lib/agents';
import {
  didLastThreadListFetchFail,
  getNotebookCollectionId,
  getThreadAgentId,
  getThreadSlugSuffix,
  getThreadType,
  resolveThreadBySlugSuffix,
} from '../runtime/GrueneratorThreadListAdapter';
import { useAgentStore } from '../stores/chatStore';

export interface ChatThreadRoutingProps {
  /** Current `:threadSlug` URL param (null on plain /chat). */
  threadSlug: string | null;
  onNavigateToThread: (slug: string, opts: { replace: boolean }) => void;
  /** Deep-linked thread missing/deleted, or active thread went away → back to /chat. */
  onThreadGone: () => void;
  /** Notebook threads open on their notebook surface instead of /chat. */
  onOpenNotebookThread: (path: string) => void;
}

/**
 * Two-way sync between the thread URL (`/chat/<titel>-<suffix>`) and the
 * active assistant-ui thread. App-agnostic: navigation goes through the
 * injected callbacks, resolution through the adapter's slug caches.
 */
export function ChatThreadRouting({
  threadSlug,
  onNavigateToThread,
  onThreadGone,
  onOpenNotebookThread,
}: ChatThreadRoutingProps) {
  const aui = useAui();
  const suffix = threadSlug ? extractSlugSuffix(threadSlug) : null;
  // Suffix whose thread actually became active. Guards the "thread gone"
  // signal below against the boot race: assistant-ui's initial local thread
  // item is a fresh draft, so history.load() nulls currentThreadId once on
  // boot before the deep-link resolution below has switched to the real thread.
  const activatedSuffixRef = useRef<string | null>(null);

  // URL → thread: deep link, reload, browser back/forward.
  useEffect(() => {
    if (!suffix) return;
    const current = useAgentStore.getState().currentThreadId;
    if (current && getThreadSlugSuffix(current) === suffix) {
      activatedSuffixRef.current = suffix;
      return;
    }

    let cancelled = false;
    void (async () => {
      try {
        await aui.threads().getLoadThreadsPromise();
        if (cancelled) return;
        let remoteId = resolveThreadBySlugSuffix(suffix);
        if (!remoteId && didLastThreadListFetchFail()) {
          // The initial list load failed (network blip, cold backend, etc.) —
          // assistant-ui swallows that failure internally and just leaves the
          // list empty, so an empty result here doesn't mean the thread is
          // actually gone. Retry once with a fresh fetch before giving up.
          await aui.threads().reload();
          if (cancelled) return;
          remoteId = resolveThreadBySlugSuffix(suffix);
        }
        if (!remoteId) {
          onThreadGone();
          return;
        }
        if (getThreadType(remoteId) === 'notebook') {
          const collectionId = getNotebookCollectionId(remoteId);
          if (collectionId) {
            onOpenNotebookThread(
              collectionId.endsWith('-system')
                ? `/gruene-${collectionId.replace('-system', '')}?thread=${remoteId}`
                : `/notebook/${collectionId}?thread=${remoteId}`
            );
            return;
          }
        }
        const store = useAgentStore.getState();
        const agentId = getThreadAgentId(remoteId);
        const targetAgent = agentId && agentId !== getDefaultAgent() ? agentId : null;
        if (store.selectedAgentId !== targetAgent) {
          store.restoreSelectedAgent(targetAgent);
        }
        store.setChatViewMode('thread');
        aui.threads().switchToThread(remoteId);
        if (!cancelled) activatedSuffixRef.current = suffix;
      } catch (err) {
        console.warn('[ChatThreadRouting] Failed to open thread from URL:', err);
        if (!cancelled) onThreadGone();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [suffix, aui, onThreadGone, onOpenNotebookThread]);

  // Thread → URL: sidebar switch, first-message creation, title updates.
  const currentThreadId = useAgentStore((s) => s.currentThreadId);
  const currentThreadTitle = useAgentStore((s) => s.currentThreadTitle);
  const chatViewMode = useAgentStore((s) => s.chatViewMode);
  useEffect(() => {
    if (!currentThreadId) {
      // Thread went away (deleted / switched to a fresh draft) while its URL
      // is showing. Only fire once the slug actually resolved — during a cold
      // deep-link load currentThreadId is legitimately null.
      if (threadSlug && suffix && activatedSuffixRef.current === suffix) {
        // currentThreadId can null out for reasons other than genuine
        // deletion (e.g. an unrelated reset of assistant-ui's "main" thread
        // slot). Re-resolve before concluding the thread is actually gone.
        const remoteId = resolveThreadBySlugSuffix(suffix);
        if (remoteId) {
          void aui.threads().switchToThread(remoteId);
          return;
        }
        onThreadGone();
      }
      return;
    }
    // Overview showing (e.g. "Neuer Chat" clicked while the old thread is
    // still current): don't drag the URL back to the old thread.
    if (chatViewMode !== 'thread') return;
    const s = getThreadSlugSuffix(currentThreadId);
    // Legacy row that predates the suffix backfill: leave the URL alone.
    if (!s) return;
    const title =
      currentThreadTitle ??
      aui
        .threads()
        .getState()
        .threadItems.find((t) => t.remoteId === currentThreadId)?.title ??
      null;
    const slug = buildChatThreadSlug(title, s);
    if (slug === threadSlug) return;
    // Same thread, new title → replace; thread switch → push.
    onNavigateToThread(slug, { replace: suffix === s });
  }, [
    currentThreadId,
    currentThreadTitle,
    chatViewMode,
    threadSlug,
    suffix,
    aui,
    onNavigateToThread,
    onThreadGone,
  ]);

  return null;
}
