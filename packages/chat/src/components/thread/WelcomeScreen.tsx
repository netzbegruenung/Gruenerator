'use client';

import { type ReactNode } from 'react';
import { ThreadPrimitive, SuggestionPrimitive } from '@assistant-ui/react';
import { agentsList, getDefaultAgent } from '../../lib/agents';
import { ChatIcon } from '../icons';
import { cn } from '../../lib/utils';

interface WelcomeScreenProps {
  title?: string;
  description?: string;
  avatar?: ReactNode;
  avatarBackground?: string;
  tip?: string;
  sources?: Array<{ name?: string; count?: string }>;
  questions?: Array<{ text: string }>;
}

function AutoSuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger send={false} asChild>
      <button
        className={cn(
          'flex flex-col gap-1 rounded-2xl border border-border px-5 py-4 text-left text-sm',
          'transition-colors hover:border-primary/40 hover:bg-primary/5'
        )}
      >
        <span className="font-medium text-foreground">
          <SuggestionPrimitive.Title />
        </span>
        <span className="text-xs text-foreground-muted">
          <SuggestionPrimitive.Description />
        </span>
      </button>
    </SuggestionPrimitive.Trigger>
  );
}

export function WelcomeScreen({
  title,
  description,
  avatar,
  avatarBackground,
  tip,
  sources,
  questions,
}: WelcomeScreenProps = {}) {
  const hasExplicitProps = title !== undefined;
  const defaultAgent = hasExplicitProps
    ? undefined
    : agentsList.find((a) => a.identifier === getDefaultAgent());

  const resolvedTitle = title ?? defaultAgent?.title ?? 'Grünerator Chat';
  const resolvedDescription = description ?? defaultAgent?.description;
  const resolvedTip =
    tip ??
    (hasExplicitProps
      ? undefined
      : 'Tipp: Nutze @presse, @antrag, @rede u.a. für spezialisierte Assistenten');

  const showAvatar = avatar !== undefined || (!hasExplicitProps && defaultAgent);
  const avatarNode = avatar ?? (defaultAgent ? defaultAgent.avatar : null);
  const avatarBg = avatarBackground ?? defaultAgent?.backgroundColor;

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-grow flex-col items-center justify-center px-4">
      <div className="flex w-full flex-col">
        {showAvatar && (
          <div
            className="mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-border text-2xl"
            style={avatarBg ? { backgroundColor: avatarBg } : undefined}
          >
            {avatarNode}
          </div>
        )}
        {!showAvatar && !hasExplicitProps && (
          <div className="mb-4">
            <ChatIcon size={56} />
          </div>
        )}

        <h1 className="m-0 text-2xl font-semibold text-foreground-heading">{resolvedTitle}</h1>

        {resolvedDescription && (
          <p className="m-0 mt-1 text-2xl text-foreground-muted/65">{resolvedDescription}</p>
        )}

        {resolvedTip && <p className="mt-3 text-xs text-foreground-muted">{resolvedTip}</p>}

        {sources && sources.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {sources.map((source, index) => (
              <span
                key={index}
                className="rounded-full bg-background-alt px-3 py-1 text-xs text-foreground-muted"
              >
                {source.count ? `${source.count} ${source.name}` : source.name}
              </span>
            ))}
          </div>
        )}

        {questions ? (
          <div className="mt-6 grid w-full grid-cols-1 gap-2 md:grid-cols-2">
            {questions.map((question, index) => (
              <ThreadPrimitive.Suggestion key={index} prompt={question.text} asChild>
                <button
                  type="button"
                  className={cn(
                    'h-auto w-full rounded-2xl border border-border px-5 py-4 text-left text-sm',
                    'transition-colors hover:border-primary/40 hover:bg-primary/5'
                  )}
                >
                  <span className="font-medium text-foreground">{question.text}</span>
                </button>
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        ) : (
          <div className="mt-6 grid w-full grid-cols-1 gap-2 md:grid-cols-2">
            <ThreadPrimitive.Suggestions
              components={{
                Suggestion: AutoSuggestionItem,
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
}
