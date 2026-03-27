import { useVoxtralDictation } from '@gruenerator/voice';
import { ArrowRight, Mic, Square } from 'lucide-react';
import React, { useCallback, type ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface AIPromptInputExample {
  label: string;
  text: string;
}

export interface AIPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Example pills rendered inline in the toolbar row when the input is empty */
  examples?: AIPromptInputExample[];
  /** Renders inside the input border, bottom-left (e.g. FeatureIcons, dropdowns) */
  toolbar?: ReactNode;
  /** Renders outside the input border */
  footer?: ReactNode;
  error?: string | null;
  rows?: number;
  transparent?: boolean;
  className?: string;
}

function ActionButton({
  isEmpty,
  isDictating,
  isLoading,
  onDictate,
  onSubmit,
}: {
  isEmpty: boolean;
  isDictating: boolean;
  isLoading: boolean;
  onDictate: () => void;
  onSubmit: () => void;
}) {
  const base =
    'flex items-center justify-center size-7 shrink-0 rounded-full border-none cursor-pointer transition-all';

  if (isLoading) {
    return (
      <button disabled className={cn(base, 'bg-primary text-primary-foreground cursor-default')}>
        <span className="size-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
      </button>
    );
  }

  if (isDictating) {
    return (
      <button
        type="button"
        onClick={onDictate}
        className={cn(base, 'bg-red-500 text-white animate-pulse')}
        title="Aufnahme stoppen"
      >
        <Square className="size-3" />
      </button>
    );
  }

  if (isEmpty) {
    return (
      <button
        type="button"
        onClick={onDictate}
        className={cn(
          base,
          'text-grey-400 hover:text-foreground hover:bg-grey-100 dark:hover:bg-grey-800'
        )}
        title="Spracheingabe"
      >
        <Mic className="size-4" />
      </button>
    );
  }

  return (
    <button
      onClick={onSubmit}
      className={cn(base, 'bg-primary text-primary-foreground hover:bg-primary/90')}
    >
      <ArrowRight className="size-3.5" />
    </button>
  );
}

const pillClass = cn(
  'rounded-full border border-grey-200 dark:border-grey-700 px-3 py-1.5 text-xs text-grey-500 transition-all',
  'hover:border-grey-300 dark:hover:border-grey-600 hover:text-foreground hover:bg-grey-50 dark:hover:bg-[#2a2a2a]'
);

export const AIPromptInput = React.memo(function AIPromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Beschreibe, was du erstellen möchtest…',
  isLoading = false,
  disabled = false,
  examples,
  toolbar,
  footer,
  error,
  rows = 2,
  transparent = false,
  className,
}: AIPromptInputProps) {
  const { isDictating, toggle: toggleDictation } = useVoxtralDictation({
    onTranscript: (text) => onChange(text),
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const isEmpty = value.trim().length < 3;
  const showInlineExamples = isEmpty && !isLoading && examples && examples.length > 0;

  return (
    <div className={cn('w-full max-w-[680px] mx-auto', className)}>
      <div
        className={cn(
          'flex flex-col',
          !transparent &&
            'rounded-2xl border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm focus-within:shadow-md transition-shadow'
        )}
      >
        <div className="px-4 pt-3 pb-1">
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={rows}
            disabled={disabled || isLoading}
            className="w-full min-w-0 text-[15px] outline-none resize-none placeholder:text-grey-400 leading-relaxed bg-transparent border-none p-0"
          />
        </div>

        <div className="flex items-center gap-1.5 px-3 pb-2.5">
          <div className="flex-1 flex items-center gap-1 flex-wrap min-w-0">
            {toolbar}
            {showInlineExamples &&
              examples.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => onChange(example.text)}
                  disabled={disabled}
                  className={pillClass}
                >
                  {example.label}
                </button>
              ))}
          </div>
          <ActionButton
            isEmpty={isEmpty}
            isDictating={isDictating}
            isLoading={isLoading}
            onDictate={toggleDictation}
            onSubmit={onSubmit}
          />
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

      {footer && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">{footer}</div>
      )}
    </div>
  );
});
