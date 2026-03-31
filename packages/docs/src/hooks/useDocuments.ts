import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo } from 'react';

import { createDocsApiClient, useDocsAdapter } from '../context/DocsContext';
import { type Document } from '../stores/documentStore';

export const docsKeys = {
  all: ['documents'] as const,
  list: () => ['documents', 'list'] as const,
};

export function useDocuments() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);

  return useQuery({
    queryKey: docsKeys.list(),
    queryFn: () => apiClient.get<Document[]>('/docs'),
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
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => apiClient.delete(`/docs/${id}`),
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
  });
}

export function useUpdateDocument() {
  const adapter = useDocsAdapter();
  const apiClient = useMemo(() => createDocsApiClient(adapter), [adapter]);
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      id,
      updates,
    }: {
      id: string;
      updates: Partial<Pick<Document, 'title' | 'folder_id'>>;
    }) => apiClient.put<Document>(`/docs/${id}`, updates),
    onSuccess: (updatedDoc) => {
      queryClient.setQueryData<Document[]>(docsKeys.list(), (old) =>
        old?.map((doc) => (doc.id === updatedDoc.id ? updatedDoc : doc))
      );
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
