'use client';

import { ThreadPrimitive, SuggestionPrimitive } from '@assistant-ui/react';
import { agentsList, getDefaultAgent } from '../../lib/agents';
import { ChatIcon } from '../icons';

function SuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger send={false} asChild>
      <button className="flex flex-col gap-1 rounded-xl border border-border bg-card p-3 text-left transition-colors hover:border-primary/40 hover:bg-primary/5">
        <span className="text-sm font-medium text-foreground">
          <SuggestionPrimitive.Title />
        </span>
        <span className="text-xs text-foreground-muted">
          <SuggestionPrimitive.Description />
        </span>
      </button>
    </SuggestionPrimitive.Trigger>
  );
}

export function WelcomeScreen() {
  const defaultAgent = agentsList.find((a) => a.identifier === getDefaultAgent());

  return (
    <div className="flex w-full flex-grow flex-col items-center justify-center px-4">
      {defaultAgent ? (
        <div
          className="flex h-14 w-14 items-center justify-center rounded-full border border-border text-2xl"
          style={{ backgroundColor: defaultAgent.backgroundColor }}
        >
          {defaultAgent.avatar}
        </div>
      ) : (
        <ChatIcon size={56} />
      )}
      <h1 className="mt-4 text-xl font-medium text-foreground">
        {defaultAgent?.title || 'Grünerator Chat'}
      </h1>
      <p className="mt-1 text-sm text-foreground-muted">{defaultAgent?.description}</p>
      <p className="mt-3 text-xs text-foreground-muted">
        Tipp: Nutze @presse, @antrag, @rede u.a. für spezialisierte Assistenten
      </p>

      <div className="mt-6 grid w-full max-w-[32rem] grid-cols-2 gap-2 self-center">
        <ThreadPrimitive.Suggestions
          components={{
            Suggestion: SuggestionItem,
          }}
        />
      </div>
    </div>
  );
}
