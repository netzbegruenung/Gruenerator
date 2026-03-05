'use client';

import { createContext, useCallback, useContext } from 'react';
import type { Citation } from '../hooks/useChatGraphStream';
import { useChatConfigStore } from '../stores/chatConfigStore';

export type FetchFullTextFn = (url: string, collectionId: string) => Promise<string | null>;

export interface CitationContextValue {
  citations: Citation[];
  fetchFullText?: FetchFullTextFn;
}

const CitationContext = createContext<CitationContextValue>({ citations: [] });

export function CitationProvider({
  citations,
  fetchFullText,
  children,
}: {
  citations: Citation[];
  fetchFullText?: FetchFullTextFn;
  children: React.ReactNode;
}) {
  return (
    <CitationContext.Provider value={{ citations, fetchFullText }}>
      {children}
    </CitationContext.Provider>
  );
}

export function useCitations(): Citation[] {
  return useContext(CitationContext).citations;
}

export function useCitationContext(): CitationContextValue {
  return useContext(CitationContext);
}

/**
 * Hook that creates a fetchFullText function using the configured chat fetch.
 * Calls GET /api/documents/qdrant/system-full-text?url=...&collection=...
 */
export function useFetchFullText(): FetchFullTextFn {
  const chatFetch = useChatConfigStore((s) => s.fetch);

  return useCallback(
    async (sourceUrl: string, collectionId: string): Promise<string | null> => {
      try {
        const params = new URLSearchParams({ url: sourceUrl, collection: collectionId });
        const res = await chatFetch(`/api/documents/qdrant/system-full-text?${params}`);
        if (!res.ok) return null;
        const json = await res.json();
        return json?.data?.fullText ?? null;
      } catch {
        return null;
      }
    },
    [chatFetch]
  );
}
