'use client';

import { ThreadListPrimitive } from '@assistant-ui/react';
import { Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useCallback } from 'react';

import { THREAD_SEARCH_MIN_QUERY_LENGTH } from '../hooks/useThreadSearch';
import { cn } from '../lib/utils';

import { ChatThreadSearch } from './thread/ChatThreadSearch';
import {
  GrueneratorThreadListItem,
  GrueneratorArchivedThreadListItem,
} from './thread/ThreadListItem';

const threadComponents = { ThreadListItem: GrueneratorThreadListItem };
const archivedComponents = { ThreadListItem: GrueneratorArchivedThreadListItem };

const THREADS_EXPANDED_KEY = 'sidebar-threads-expanded';

interface ChatThreadListProps {
  /**
   * When true, the list renders without its own scroll container so a parent
   * can manage scrolling for the entire sidebar (ChatGPT-style unified scroll).
   * Default false preserves the original behavior for callers that don't wrap
   * the list in their own scroll region.
   */
  noScroll?: boolean;
}

export function ChatThreadList({ noScroll = false }: ChatThreadListProps = {}) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const toggleArchived = useCallback(() => setShowArchived((prev) => !prev), []);

  const [isExpanded, setIsExpanded] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem(THREADS_EXPANDED_KEY);
      return stored === null ? true : stored === '1';
    } catch {
      return true;
    }
  });
  const toggleExpanded = useCallback(() => {
    setIsExpanded((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(THREADS_EXPANDED_KEY, next ? '1' : '0');
      } catch {
        // localStorage unavailable
      }
      return next;
    });
  }, []);

  const isFiltering = query.trim().length >= THREAD_SEARCH_MIN_QUERY_LENGTH;

  const rootClass = noScroll ? 'flex flex-col' : 'flex flex-1 flex-col overflow-hidden';
  const innerClass = noScroll ? 'px-2' : 'flex-1 overflow-y-auto px-2 pt-2 scrollbar-thin';

  return (
    <ThreadListPrimitive.Root className={rootClass}>
      <div className={innerClass}>
        <ChatThreadSearch query={query} onQueryChange={setQuery} />

        {/* While a query is running the list is REPLACED, not hidden:
            ThreadListPrimitive.Items takes no predicate, and `display:none` on
            readable content is the a11y audit's biggest single finding. */}
        {!isFiltering && (
          <>
            <button
              type="button"
              onClick={toggleExpanded}
              aria-expanded={isExpanded}
              className="flex w-full items-center gap-1.5 px-3 py-1 text-xs font-medium text-grey-500 hover:text-foreground transition-colors"
            >
              <span>Chats</span>
              <ChevronRight
                className={cn('h-3 w-3 shrink-0 transition-transform', isExpanded && 'rotate-90')}
                aria-hidden="true"
              />
            </button>

            {isExpanded && (
              <>
                <ThreadListPrimitive.Items components={threadComponents} />

                <div className="mt-2">
                  <button
                    onClick={toggleArchived}
                    className="flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-xs font-medium text-foreground-muted transition-colors hover:text-foreground"
                  >
                    <Archive className="h-3.5 w-3.5" />
                    Archiviert
                    <ChevronDown
                      className={cn(
                        'ml-auto h-3.5 w-3.5 transition-transform',
                        showArchived && 'rotate-180'
                      )}
                    />
                  </button>

                  {showArchived && (
                    <ThreadListPrimitive.Items archived components={archivedComponents} />
                  )}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </ThreadListPrimitive.Root>
  );
}
