'use client';

import { ThreadPrimitive, SuggestionPrimitive } from '@assistant-ui/react';
import { cn } from '../../lib/utils';

interface WelcomeScreenProps {
  title?: string;
  description?: string;
  questions?: Array<{ text: string }>;
}

function AutoSuggestionItem() {
  return (
    <SuggestionPrimitive.Trigger send={false} asChild>
      <button
        className={cn(
          'h-auto w-full rounded-2xl border border-border px-5 py-4 text-left text-sm',
          'transition-colors hover:border-primary/40 hover:bg-primary/5'
        )}
      >
        <span className="font-medium text-foreground">
          <SuggestionPrimitive.Title />
        </span>
      </button>
    </SuggestionPrimitive.Trigger>
  );
}

export function WelcomeScreen({ title, description, questions }: WelcomeScreenProps = {}) {
  const resolvedTitle = title ?? 'Grünerator Chat';

  return (
    <div className="mx-auto flex min-h-full w-full max-w-3xl flex-grow flex-col items-center justify-center px-4">
      <div className="flex w-full flex-col">
        <h1 className="m-0 text-2xl font-semibold text-foreground-heading">{resolvedTitle}</h1>

        {description && <p className="m-0 mt-1 text-sm text-foreground-muted">{description}</p>}

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
