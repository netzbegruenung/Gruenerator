'use client';

import { ThreadListPrimitive, useAui, useAuiState } from '@assistant-ui/react';
import { Archive, ChevronDown, ChevronRight } from 'lucide-react';
import { useState, useCallback, useEffect, useRef, type ComponentType } from 'react';

import { cn } from '../lib/utils';

import {
  GrueneratorThreadListItem,
  GrueneratorArchivedThreadListItem,
} from './thread/ThreadListItem';

const threadComponents = { ThreadListItem: GrueneratorThreadListItem };
const archivedComponents = { ThreadListItem: GrueneratorArchivedThreadListItem };

const THREADS_EXPANDED_KEY = 'sidebar-threads-expanded';

interface PagedThreadItemsProps {
  archived?: boolean;
  components: { ThreadListItem: ComponentType };
}

/**
 * Renders the threads the runtime has loaded and asks it for the next page
 * (`loadMore`, THREAD_LIST_PAGE_SIZE rows at a time) whenever the "Mehr
 * anzeigen" button scrolls into view (or is clicked). The runtime holds only
 * the pages loaded so far: it scans that list on every composer state change,
 * so loading everything made typing lag for accounts with thousands of chats
 * (#5987). The observer uses the viewport as root, which also works inside the
 * host's own scroll region.
 */
function PagedThreadItems({ archived = false, components }: PagedThreadItemsProps) {
  const aui = useAui();
  const threadIds = useAuiState((s) =>
    archived ? s.threads.archivedThreadIds : s.threads.threadIds
  );
  const hasMore = useAuiState((s) => s.threads.hasMore);
  const isLoadingMore = useAuiState((s) => s.threads.isLoadingMore);
  const showMore = useCallback(() => {
    void aui.threads.loadMore();
  }, [aui]);

  const moreRef = useRef<HTMLButtonElement>(null);
  // `threadIds.length` re-subscribes after each page: an observer only reports
  // changes, so a button that stays in view after growing would never fire again.
  useEffect(() => {
    const node = moreRef.current;
    if (!hasMore || isLoadingMore || !node || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) showMore();
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, isLoadingMore, threadIds.length, showMore]);

  return (
    <>
      {threadIds.map((threadId, index) => (
        <ThreadListPrimitive.ItemByIndex
          key={threadId}
          index={index}
          archived={archived}
          components={components}
        />
      ))}
      {hasMore && (
        <button
          ref={moreRef}
          type="button"
          onClick={showMore}
          disabled={isLoadingMore}
          className="w-full rounded-md px-3 py-1.5 text-left text-xs text-foreground-muted transition-colors hover:text-foreground"
        >
          Mehr anzeigen
        </button>
      )}
    </>
  );
}

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

  const rootClass = noScroll ? 'flex flex-col' : 'flex flex-1 flex-col overflow-hidden';
  const innerClass = noScroll ? 'px-2' : 'flex-1 overflow-y-auto px-2 pt-2 scrollbar-thin';

  return (
    <ThreadListPrimitive.Root className={rootClass}>
      <div className={innerClass}>
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
            <PagedThreadItems components={threadComponents} />

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

              {showArchived && <PagedThreadItems archived components={archivedComponents} />}
            </div>
          </>
        )}
      </div>
    </ThreadListPrimitive.Root>
  );
}
