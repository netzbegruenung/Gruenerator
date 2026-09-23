'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

/**
 * One openable citation. The panel navigates between the sources of a single
 * answer, so the opener hands over the whole list rather than the clicked one —
 * without it the footer could not say "Zitat 2 von 5" or step to the next.
 */
export interface CitationPanelSource {
  /** The [N] the answer printed. Repeated as the panel's chip so the jump back
   *  into the text is unambiguous when several sources share a document. */
  citationId: number;
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  collectionId: string;
  sourceUrl?: string;
  /** The passage the answer actually quoted — highlighted inside the chunk. */
  citedText?: string;
  collectionName?: string;
  contentType?: string;
}

interface CitationPanelContextValue {
  isOpen: boolean;
  sources: CitationPanelSource[];
  activeIndex: number;
  source: CitationPanelSource | null;
  open: (sources: CitationPanelSource[], activeIndex: number) => void;
  goTo: (index: number) => void;
  close: () => void;
}

const NO_SOURCES: CitationPanelSource[] = [];

const CitationPanelCtx = createContext<CitationPanelContextValue>({
  isOpen: false,
  sources: NO_SOURCES,
  activeIndex: -1,
  source: null,
  open: () => {},
  goTo: () => {},
  close: () => {},
});

interface PanelState {
  sources: CitationPanelSource[];
  activeIndex: number;
}

export function CitationPanelProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<PanelState | null>(null);

  const open = useCallback((sources: CitationPanelSource[], activeIndex: number) => {
    if (activeIndex < 0 || activeIndex >= sources.length) return;
    setState({ sources, activeIndex });
  }, []);

  const goTo = useCallback((index: number) => {
    setState((s) =>
      s && index >= 0 && index < s.sources.length ? { ...s, activeIndex: index } : s
    );
  }, []);

  const close = useCallback(() => setState(null), []);

  const value = useMemo<CitationPanelContextValue>(
    () => ({
      isOpen: state !== null,
      sources: state?.sources ?? NO_SOURCES,
      activeIndex: state?.activeIndex ?? -1,
      source: state?.sources[state.activeIndex] ?? null,
      open,
      goTo,
      close,
    }),
    [state, open, goTo, close]
  );

  return <CitationPanelCtx.Provider value={value}>{children}</CitationPanelCtx.Provider>;
}

export function useCitationPanel(): CitationPanelContextValue {
  return useContext(CitationPanelCtx);
}
