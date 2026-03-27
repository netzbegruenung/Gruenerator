import { useMessage } from '@assistant-ui/react';
import {
  CitationProvider,
  MarkdownContent,
  ProgressIndicator,
  resolveCitations,
  SearchResultsSection,
  TypingIndicator,
  type AdditionalSource,
  type NotebookMessageMetadata,
} from '@gruenerator/chat';
import { Leaf } from 'lucide-react';
import { memo, useMemo } from 'react';

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

  const mappedCitations = useMemo(
    () => (hasCitations ? resolveCitations(meta as Record<string, unknown>) : []),
    [hasCitations, meta]
  );

  const showSearchResults = !isRunning && mappedCitations.length > 0;

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
