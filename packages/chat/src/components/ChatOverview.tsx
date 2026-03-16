'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ThreadPrimitive,
  useAssistantRuntime,
  useComposerRuntime,
  useThread,
} from '@assistant-ui/react';
import { useAgentStore } from '../stores/chatStore';
import { cn } from '../lib/utils';
import { GrueneratorComposer } from './thread/GrueneratorComposer';

const EXAMPLE_PROMPTS = [
  { label: 'Klimaschutz', text: 'Schreibe einen Instagram-Post zum Thema Klimaschutz' },
  { label: 'Verkehrswende', text: 'Hilf mir bei einer Pressemitteilung zur Verkehrswende' },
];

function ExampleSuggestions() {
  const composerRuntime = useComposerRuntime();

  const handleClick = useCallback(
    (e: React.MouseEvent, text: string) => {
      e.preventDefault();
      e.stopPropagation();
      composerRuntime.setText(text);
    },
    [composerRuntime]
  );

  return (
    <div className="ml-2.5 flex flex-wrap items-center gap-2.5">
      {EXAMPLE_PROMPTS.map((prompt) => (
        <button
          type="button"
          key={prompt.label}
          onClick={(e) => handleClick(e, prompt.text)}
          className={cn(
            'rounded-full border border-secondary-500 px-2.5 py-1 text-xs text-foreground-muted transition-all',
            'hover:border-secondary-600 hover:bg-secondary-500/10 hover:text-foreground'
          )}
        >
          {prompt.label}
        </button>
      ))}
    </div>
  );
}

function SwitchToThreadOnSend() {
  const thread = useThread();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (thread.isRunning && !hasNavigated.current) {
      hasNavigated.current = true;
      useAgentStore.getState().setChatViewMode('thread');
    }
    if (!thread.isRunning) {
      hasNavigated.current = false;
    }
  }, [thread.isRunning]);

  return null;
}

export interface NotebookLink {
  id: string;
  path: string;
  title: string;
}

interface ChatOverviewProps {
  firstName?: string | null;
  notebooks?: NotebookLink[];
  onNavigate?: (path: string) => void;
}

const INITIAL_NOTEBOOK_COUNT = 3;

export function ChatOverview({ firstName, notebooks, onNavigate }: ChatOverviewProps) {
  const assistantRuntime = useAssistantRuntime();
  const [showAllNotebooks, setShowAllNotebooks] = useState(false);

  useEffect(() => {
    const { pendingMessage, pendingDraft } = useAgentStore.getState();
    if (pendingMessage || pendingDraft) {
      useAgentStore.getState().setChatViewMode('thread');
      return;
    }
    assistantRuntime.switchToNewThread();
  }, [assistantRuntime]);

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-semibold text-foreground-heading md:text-4xl">
          {firstName ? `Hallo ${firstName}, wie kann ich helfen?` : 'Wie kann ich dir helfen?'}
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          Stelle eine Frage, lade eine Datei hoch oder erwähne eine Quelle mit @
        </p>
      </div>

      <ThreadPrimitive.Root
        className={cn(
          'w-full max-w-3xl shrink-0',
          '[&>div]:px-0',
          '[&_div:has(>.input-tools-button)]:flex-wrap',
          '[&_textarea]:order-first [&_textarea]:w-full [&_textarea]:min-h-[72px] [&_textarea]:text-base [&_textarea]:pl-4',
          '[&_.input-tools-button]:order-2',
          '[&_.input-tools-button~div]:order-3',
          '[&_textarea~button]:order-4 [&_textarea~button]:ml-auto',
          '[&>div>p.text-center]:hidden'
        )}
      >
        <SwitchToThreadOnSend />
        <GrueneratorComposer toolbarExtra={<ExampleSuggestions />} />
      </ThreadPrimitive.Root>

      {notebooks && notebooks.length > 0 && (
        <div className="w-full max-w-3xl pt-4">
          <h2 className="mb-3 text-sm font-medium text-foreground-muted">
            oder chatte mit einem Notebook
          </h2>
          <div className="flex flex-wrap gap-2">
            {(showAllNotebooks ? notebooks : notebooks.slice(0, INITIAL_NOTEBOOK_COUNT)).map(
              (nb) => (
                <button
                  key={nb.id}
                  onClick={() => onNavigate?.(nb.path)}
                  className={cn(
                    'rounded-full border border-border bg-background-alt px-4 py-2 text-sm text-foreground transition-all',
                    'hover:border-primary/30 hover:bg-primary/5 hover:shadow-sm'
                  )}
                >
                  {nb.title}
                </button>
              )
            )}
            {!showAllNotebooks && notebooks.length > INITIAL_NOTEBOOK_COUNT && (
              <button
                onClick={() => setShowAllNotebooks(true)}
                className={cn(
                  'rounded-full border border-dashed border-border px-4 py-2 text-sm text-foreground-muted transition-all',
                  'hover:border-primary/30 hover:text-foreground'
                )}
              >
                +{notebooks.length - INITIAL_NOTEBOOK_COUNT} mehr
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
