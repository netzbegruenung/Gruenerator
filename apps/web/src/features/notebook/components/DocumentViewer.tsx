import { ArrowLeft, FileText, Loader2 } from 'lucide-react';
import { Suspense, lazy, useEffect } from 'react';

import { useDocumentContent } from '../hooks/useDocumentContent';

const ReactMarkdown = lazy(() => import('react-markdown'));

interface DocumentViewerProps {
  documentId: string;
  documentTitle: string;
  onClose: () => void;
}

export function DocumentViewer({ documentId, documentTitle, onClose }: DocumentViewerProps) {
  const { content, isLoading, error, fetchContent, reset } = useDocumentContent();

  useEffect(() => {
    fetchContent(documentId);
    return reset;
  }, [documentId, fetchContent, reset]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-background">
      <header className="flex items-center gap-3 border-b border-border px-4 py-3">
        <button
          onClick={onClose}
          className="flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <FileText className="h-4 w-4 shrink-0 text-foreground-muted" />
          <span className="truncate text-sm font-medium">{documentTitle}</span>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[48rem] px-6 py-6">
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-foreground-muted" />
              <span className="ml-2 text-sm text-foreground-muted">Dokument wird geladen…</span>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {content && (
            <Suspense
              fallback={
                <div className="flex items-center justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-foreground-muted" />
                </div>
              }
            >
              <article className="prose prose-sm max-w-none dark:prose-invert prose-headings:text-foreground prose-p:text-foreground prose-a:text-primary-600">
                <ReactMarkdown>{content}</ReactMarkdown>
              </article>
            </Suspense>
          )}
        </div>
      </div>
    </div>
  );
}
