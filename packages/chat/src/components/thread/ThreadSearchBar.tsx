'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';

import { useConversationSearch } from '../../hooks/useConversationSearch';
import { cn } from '../../lib/utils';
import {
  ConversationSearch,
  ConversationSearchRail,
} from '../assistant-ui/elements/conversation-search';

import type { KeyboardEvent, RefObject } from 'react';

interface ThreadSearchBarProps {
  viewportRef: RefObject<HTMLDivElement | null>;
  /** Changes on every Cmd+F; focuses and selects the field. */
  focusToken: number;
  onClose: () => void;
  className?: string;
}

export function ThreadSearchBar({
  viewportRef,
  focusToken,
  onClose,
  className,
}: ThreadSearchBarProps) {
  const [viewport, setViewport] = useState<HTMLDivElement | null>(null);
  const [viewportHeight, setViewportHeight] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // The ref is filled by the time this mounts (the bar renders as a sibling of
  // an already-committed Viewport), but state is what re-runs the hook.
  useLayoutEffect(() => setViewport(viewportRef.current), [viewportRef]);

  useEffect(() => {
    if (!viewport) return undefined;
    const measure = () => setViewportHeight(viewport.clientHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [viewport]);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, [focusToken]);

  const { query, hits, activeIndex, searching, settled, changeQuery, step, reset } =
    useConversationSearch(viewport);

  // The message-level anchor for browsers without the Highlight API. Set on the
  // DOM rather than through React: these nodes belong to the message list.
  const active = hits[activeIndex];
  useEffect(() => {
    if (!viewport) return undefined;
    const marked = active
      ? viewport.querySelector(`[data-message-id="${CSS.escape(active.messageId)}"]`)
      : null;
    marked?.setAttribute('data-aui-search-active', '');
    return () => marked?.removeAttribute('data-aui-search-active');
  }, [viewport, active]);

  const close = () => {
    reset();
    onClose();
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'Enter') {
      event.preventDefault();
      step(event.shiftKey ? -1 : 1);
      return;
    }
    if (event.key === 'Escape') {
      event.preventDefault();
      // The sidebar collapses on a document-level Escape and does not check
      // defaultPrevented. React attaches its listener below document, so
      // stopping here keeps the event away from it entirely.
      event.stopPropagation();
      close();
    }
  };

  let announcement = '';
  if (searching && settled) {
    if (hits.length === 0) announcement = 'Keine Treffer';
    else announcement = `Treffer ${activeIndex + 1} von ${hits.length}: ${active?.match ?? ''}`;
  }

  return (
    <>
      <div role="search" aria-label="Im Chat suchen" className={className}>
        <ConversationSearch
          query={query}
          hits={hits}
          activeIndex={activeIndex}
          inputRef={inputRef}
          onQueryChange={changeQuery}
          onStep={step}
          onClose={close}
          onInputKeyDown={onInputKeyDown}
        />
        <span aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </span>
      </div>

      {hits.length > 0 && viewportHeight > 0 && (
        <ConversationSearchRail
          hits={hits}
          activeIndex={activeIndex}
          className={cn('absolute top-0 right-1.5 z-20')}
          style={{ height: viewportHeight }}
        />
      )}
    </>
  );
}
