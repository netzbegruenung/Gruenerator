import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useChatConfigStore } from '../stores/chatConfigStore';
import type {
  NotebookCollectionItem,
  DocumentSearchResult,
  UserDocumentItem,
  UserTextItem,
} from '../lib/documentMentionables';

const STALE_TIME = 5 * 60 * 1000;

interface RawDocument {
  id: string;
  title?: string;
  name?: string;
  page_count?: number;
  pageCount?: number;
  source_type?: string;
  sourceType?: string;
}
interface RawCollection {
  id: string;
  name: string;
  description?: string | null;
  document_count?: number;
  documentCount?: number;
  documents?: RawDocument[];
}

function useConfigFetch() {
  return useChatConfigStore((s) => s.fetch);
}

export function useNotebookCollectionsQuery(enabled: boolean) {
  const configFetch = useConfigFetch();
  return useQuery<NotebookCollectionItem[]>({
    queryKey: ['file-mention', 'notebook-collections'],
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    queryFn: async () => {
      const response = await configFetch('/api/auth/notebook-collections');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const json = (await response.json()) as RawCollection[] | { collections: RawCollection[] };
      const data: RawCollection[] = Array.isArray(json) ? json : json.collections || [];
      return data.map<NotebookCollectionItem>((c) => ({
        id: c.id,
        name: c.name,
        description: c.description || null,
        documentCount: c.document_count ?? c.documentCount ?? c.documents?.length ?? 0,
        documents: (c.documents || []).map((d) => ({
          id: d.id,
          title: d.title || d.name || 'Unbekanntes Dokument',
          pageCount: d.page_count ?? d.pageCount,
          sourceType: d.source_type ?? d.sourceType,
        })),
      }));
    },
  });
}

interface CombinedContent {
  documents: UserDocumentItem[];
  texts: UserTextItem[];
}

export function useCombinedContentQuery(enabled: boolean) {
  const configFetch = useConfigFetch();
  return useQuery<CombinedContent>({
    queryKey: ['file-mention', 'combined-content'],
    enabled,
    staleTime: STALE_TIME,
    retry: 1,
    queryFn: async () => {
      const response = await configFetch('/api/auth/documents/combined-content');
      if (!response.ok) return { documents: [], texts: [] };

      interface RawDocItem {
        id: string;
        title?: string;
        filename?: string;
        source_type?: string;
        sourceType?: string;
        created_at?: string;
        createdAt?: string;
        content_preview?: string;
        contentPreview?: string;
      }
      interface RawTextItem {
        id: string;
        title?: string;
        document_type?: string;
        documentType?: string;
        word_count?: number;
        wordCount?: number;
        created_at?: string;
        createdAt?: string;
      }
      interface CombinedContentResponse {
        data?: { documents?: RawDocItem[]; texts?: RawTextItem[] };
      }
      const json = (await response.json()) as CombinedContentResponse;
      const rawDocs = json.data?.documents || [];
      const rawTexts = json.data?.texts || [];

      const documents: UserDocumentItem[] = rawDocs.map((d) => ({
        id: d.id,
        title: d.title || d.filename || 'Dokument',
        filename: d.filename,
        sourceType: d.source_type ?? d.sourceType,
        createdAt: d.created_at ?? d.createdAt ?? '',
        contentPreview: d.content_preview ?? d.contentPreview,
      }));

      const texts: UserTextItem[] = rawTexts.map((t) => ({
        id: t.id,
        title: t.title || 'Unbenannter Text',
        documentType: t.document_type ?? t.documentType ?? 'text',
        wordCount: t.word_count ?? t.wordCount ?? 0,
        createdAt: t.created_at ?? t.createdAt ?? '',
      }));

      return { documents, texts };
    },
  });
}

export function useCollectionSearch() {
  const configFetch = useConfigFetch();
  const queryClient = useQueryClient();
  return useCallback(
    async (collectionId: string, query: string): Promise<DocumentSearchResult[]> => {
      if (!query.trim()) return [];
      try {
        return await queryClient.fetchQuery<DocumentSearchResult[]>({
          queryKey: ['file-mention', 'search', collectionId, query],
          staleTime: 30_000,
          queryFn: async () => {
            const response = await configFetch(
              `/api/auth/notebook-collections/${collectionId}/search?q=${encodeURIComponent(query)}`
            );
            if (!response.ok) return [];
            return (await response.json()) as DocumentSearchResult[];
          },
        });
      } catch {
        return [];
      }
    },
    [configFetch, queryClient]
  );
}

export function useFileMentionData(enabled: boolean) {
  const collectionsQuery = useNotebookCollectionsQuery(enabled);
  const contentQuery = useCombinedContentQuery(enabled);
  const searchInCollection = useCollectionSearch();

  return useMemo(
    () => ({
      collections: collectionsQuery.data ?? [],
      documents: contentQuery.data?.documents ?? [],
      texts: contentQuery.data?.texts ?? [],
      loadingCollections: collectionsQuery.isLoading,
      loadingContent: contentQuery.isLoading,
      searchInCollection,
    }),
    [
      collectionsQuery.data,
      collectionsQuery.isLoading,
      contentQuery.data,
      contentQuery.isLoading,
      searchInCollection,
    ]
  );
}
