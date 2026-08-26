import { deriveIndexingState, transformedCollectionSchema } from '@gruenerator/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useCallback, useMemo } from 'react';
import { z } from 'zod';

import { useChatConfigStore } from '../stores/chatConfigStore';

import type {
  NotebookCollectionItem,
  DocumentSearchResult,
  UserDocumentItem,
  UserTextItem,
} from '../lib/documentMentionables';

const STALE_TIME = 5 * 60 * 1000;

/**
 * Only the fields the picker actually shows, picked off the contract's
 * `transformedCollectionSchema` so the shape is derived rather than transcribed.
 * Picking instead of using `collectionsListResponseSchema` whole keeps the blast
 * radius small: a drift in a field nobody here reads must not take the mention
 * list down.
 */
const mentionCollectionSchema = transformedCollectionSchema.pick({
  id: true,
  name: true,
  description: true,
  document_count: true,
  documents: true,
  indexing_state: true,
});

const mentionCollectionsResponseSchema = z.object({
  collections: z.array(mentionCollectionSchema),
});

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
      // Parsing rather than casting, for the same reason the `!ok` branch above
      // throws: a silently mistyped payload renders exactly like "you have no
      // notebooks", which is the failure mode this file already had once.
      const { collections } = mentionCollectionsResponseSchema.parse(await response.json());
      return collections.map<NotebookCollectionItem>((c) => ({
        id: c.id,
        name: c.name,
        description: c.description,
        documentCount: c.document_count,
        // A backend predating `indexing_state` still answers here, so fall back
        // to deriving it — same fallback the web notebook list uses. The list
        // response carries no `vector_count`, so the derivation trusts `status`.
        indexingState: c.indexing_state ?? deriveIndexingState(c.documents),
        documents: c.documents.map((d) => ({
          id: d.id,
          title: d.title || 'Unbekanntes Dokument',
          pageCount: d.page_count ?? null,
          sourceType: d.source_type ?? null,
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
      // `/api/documents`, NOT `/api/auth/documents`: the authRouter has no
      // `documents` branch, so the old path never resolved — and returning an
      // empty result on `!ok` made that 404 look like an empty account.
      const response = await configFetch('/api/documents/combined-content');
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

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

  // The `*Failed` flags exist so a broken endpoint cannot keep passing for an
  // empty account: every consumer renders an empty list identically to a
  // successful "you have no files", which is what hid the 404 above.
  return useMemo(
    () => ({
      collections: collectionsQuery.data ?? [],
      documents: contentQuery.data?.documents ?? [],
      texts: contentQuery.data?.texts ?? [],
      loadingCollections: collectionsQuery.isLoading,
      loadingContent: contentQuery.isLoading,
      collectionsFailed: collectionsQuery.isError,
      contentFailed: contentQuery.isError,
      searchInCollection,
    }),
    [
      collectionsQuery.data,
      collectionsQuery.isLoading,
      collectionsQuery.isError,
      contentQuery.data,
      contentQuery.isLoading,
      contentQuery.isError,
      searchInCollection,
    ]
  );
}
