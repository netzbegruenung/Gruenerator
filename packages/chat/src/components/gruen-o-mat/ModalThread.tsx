import { useMessage, ComposerPrimitive, ThreadPrimitive } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { ArrowUp, Leaf, Square } from 'lucide-react';
import { memo, useMemo } from 'react';

import { CitationProvider } from '../../context/CitationContext';
import { cn } from '../../lib/utils';
import { resolveCitations } from '../../lib/citationUtils';
import { MarkdownContent } from '../MarkdownContent';
import { ProgressIndicator } from '../message-parts/ProgressIndicator';
import { SearchResultsSection, type AdditionalSource } from '../message-parts/SearchResultsSection';
import { TypingIndicator } from '../message-parts/TypingIndicator';

import type { NotebookMessageMetadata } from '../../runtime/NotebookModelAdapter';

interface ModalWelcomeProps {
  suggestions?: string[];
}

const DEFAULT_SUGGESTIONS = [
  'Was ist die Position der Grünen zum Klimaschutz?',
  'Was fordern die Grünen im Bereich Bildung?',
  'Welche Positionen gibt es zur Energiewende?',
];

function ModalWelcome({ suggestions = DEFAULT_SUGGESTIONS }: ModalWelcomeProps) {
  return (
    <div className="flex flex-col items-center px-4 pt-6 pb-4 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
        <Leaf className="size-6 text-primary" />
      </div>
      <p className="mb-4 text-sm text-foreground-muted">Stell eine Frage zu grüner Politik</p>
      <div className="flex w-full flex-col gap-1.5">
        {suggestions.map((text) => (
          <button
            key={text}
            type="button"
            className="rounded-lg border border-border px-3 py-2 text-left text-xs transition-colors hover:bg-surface-hover"
            onClick={() => {
              const textarea = document.querySelector<HTMLTextAreaElement>(
                '[data-gom-composer] textarea'
              );
              if (textarea) {
                const setter = Object.getOwnPropertyDescriptor(
                  window.HTMLTextAreaElement.prototype,
                  'value'
                )?.set;
                setter?.call(textarea, text);
                textarea.dispatchEvent(new Event('input', { bubbles: true }));
                textarea.focus();
              }
            }}
          >
            <span className="text-foreground">{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

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

const ModalAssistantMessage = memo(function ModalAssistantMessage() {
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
    <div className="flex w-full items-start gap-2 py-2">
      <Leaf className="mt-0.5 size-4 shrink-0 text-primary" />
      <div className="min-w-0 flex-1">
        {isRunning &&
          !text &&
          (progress?.stage === 'searching' || progress?.stage === 'generating' ? (
            <ProgressIndicator progress={progress} agentColor="#316049" />
          ) : (
            <TypingIndicator />
          ))}

        <CitationProvider citations={mappedCitations}>
          <div className="prose prose-sm max-w-none text-xs">
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
});

function ModalComposer() {
  const isRunning = useAuiState((s) => s.thread.isRunning);

  return (
    <div className="border-t border-border p-2" data-gom-composer="">
      <ComposerPrimitive.Root className="flex items-center gap-1 rounded-2xl border border-border bg-surface px-2">
        <ComposerPrimitive.Input
          autoFocus
          placeholder="Stell deine Frage..."
          className="h-10 flex-grow resize-none bg-transparent px-2 text-xs text-foreground outline-none placeholder:text-foreground-muted"
          rows={1}
        />
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

export interface ModalThreadProps {
  suggestions?: string[];
  className?: string;
}

export function ModalThread({ suggestions, className }: ModalThreadProps) {
  return (
    <ThreadPrimitive.Root className={cn('flex flex-1 flex-col overflow-hidden', className)}>
      <ThreadPrimitive.Viewport className="flex flex-1 flex-col overflow-y-auto scroll-smooth">
        <div className="flex-1 px-3 pb-2">
          <ThreadPrimitive.Empty>
            <ModalWelcome suggestions={suggestions} />
          </ThreadPrimitive.Empty>

          <ThreadPrimitive.Messages
            components={{
              UserMessage: ModalUserMessage,
              AssistantMessage: ModalAssistantMessage,
            }}
          />
        </div>
      </ThreadPrimitive.Viewport>
      <ModalComposer />
    </ThreadPrimitive.Root>
  );
}
