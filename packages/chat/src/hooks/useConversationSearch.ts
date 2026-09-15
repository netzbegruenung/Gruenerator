'use client';

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';

import {
  collectHits,
  CONVERSATION_SEARCH_MIN_QUERY_LENGTH,
  type ConversationHit,
} from '../lib/conversationSearch';

const HIGHLIGHT = 'gruenerator-search';
const HIGHLIGHT_ACTIVE = 'gruenerator-search-active';

interface HighlightRegistry {
  set(name: string, highlight: unknown): void;
  delete(name: string): void;
}

/** `Highlight`/`CSS.highlights` are not in this TS lib yet. */
function highlightRegistry(): HighlightRegistry | null {
  const css = (globalThis as { CSS?: { highlights?: HighlightRegistry } }).CSS;
  const ctor = (globalThis as { Highlight?: unknown }).Highlight;
  return css?.highlights && typeof ctor === 'function' ? css.highlights : null;
}

function makeHighlight(ranges: Range[]): unknown {
  const Ctor = (globalThis as { Highlight?: new (...r: Range[]) => unknown }).Highlight;
  return Ctor ? new Ctor(...ranges) : null;
}

function paint(hits: ConversationHit[], activeIndex: number): void {
  const registry = highlightRegistry();
  if (!registry) return;

  if (hits.length === 0) {
    registry.delete(HIGHLIGHT);
    registry.delete(HIGHLIGHT_ACTIVE);
    return;
  }

  const rest = hits.filter((_, i) => i !== activeIndex).map((hit) => hit.range);
  const active = hits[activeIndex];

  const all = makeHighlight(rest);
  if (all) registry.set(HIGHLIGHT, all);
  else registry.delete(HIGHLIGHT);

  const one = active ? makeHighlight([active.range]) : null;
  if (one) registry.set(HIGHLIGHT_ACTIVE, one);
  else registry.delete(HIGHLIGHT_ACTIVE);
}

function clearPaint(): void {
  const registry = highlightRegistry();
  registry?.delete(HIGHLIGHT);
  registry?.delete(HIGHLIGHT_ACTIVE);
}

/**
 * Find-in-conversation state.
 *
 * The DOM is both the index and the paint surface, so this hook never touches
 * the message store and never subscribes to the token stream — a MutationObserver
 * is the single recompute trigger, coalesced through one animation frame.
 *
 * Only ever mounted while the bar is open, so a closed search costs nothing:
 * no observer, no walk, no painted highlights.
 */
export function useConversationSearch(viewport: HTMLElement | null) {
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [revision, setRevision] = useState(0);

  // The input stays immediate; the walk runs on the deferred value.
  const deferredQuery = useDeferredValue(query);

  const hits = useMemo(() => {
    if (!viewport) return [];
    // `revision` is the dependency that matters: it ticks on every DOM change.
    void revision;
    return collectHits(viewport, deferredQuery, {
      rectOf: (range) => range.getBoundingClientRect(),
    });
  }, [viewport, deferredQuery, revision]);

  useEffect(() => {
    if (!viewport) return undefined;
    let frame = 0;
    const observer = new MutationObserver(() => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        setRevision((n) => n + 1);
      });
    });
    observer.observe(viewport, { childList: true, characterData: true, subtree: true });
    return () => {
      if (frame) cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [viewport]);

  // A shorter result list must not leave the cursor past its end.
  const clampedIndex = hits.length === 0 ? 0 : Math.min(activeIndex, hits.length - 1);

  useEffect(() => paint(hits, clampedIndex), [hits, clampedIndex]);

  useEffect(() => () => clearPaint(), []);

  const scrolledTo = useRef<string | null>(null);
  useEffect(() => {
    if (!viewport) return;
    const hit = hits[clampedIndex];
    if (!hit || scrolledTo.current === hit.id) return;
    scrolledTo.current = hit.id;
    // scrollTo on the box we already hold, not scrollIntoView, which walks up
    // and scrolls every scrollable ancestor including the page. Scrolling up
    // programmatically also reads as a user scroll to the runtime's autoscroll
    // (same scrollHeight, smaller scrollTop), which is what stops it yanking us
    // back to the bottom for the rest of a streaming run.
    viewport.scrollTo({ top: hit.top - viewport.clientHeight / 2, behavior: 'smooth' });
  }, [viewport, hits, clampedIndex]);

  const step = useCallback(
    (delta: number) => {
      setActiveIndex((current) => {
        if (hits.length === 0) return 0;
        const from = Math.min(current, hits.length - 1);
        return (from + delta + hits.length) % hits.length;
      });
    },
    [hits.length]
  );

  const changeQuery = useCallback((next: string) => {
    setQuery(next);
    setActiveIndex(0);
    scrolledTo.current = null;
  }, []);

  const reset = useCallback(() => {
    changeQuery('');
    clearPaint();
  }, [changeQuery]);

  return {
    query,
    hits,
    activeIndex: clampedIndex,
    searching: query.trim().length >= CONVERSATION_SEARCH_MIN_QUERY_LENGTH,
    /** True once the walk has caught up with what was typed. */
    settled: deferredQuery === query,
    changeQuery,
    step,
    reset,
  };
}
