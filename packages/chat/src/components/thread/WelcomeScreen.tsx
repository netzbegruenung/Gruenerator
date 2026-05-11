'use client';

import { ThreadPrimitive, SuggestionPrimitive } from '@assistant-ui/react';
import { cn } from '../../lib/utils';
import { useChatDensity } from './chatDensityContext';

interface WelcomeScreenProps {
  /** Deprecated — kept for back-compat; rendered as fallback only when no
   *  description is provided. The headline is now always a friendly question. */
  title?: string;
  description?: string;
  questions?: Array<{ text: string }>;
  avatar?: string;
  firstName?: string | null;
}

function welcomeQuestion(firstName?: string | null): string {
  return firstName ? `Hallo ${firstName}, wie kann ich helfen?` : 'Wie kann ich dir helfen?';
}

function AutoSuggestionItem() {
  const isCompact = useChatDensity() === 'compact';
  return (
    <SuggestionPrimitive.Trigger send={false} asChild>
      <button
        className={cn(
          'h-auto w-full rounded-2xl border border-border text-left transition-colors hover:border-primary/40 hover:bg-primary/5',
          isCompact ? 'px-3 py-2 text-[12px]' : 'px-5 py-4 text-sm'
        )}
      >
        <span className="font-medium text-foreground">
          <SuggestionPrimitive.Title />
        </span>
      </button>
    </SuggestionPrimitive.Trigger>
  );
}

export function WelcomeScreen({
  title,
  description,
  questions,
  avatar,
  firstName,
}: WelcomeScreenProps = {}) {
  const isCompact = useChatDensity() === 'compact';
  const heading = welcomeQuestion(firstName);
  const fallbackDescription = !description && title ? title : description;

  return (
    <div
      className={cn(
        'mx-auto flex min-h-full w-full max-w-3xl flex-grow flex-col items-center justify-center',
        isCompact ? 'px-2' : 'px-4'
      )}
    >
      <div className="flex w-full flex-col">
        {avatar && (
          <span
            aria-hidden
            className={cn('leading-none', isCompact ? 'mb-2 text-2xl' : 'mb-3 text-4xl')}
          >
            {avatar}
          </span>
        )}
        <h1
          className={cn(
            'm-0 font-semibold text-foreground-heading',
            isCompact ? 'text-lg' : 'text-2xl'
          )}
        >
          {heading}
        </h1>

        {fallbackDescription && (
          <p
            className={cn(
              'm-0 mt-1 text-foreground-muted',
              isCompact ? 'text-[12px]' : 'text-sm'
            )}
          >
            {fallbackDescription}
          </p>
        )}

        {questions ? (
          <div
            className={cn(
              'grid w-full grid-cols-1 md:grid-cols-2',
              isCompact ? 'mt-3 gap-1.5' : 'mt-6 gap-2'
            )}
          >
            {questions.map((question, index) => (
              <ThreadPrimitive.Suggestion key={index} prompt={question.text} asChild>
                <button
                  type="button"
                  className={cn(
                    'h-auto w-full border border-border text-left transition-colors hover:border-primary/40 hover:bg-primary/5',
                    isCompact
                      ? 'rounded-xl px-3 py-2 text-[12px]'
                      : 'rounded-2xl px-5 py-4 text-sm'
                  )}
                >
                  <span className="font-medium text-foreground">{question.text}</span>
                </button>
              </ThreadPrimitive.Suggestion>
            ))}
          </div>
        ) : (
          <div
            className={cn(
              'grid w-full grid-cols-1 md:grid-cols-2',
              isCompact ? 'mt-3 gap-1.5' : 'mt-6 gap-2'
            )}
          >
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
