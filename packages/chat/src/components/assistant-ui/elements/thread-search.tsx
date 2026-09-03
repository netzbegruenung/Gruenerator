/**
 * Vendored from the assistant-ui Elements registry (@assistant-ui/elements-thread-search).
 *
 * Structurally rewritten, cosmetically upstream: what survives is the layout
 * rhythm, the `surfaces` token usage and the pinned/group shape. SEVEN
 * deviations — re-syncing must re-apply all of them:
 *   1. imports go through ./_adapter (no "@/" alias here);
 *   2. upstream's own `.includes()` filter is GONE. Matching happens on the
 *      server, over message bodies; re-filtering those hits against the raw
 *      input drops every content match — the same reason GlobalSearchDialog
 *      passes `shouldFilter={false}` to cmdk. Passing `query=""` instead is not
 *      an option: `query` IS the input's value;
 *   3. arrow-key navigation removed. Upstream's `move()` calls the same
 *      `onSelect` as a click, so ArrowDown navigated. A separate highlight step
 *      would owe a full combobox (`aria-activedescendant`); the rows are
 *      natively tab-reachable instead, and `activeId` means what it means on
 *      every other row in this sidebar — the thread that is open;
 *   4. the empty state waits for `minQueryLength`, and a `status` slot carries
 *      loading/error. Upstream assumes an always-populated local array;
 *   5. German strings;
 *   6. rows are <a href> with an onClick, not <button> — same argument as
 *      ThreadListItem: the row carries its destination, so ⌘-click and
 *      middle-click open a tab;
 *   7. muted tones re-tokenized off `text-foreground/NN`, which composites to
 *      ~2:1 in light mode. See docs/CLAUDE-a11y.md.
 */
'use client';

import { PinIcon, SearchIcon } from 'lucide-react';

import { cn } from './_adapter';
import { field, mono, paper } from './surfaces';

import type { ComponentProps, MouseEvent, ReactNode } from 'react';

export interface SearchableThread {
  id: string;
  title: string;
  /** Section heading. Threads sharing one render under a single header. */
  group: string;
  preview: string;
  /** In-app path; the row is a real link so the browser can open it its way. */
  href: string;
  pinned?: boolean;
}

export function ThreadSearch({
  threads,
  query,
  activeId,
  minQueryLength,
  status,
  onQueryChange,
  onSelect,
  className,
  ...props
}: Omit<
  ComponentProps<'div'>,
  'children' | 'threads' | 'query' | 'activeId' | 'onQueryChange' | 'onSelect'
> & {
  /** Already matched by the server. Deviation 2: never filtered again here. */
  threads: readonly SearchableThread[];
  query: string;
  activeId: string | null;
  minQueryLength: number;
  /** Loading or error line, shown where the empty state would sit. */
  status?: ReactNode;
  onQueryChange?: (query: string) => void;
  onSelect?: (thread: SearchableThread) => void;
}) {
  const pinned = threads.filter((thread) => thread.pinned);
  const groups = [...new Set(threads.filter((t) => !t.pinned).map((t) => t.group))];
  const searching = query.trim().length >= minQueryLength;

  const open = (thread: SearchableThread) => (event: MouseEvent) => {
    // Leave new-tab / new-window / "open in background" to the browser.
    if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    onSelect?.(thread);
  };

  const row = (thread: SearchableThread) => (
    <a
      key={thread.id}
      href={thread.href}
      onClick={open(thread)}
      className={cn(
        'flex flex-col gap-0.5 rounded-md px-3 py-1.5 text-start transition-colors',
        thread.id === activeId
          ? 'bg-secondary-100 dark:bg-secondary-800/60'
          : 'hover:bg-secondary-50 dark:hover:bg-secondary-800/40'
      )}
    >
      <span className="flex items-center gap-1.5">
        {thread.pinned && (
          <PinIcon className="size-2.5 shrink-0 text-foreground-muted" aria-hidden="true" />
        )}
        <span className="min-w-0 flex-1 truncate text-[13px]">{thread.title}</span>
      </span>
      <span className="truncate text-xs text-foreground-muted">{thread.preview}</span>
    </a>
  );

  return (
    <div
      data-slot="thread-search"
      className={cn(paper, 'flex w-full flex-col gap-1.5 rounded-2xl p-3', className)}
      {...props}
    >
      <div className={cn(field, 'flex items-center gap-2 rounded-xl px-2.5 py-1.5')}>
        <SearchIcon className="size-3.5 shrink-0 text-foreground-muted" aria-hidden="true" />
        <input
          value={query}
          onChange={(event) => onQueryChange?.(event.target.value)}
          placeholder="Chats durchsuchen"
          aria-label="Chats durchsuchen"
          className="min-w-0 flex-1 bg-transparent text-[13px] text-foreground outline-none placeholder:text-foreground-muted"
        />
      </div>

      {pinned.length > 0 && (
        <div className="flex flex-col">
          <span className={cn(mono, 'px-3 pb-1 text-foreground-muted')}>Angeheftet</span>
          {pinned.map(row)}
        </div>
      )}

      {groups.map((group) => (
        <div key={group} className="flex flex-col">
          <span className={cn(mono, 'px-3 pb-1 text-foreground-muted')}>{group}</span>
          {threads.filter((thread) => !thread.pinned && thread.group === group).map(row)}
        </div>
      ))}

      {status}

      {!status && searching && threads.length === 0 && (
        <span className="px-3 py-4 text-center text-xs text-foreground-muted">
          Keine Chats für «{query.trim()}» gefunden
        </span>
      )}
    </div>
  );
}
