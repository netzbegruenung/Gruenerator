import { useMessage, ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { ArrowUp, Square } from 'lucide-react';
import { memo, useMemo, type ReactNode } from 'react';

import { CitationProvider } from '../../context/CitationContext';
import { cn } from '../../lib/utils';
import { resolveCitations } from '../../lib/citationUtils';
import { MarkdownContent } from '../MarkdownContent';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { SearchResultsSection, type AdditionalSource } from '../message-parts/SearchResultsSection';
import { TypingIndicator } from '../message-parts/TypingIndicator';

import type { NotebookMessageMetadata } from '../../runtime/NotebookModelAdapter';

const ModalUserMessage = memo(function ModalUserMessage() {
  const message = useMessage();
  const text = message.content
    .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
    .map((part) => part.text)
    .join('');

  return (
    <div className="flex w-full justify-end py-2">
      <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3 py-2 text-xs text-white">
        {text}
      </div>
    </div>
  );
});

interface ModalAssistantMessageProps {
  assistantIcon: ReactNode;
  agentColor: string;
}

function ModalAssistantMessageInner({ assistantIcon, agentColor }: ModalAssistantMessageProps) {
  const message = useMessage();
  const meta = message.metadata?.custom as NotebookMessageMetadata | undefined;
  const isRunning = message.status?.type === 'running';

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

  return (
    <div className="flex w-full items-start gap-2 py-2 text-left">
      <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center text-primary">
        {assistantIcon}
      </span>
      <div className="min-w-0 flex-1 text-left">
        {isRunning &&
          !text &&
          (progress?.stage === 'searching' || progress?.stage === 'generating' ? (
            <ProgressIndicator progress={progress} agentColor={agentColor} />
          ) : (
            <TypingIndicator />
          ))}

        <CitationProvider citations={mappedCitations}>
          <div className="prose prose-sm max-w-none text-xs text-left">
            <MarkdownContent content={text} />
            {isRunning && text && (
              <span className="inline-block animate-pulse text-foreground-muted">▋</span>
            )}
          </div>
        </CitationProvider>

        {!isRunning && mappedCitations.length > 0 && (
          <SearchResultsSection
            citations={mappedCitations}
            additionalSources={meta?.additionalSources as AdditionalSource[] | undefined}
          />
        )}
      </div>
    </div>
  );
}

interface ModalComposerProps {
  placeholder: string;
  extras?: ReactNode;
}

function ModalComposer({ placeholder, extras }: ModalComposerProps) {
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <div className="border-t border-border p-2" data-gom-composer="">
      <ComposerPrimitive.Root className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-2">
        <ComposerPrimitive.Input
          autoFocus
          placeholder={placeholder}
          className="min-h-10 max-h-28 flex-grow resize-none overflow-y-auto bg-transparent px-2 py-2.5 text-xs leading-snug text-foreground outline-none placeholder:text-foreground-muted"
          rows={1}
        />
        {extras}
        {isRunning ? (
          <ComposerPrimitive.Cancel
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-error text-white"
            aria-label="Abbrechen"
          >
            <Square className="h-3.5 w-3.5" />
          </ComposerPrimitive.Cancel>
        ) : (
          <ComposerPrimitive.Send
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity disabled:opacity-30"
            aria-label="Senden"
          >
            <ArrowUp className="h-4 w-4" />
          </ComposerPrimitive.Send>
        )}
      </ComposerPrimitive.Root>
    </div>
  );
}

export interface CompactThreadProps {
  /** Welcome content shown when the thread is empty. */
  welcome: ReactNode;
  /** Icon rendered next to assistant messages. */
  assistantIcon: ReactNode;
  /** Placeholder text for the composer input. */
  composerPlaceholder?: string;
  /** Color used for in-progress indicators (CSS color string). */
  agentColor?: string;
  /** Extra controls rendered in the composer just before the send/cancel button. */
  composerExtras?: ReactNode;
  className?: string;
}

export function CompactThread({
  welcome,
  assistantIcon,
  composerPlaceholder = 'Stell deine Frage...',
  agentColor = '#316049',
  composerExtras,
  className,
}: CompactThreadProps) {
  const ModalAssistantMessage = useMemo(
    () =>
      memo(function BoundModalAssistantMessage() {
        return <ModalAssistantMessageInner assistantIcon={assistantIcon} agentColor={agentColor} />;
      }),
    [assistantIcon, agentColor]
  );

  return (
    <ThreadPrimitive.Root className={cn('flex flex-1 flex-col overflow-hidden', className)}>
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto scroll-smooth">
        <div className="flex-1 px-3 pb-2">
          <ThreadPrimitive.Empty>{welcome}</ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage: ModalUserMessage,
              AssistantMessage: ModalAssistantMessage,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>
      <ModalComposer placeholder={composerPlaceholder} extras={composerExtras} />
    </ThreadPrimitive.Root>
  );
}
