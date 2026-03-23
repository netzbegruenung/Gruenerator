'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';

export interface CitationPanelTarget {
  documentId: string;
  documentTitle: string;
  chunkIndex: number;
  collectionId: string;
  sourceUrl?: string;
}

interface CitationPanelContextValue {
  isOpen: boolean;
  target: CitationPanelTarget | null;
  open: (target: CitationPanelTarget) => void;
  close: () => void;
}

const CitationPanelCtx = createContext<CitationPanelContextValue>({
  isOpen: false,
  target: null,
  open: () => {},
  close: () => {},
});

export function CitationPanelProvider({ children }: { children: ReactNode }) {
  const [target, setTarget] = useState<CitationPanelTarget | null>(null);

  const open = useCallback((t: CitationPanelTarget) => {
    setTarget(t);
  }, []);

  const close = useCallback(() => {
    setTarget(null);
  }, []);

  const value = useMemo(
    () => ({ isOpen: target !== null, target, open, close }),
    [target, open, close]
  );

  return <CitationPanelCtx.Provider value={value}>{children}</CitationPanelCtx.Provider>;
}

export function useCitationPanel(): CitationPanelContextValue {
  return useContext(CitationPanelCtx);
}
