import { useVoxtralDictation } from '@gruenerator/voice';
import { ArrowRight, Mic, Square } from 'lucide-react';
import { useCallback, type ReactNode } from 'react';

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
  examples?: AIPromptInputExample[];
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
    'flex items-center justify-center w-8 h-8 shrink-0 rounded-lg border-none cursor-pointer transition-all';

  if (isLoading) {
    return (
      <button disabled className={cn(base, 'bg-primary text-primary-foreground cursor-default')}>
        <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
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
        <Square className="size-3.5" />
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
          'bg-grey-100 dark:bg-grey-800 text-grey-400 hover:text-foreground hover:bg-grey-200 dark:hover:bg-grey-700'
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
      className={cn(base, 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm')}
    >
      <ArrowRight className="size-4" />
    </button>
  );
}

const pillClass = cn(
  'rounded-full border border-grey-200 dark:border-grey-700 px-3 py-1.5 text-xs text-grey-500 transition-all',
  'hover:border-grey-300 dark:hover:border-grey-600 hover:text-foreground hover:bg-grey-50 dark:hover:bg-[#2a2a2a]'
);

export function AIPromptInput({
  value,
  onChange,
  onSubmit,
  placeholder = 'Beschreibe, was du erstellen möchtest…',
  isLoading = false,
  disabled = false,
  examples,
  footer,
  error,
  rows = 3,
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

  return (
    <div className={cn('w-full', className)}>
      <div
        className={cn(
          'flex items-end gap-2',
          !transparent &&
            'rounded-xl border border-grey-200 dark:border-grey-700 bg-background-pure shadow-sm focus-within:shadow-md p-2'
        )}
      >
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={rows}
          disabled={disabled || isLoading}
          className="flex-1 min-w-0 px-2 py-2 text-base outline-none resize-none placeholder:text-grey-400 leading-relaxed bg-transparent border-none"
        />
        <div className="pb-1">
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

      {(footer || (examples && examples.length > 0)) && (
        <div className="flex items-center gap-3 mt-3">
          {footer}
          {examples && examples.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {examples.map((example) => (
                <button
                  key={example.label}
                  type="button"
                  onClick={() => onChange(example.text)}
                  disabled={disabled || isLoading}
                  className={pillClass}
                >
                  {example.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
