'use client';

import { createContext, useContext } from 'react';
import type { Citation } from '../hooks/useChatGraphStream';

const CitationContext = createContext<Citation[]>([]);

export function CitationProvider({
  citations,
  children,
}: {
  citations: Citation[];
  children: React.ReactNode;
}) {
  return <CitationContext.Provider value={citations}>{children}</CitationContext.Provider>;
}

export function useCitations(): Citation[] {
  return useContext(CitationContext);
}
