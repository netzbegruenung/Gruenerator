import { useMessage } from '@assistant-ui/react';
import {
  CitationProvider,
  MarkdownContent,
  ProgressIndicator,
  SearchResultsSection,
  TypingIndicator,
  type AdditionalSource,
  type Citation as ChatCitation,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import { Leaf } from 'lucide-react';
import { memo, useMemo, useState, useEffect, startTransition } from 'react';

function mapRawCitationsToChat(raw: unknown[]): ChatCitation[] {
  return raw
    .filter((c): c is Record<string, unknown> => c != null && typeof c === 'object' && 'index' in c)
    .map((c) => ({
      id: parseInt(String(c.index), 10),
      title: (c.document_title as string) ?? '',
      url: (c.source_url as string) ?? '',
      snippet: (c.cited_text as string) ?? '',
      citedText: c.cited_text as string | undefined,
      source: (c.collection_name as string) ?? '',
      collectionName: c.collection_name as string | undefined,
      documentId: c.document_id as string | undefined,
      chunkIndex: c.chunk_index as number | undefined,
      similarityScore: c.similarity_score as number | undefined,
      collectionId: c.collection_id as string | undefined,
    }));
}

function GruenOMatAssistantMessageInner() {
  const message = useMessage();
  const meta = message.metadata?.custom as NotebookMessageMetadata | undefined;
  const isRunning = message.status?.type === 'running';
  const isError = message.status?.type === 'incomplete' && message.status?.reason === 'error';

  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  const progress = meta?.progress;
  const hasCitations = !isRunning && meta && (meta.citations?.length ?? 0) > 0;

  const mappedCitations = useMemo(() => {
    if (!hasCitations || !meta) return [];
    if (meta.chatCitations && meta.chatCitations.length > 0) return meta.chatCitations;
    if (meta.citations && meta.citations.length > 0) return mapRawCitationsToChat(meta.citations);
    return [];
  }, [hasCitations, meta]);

  const [showSearchResults, setShowSearchResults] = useState(false);
  useEffect(() => {
    if (!isRunning && mappedCitations.length > 0) {
      startTransition(() => setShowSearchResults(true));
    } else {
      setShowSearchResults(false);
    }
  }, [isRunning, mappedCitations.length]);

  return (
    <div className="group flex w-full items-start gap-3 py-4 animate-message-appear">
      <Leaf className="mt-1 size-5 shrink-0 text-primary" />

      <div className="min-w-0 flex-1">
        {isError && !text && (
          <div className="rounded-lg bg-error-bg p-3 text-sm text-error">
            {(message.status as any)?.error?.message ||
              'Ein Fehler ist aufgetreten. Bitte versuche es erneut.'}
          </div>
        )}

        {isRunning &&
          !text &&
          (progress?.stage === 'searching' || progress?.stage === 'generating' ? (
            <ProgressIndicator progress={progress} agentColor="#316049" />
          ) : (
            <TypingIndicator />
          ))}

        <CitationProvider citations={mappedCitations}>
          <div className="prose prose-sm max-w-none">
            <MarkdownContent content={text} />
            {isRunning && text && (
              <span className="inline-block animate-pulse text-foreground-muted">▋</span>
            )}
          </div>
        </CitationProvider>

        {showSearchResults && (
          <SearchResultsSection
            citations={mappedCitations}
            additionalSources={meta?.additionalSources as AdditionalSource[] | undefined}
          />
        )}
      </div>
    </div>
  );
}

export const GruenOMatAssistantMessage = memo(GruenOMatAssistantMessageInner);
