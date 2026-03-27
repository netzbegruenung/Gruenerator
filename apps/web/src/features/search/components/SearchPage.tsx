/**
 * SearchPage — Dedicated /suche page
 *
 * Follows the same overview → thread pattern as ChatPage but with
 * search-specific content. Uses the shared GrueneratorChatProvider
 * (already mounted by GlobalChatProvider in PageLayout) with
 * threadMode='search' so the adapter routes to /api/search-graph/stream.
 */

import {
  ThreadPrimitive,
  useAssistantRuntime,
  useComposerRuntime,
  useThread,
} from '@assistant-ui/react';
import { GrueneratorComposer, GrueneratorThread, useAgentStore } from '@gruenerator/chat';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import withAuthRequired from '../../../components/common/LoginRequired/withAuthRequired';
import { useFirstName } from '../../../hooks/useFirstName';

import { cn } from '@/utils/cn';

const SEARCH_EXAMPLES = [
  { label: '🚲 Verkehrswende in Kommunen', text: 'Verkehrswende in Kommunen Beispiele' },
  { label: '🌍 Klimaschutz für Kommunen', text: 'Klimaschutz für Kommunen Ideen' },
  { label: '⚡ Energiewende aktuell', text: 'Aktuelle Entwicklungen Energiewende Deutschland' },
];

function SearchExampleSuggestions() {
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
      {SEARCH_EXAMPLES.map((prompt) => (
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

/**
 * Switches to thread view when a message starts running.
 * Local version that uses a callback instead of the shared chatViewMode store.
 */
function SwitchToThread({ onSwitch }: { onSwitch: () => void }) {
  const thread = useThread();
  const hasNavigated = useRef(false);

  useEffect(() => {
    if (thread.isRunning && !hasNavigated.current) {
      hasNavigated.current = true;
      onSwitch();
    }
    if (!thread.isRunning) {
      hasNavigated.current = false;
    }
  }, [thread.isRunning, onSwitch]);

  return null;
}

/** Composer layout overrides — same pattern as ChatOverview */
const COMPOSER_ROOT_CLASS = cn(
  'w-full max-w-3xl shrink-0',
  '[&>div]:px-0',
  '[&_div:has(>.input-tools-button)]:flex-wrap',
  '[&_textarea]:order-first [&_textarea]:w-full [&_textarea]:min-h-[72px] [&_textarea]:text-base [&_textarea]:pl-4',
  '[&_.input-tools-button]:order-2',
  '[&_.input-tools-button~div]:order-3',
  '[&_textarea~button]:order-4 [&_textarea~button]:ml-auto',
  '[&>div>p.text-center]:hidden'
);

function SearchPage() {
  const navigate = useNavigate();
  const firstName = useFirstName();
  const [isThreadView, setIsThreadView] = useState(false);
  const assistantRuntime = useAssistantRuntime();

  useEffect(() => {
    useAgentStore.getState().setThreadMode('search');
    assistantRuntime.switchToNewThread();
  }, [assistantRuntime]);

  const handleSwitchToThread = useCallback(() => {
    setIsThreadView(true);
  }, []);

  if (isThreadView) {
    return <GrueneratorThread onNavigate={navigate} firstName={firstName} />;
  }

  return (
    <div className="flex h-full flex-col items-center justify-center bg-background px-4">
      <div className="w-full max-w-3xl">
        <h1 className="mb-2 text-3xl font-semibold text-foreground-heading md:text-4xl">
          Grünerator Suche
        </h1>
        <p className="mb-6 text-sm text-foreground-muted">
          KI-gestützte Recherche in Grünen Quellen und dem Web
        </p>
      </div>

      <ThreadPrimitive.Root className={COMPOSER_ROOT_CLASS}>
        <SwitchToThread onSwitch={handleSwitchToThread} />
        <GrueneratorComposer
          toolbarExtra={<SearchExampleSuggestions />}
          onNavigate={navigate}
          firstName={firstName}
        />
      </ThreadPrimitive.Root>

      <p className="mt-4 w-full max-w-3xl text-center text-xs text-foreground-muted">
        KI-Systeme können Fakten falsch interpretieren. Bitte prüfe die Quellen.
      </p>
    </div>
  );
}

export default withAuthRequired(SearchPage, {
  title: 'Suche',
  message: 'Melde dich an, um die Suche zu nutzen.',
});
