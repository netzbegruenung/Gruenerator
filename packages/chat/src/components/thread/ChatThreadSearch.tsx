'use client';

import { useAuiState } from '@assistant-ui/react';
import { useMemo } from 'react';

import { useChatNavigation } from '../../context/ChatNavigationContext';
import {
  bucketLabel,
  THREAD_SEARCH_MIN_QUERY_LENGTH,
  useThreadSearch,
} from '../../hooks/useThreadSearch';
import { buildThreadPath } from '../../lib/threadPath';
import { useAgentStore } from '../../stores/chatStore';
import useChatPinsStore from '../../stores/useChatPinsStore';
import { ShimmerLabel } from '../assistant-ui/elements/surfaces';
import { ThreadSearch, type SearchableThread } from '../assistant-ui/elements/thread-search';

import type { KeyboardEvent } from 'react';

interface ChatThreadSearchProps {
  query: string;
  onQueryChange: (query: string) => void;
}

export function ChatThreadSearch({ query, onQueryChange }: ChatThreadSearchProps) {
  const { items, isSearching, isError } = useThreadSearch(query);
  const pinnedIds = useChatPinsStore((s) => s.pinnedIds);
  const nav = useChatNavigation();

  const threads: SearchableThread[] = useMemo(
    () =>
      items.map((item) => ({
        id: item.threadId,
        title: item.title,
        preview: item.snippet,
        group: bucketLabel(item.matchedAt),
        href: buildThreadPath(item.threadId, item.title),
        pinned: pinnedIds.includes(item.threadId),
      })),
    [items, pinnedIds]
  );

  // Which thread is open comes from the runtime, not from the URL: the row is
  // matched by remote id, so a slug rename cannot un-highlight it. The store
  // scope's ThreadListItemState carries no `isMain`, hence the id comparison.
  const activeId = useAuiState(
    (s) =>
      s.threads.threadItems.find((item) => item.id === s.threads.mainThreadId)?.remoteId ?? null
  );

  const handleSelect = (thread: SearchableThread) => {
    useAgentStore.getState().setChatViewMode('thread');
    // Navigation only, never switchTo(): the URL is the single source of truth
    // for which thread is open, and doing both raced (see ThreadListItem).
    nav?.navigate(thread.href);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Escape' || query === '') return;
    event.preventDefault();
    // The sidebar collapses on a document-level Escape and does not check
    // defaultPrevented; React attaches below document, so stopping here keeps
    // the event away from it entirely.
    event.stopPropagation();
    onQueryChange('');
  };

  const searching = query.trim().length >= THREAD_SEARCH_MIN_QUERY_LENGTH;

  let status = null;
  if (isError) {
    status = (
      <span className="px-3 py-4 text-center text-xs text-destructive">Suche fehlgeschlagen</span>
    );
  } else if (isSearching && threads.length === 0) {
    status = (
      <ShimmerLabel className="px-3 py-4 text-center text-xs text-foreground-muted">
        Suche läuft…
      </ShimmerLabel>
    );
  }

  return (
    <>
      <ThreadSearch
        threads={threads}
        query={query}
        activeId={activeId}
        minQueryLength={THREAD_SEARCH_MIN_QUERY_LENGTH}
        onQueryChange={onQueryChange}
        onSelect={handleSelect}
        onKeyDown={handleKeyDown}
        status={status}
        className="border-0 bg-transparent p-0 dark:bg-transparent"
      />
      {/* The accessible substitute for the arrow-key cursor upstream had. */}
      <span aria-live="polite" className="sr-only">
        {searching && !isSearching
          ? threads.length === 1
            ? '1 Chat gefunden'
            : `${threads.length} Chats gefunden`
          : ''}
      </span>
    </>
  );
}
