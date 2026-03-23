'use client';

import { memo, useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { Skeleton } from '@gruenerator/ui';
import { useCitationPanel } from '../../context/CitationPanelContext';
import { useChatConfigStore } from '../../stores/chatConfigStore';

interface ChunkData {
  index: number;
  text: string;
  tokens: number;
  pageNumber?: number | null;
}

interface ChunksResponse {
  success: boolean;
  document_id: string;
  document_title: string;
  chunk_count: number;
  chunks: ChunkData[];
}

export const CitationSidePanel = memo(function CitationSidePanel() {
  const { isOpen, target, close } = useCitationPanel();
  const [chunks, setChunks] = useState<ChunkData[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Scroll cited chunk into view when it mounts
  const citedRefCallback = useCallback((el: HTMLElement | null) => {
    if (el) {
      setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 100);
    }
  }, []);

  // Fetch chunks when target document changes (external data sync)
  const targetKey = target ? `${target.documentId}:${target.collectionId}` : null;
  useEffect(() => {
    if (!target || !targetKey) return;

    const abortController = new AbortController();
    const { fetch: configFetch } = useChatConfigStore.getState();
    const params = target.collectionId
      ? `?collectionId=${encodeURIComponent(target.collectionId)}`
      : '';

    setLoading(true);
    setError(null);
    setChunks([]);

    configFetch(`/api/documents/${target.documentId}/chunks${params}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
      signal: abortController.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data: ChunksResponse = await response.json();
        if (data.success && data.chunks.length > 0) {
          setChunks(data.chunks);
        } else {
          setError('Keine Inhalte gefunden');
        }
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Inhalte konnten nicht geladen werden');
      })
      .finally(() => setLoading(false));

    return () => abortController.abort();
  }, [targetKey, target]);

  // Escape key listener (external DOM sync — valid useEffect)
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, close]);

  if (!isOpen || !target) return null;

  const citedIndex = target.chunkIndex;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/30" onClick={close} />
      <div className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[28rem] flex-col border-l border-border bg-background shadow-xl sm:w-[28rem]">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-border px-5 py-4">
          <div className="min-w-0 flex-1">
            {target.sourceUrl ? (
              <a
                href={target.sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="truncate text-sm font-medium text-primary-600 hover:underline dark:text-primary-400"
                title={target.documentTitle}
              >
                {target.documentTitle}
              </a>
            ) : (
              <p className="truncate text-sm font-medium" title={target.documentTitle}>
                {target.documentTitle}
              </p>
            )}
          </div>
          <button
            onClick={close}
            className="shrink-0 rounded-md p-1 text-foreground-muted transition-colors hover:bg-background-alt hover:text-foreground"
            aria-label="Schließen"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content — continuous flowing text */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="flex flex-col gap-3 px-5 py-4">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-4/5" />
            </div>
          )}

          {error && (
            <div className="mx-4 mt-4 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300">
              {error}
            </div>
          )}

          {chunks.length > 0 && (
            <article className="px-5 py-4">
              {chunks.map((chunk) => {
                const isCited = chunk.index === citedIndex;
                return isCited ? (
                  <mark
                    key={chunk.index}
                    ref={citedRefCallback}
                    className="block -mx-2 my-1 rounded-md border border-primary-300 bg-transparent px-2 py-1.5 text-foreground dark:border-primary-600"
                  >
                    <span className="whitespace-pre-wrap text-sm leading-relaxed">
                      {chunk.text}
                    </span>
                  </mark>
                ) : (
                  <span
                    key={chunk.index}
                    className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/80"
                  >
                    {chunk.text}{' '}
                  </span>
                );
              })}
            </article>
          )}
        </div>
      </div>
    </>
  );
});
