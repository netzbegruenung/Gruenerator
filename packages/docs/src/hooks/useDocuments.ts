import { getContractsClient } from '@gruenerator/shared/api';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createDocsApiClient, useDocsAdapter } from '../context/DocsContext';
import { type Document } from '../stores/documentStore';
import { useDocumentCacheStore } from '../stores/documentCacheStore';

export const docsKeys = {
  all: ['documents'] as const,
  list: () => ['documents', 'list'] as const,
};

export function useDocuments() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const setCachedDocs = useDocumentCacheStore((s) => s.setCachedDocs);

  return useQuery({
    queryKey: docsKeys.list(),
    queryFn: async () => {
      const docs = await apiClient.get<Document[]>('/docs');
      setCachedDocs(docs);
      return docs;
    },
    placeholderData: () => {
      const cached = useDocumentCacheStore.getState().cachedDocs;
      return cached.length > 0 ? (cached as Document[]) : undefined;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useCreateDocument() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      title = 'Neues Dokument',
      folderId = null,
      documentSubtype = 'blank',
    }: {
      title?: string;
      folderId?: string | null;
      documentSubtype?: string;
    }) =>
      apiClient.post<Document>('/docs', {
        title,
        folder_id: folderId,
        document_subtype: documentSubtype,
      }),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old ? [newDoc, ...old] : [newDoc]
      );
    },
  });
}

export function useDeleteDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: string) => {
      const res = await getContractsClient().docs.deleteDocument({ params: { id } });
      if (res.status !== 200) throw new Error(`Delete failed (${res.status})`);
      return res.body;
    },
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: docsKeys.list() });
      const previous = queryClient.getQueryData<Document[]>(docsKeys.list());
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old?.filter((doc) => doc.id !== id)
      );
      return { previous };
    },
    onError: (_err, _id, context) => {
      if (context?.previous) {
        queryClient.setQueryData(docsKeys.list(), context.previous);
      }
    },
    // Reconcile with the server after the optimistic remove (success or rollback).
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: docsKeys.list() });
    },
  });
}

export function useUpdateDocument() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Document, 'title' | 'folder_id'>>;
    }) => {
      const res = await getContractsClient().docs.updateDocument({ params: { id }, body: updates });
      if (res.status !== 200) throw new Error(`Update failed (${res.status})`);
      // The contract's document type is a narrower core of the richer frontend
      // Document (extra wolke_*/last_edited_at fields); the response carries them.
      return res.body as unknown as Document;
    },
    onSuccess: (updatedDoc) => {
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old?.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc))
      );
      void queryClient.invalidateQueries({ queryKey: docsKeys.list() });
    },
  });
}

export function useDuplicateDocument() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.post<Document>(`/docs/${id}/duplicate`),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old ? [newDoc, ...old] : [newDoc]
      );
    },
  });
}

export function useGenerateDocument() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (description: string) =>
      apiClient.post<Document>('/docs/generate', { description }),
    onSuccess: (newDoc) => {
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old ? [newDoc, ...old] : [newDoc]
      );
    },
  });
}
