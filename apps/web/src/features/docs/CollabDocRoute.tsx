import { type Document } from '@gruenerator/docs';
import { Skeleton } from '@gruenerator/ui';
import { useQuery } from '@tanstack/react-query';
import { lazy, Suspense } from 'react';
import { useParams } from 'react-router-dom';

import { platformFetch } from '../../utils/platformFetch';

import { webAppDocsAdapter } from './docsAdapter';

const DocsEditorPage = lazy(() => import('./DocsEditorPage'));
const SheetsEditorPage = lazy(() => import('../sheets/SheetsEditorPage'));

const EditorSkeleton = () => (
  <div className="flex flex-col h-full">
    <div className="flex items-center gap-sm px-md py-xs border-b border-grey-200 dark:border-grey-700">
      <Skeleton className="h-5 w-48" />
      <div className="ml-auto flex gap-xs">
        <Skeleton className="h-8 w-8 rounded-md" />
        <Skeleton className="h-8 w-8 rounded-md" />
      </div>
    </div>
    <div className="flex-1 max-w-[720px] mx-auto w-full px-md py-lg">
      <Skeleton className="h-8 w-3/4 mb-md" />
      <Skeleton className="h-4 w-full mb-sm" />
      <Skeleton className="h-4 w-5/6 mb-sm" />
    </div>
  </div>
);

/**
 * `/docs/:id` dispatcher: resolves the document once (same query key the
 * editor pages use, so React Query dedupes) and mounts the matching editor —
 * BlockNote for text docs, Univer for `document_subtype === 'sheets'`. Keeps
 * the two editors in separate lazy chunks.
 */
export default function CollabDocRoute() {
  const { id } = useParams<{ id: string }>();
  const API_BASE = webAppDocsAdapter.getApiBaseUrl();

  const { data: docData, isLoading } = useQuery<Document | null>({
    queryKey: ['document', id],
    queryFn: async () => {
      const res = await platformFetch(`${API_BASE}/docs/resolve/${id}`, {
        credentials: 'include',
      });
      if (!res.ok) return null;
      return (await res.json()) as Document;
    },
    enabled: !!id,
    retry: false,
    staleTime: 30_000,
  });

  if (isLoading) return <EditorSkeleton />;

  const Editor = docData?.document_subtype === 'sheets' ? SheetsEditorPage : DocsEditorPage;
  return (
    <Suspense fallback={<EditorSkeleton />}>
      <Editor />
    </Suspense>
  );
}
