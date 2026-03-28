'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { ThreadPrimitive, useAssistantRuntime, useComposerRuntime } from '@assistant-ui/react';
import { useAuiState } from '@assistant-ui/store';
import { useAgentStore } from '../stores/chatStore';
import { useUserProfileStore, type UserRole } from '../stores/userProfileStore';
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

export function SwitchToThreadOnSend() {
  const isRunning = useAuiState((s) => s.thread.isRunning);
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (isRunning && !hasNavigated.current) {
      hasNavigated.current = true;
      useAgentStore.getState().setChatViewMode('thread');
    }
    if (!isRunning) {
      hasNavigated.current = false;
    }
  }, [isRunning]);

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
  onSelectNotebook?: (notebookId: string) => void;
  onSelectRole?: (role: UserRole) => void;
}

const INITIAL_NOTEBOOK_COUNT = 3;

export function ChatOverview({
  firstName,
  notebooks,
  onNavigate,
  onSelectNotebook,
  onSelectRole,
}: ChatOverviewProps) {
  const assistantRuntime = useAssistantRuntime();
  const [showAllNotebooks, setShowAllNotebooks] = useState(false);
  const roles = useUserProfileStore((s) => s.roles);

  useEffect(() => {
    const { pendingMessage, pendingDraft, pendingInitialAssistantMessage } =
      useAgentStore.getState();
    if (pendingMessage || pendingDraft || pendingInitialAssistantMessage) {
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

        {roles.length > 0 && onSelectRole && (
          <div className="mb-4 flex flex-wrap gap-2">
            {roles.map((role, i) => (
              <button
                key={`${role.ebene}-${role.rolle}-${i}`}
                type="button"
                onClick={() => onSelectRole(role)}
                className={cn(
                  'flex items-center gap-1.5 rounded-full border border-grey-200 dark:border-grey-700 bg-background px-3 py-1.5 text-xs transition-all',
                  'hover:border-primary-500 hover:bg-primary-500/5 hover:text-primary-700 dark:hover:text-primary-400'
                )}
              >
                <span className="font-medium">{role.rolle}</span>
                {role.gliederung && (
                  <span className="text-foreground-muted">· {role.gliederung}</span>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      <ThreadPrimitive.Root
        className={cn('w-full max-w-3xl shrink-0', '[&>div]:px-0', '[&>div>p.text-center]:hidden')}
      >
        <SwitchToThreadOnSend />
        <GrueneratorComposer
          toolbarExtra={<ExampleSuggestions />}
          onNavigate={onNavigate}
          firstName={firstName}
        />
      </ThreadPrimitive.Root>
    </div>
  );
}
