import { ArrowRight, Mic, Square } from 'lucide-react';
import React, { useCallback, type ReactNode } from 'react';

import { cn } from '../lib/cn';

export interface AIPromptInputExample {
  label: string;
  text: string;
}

/**
 * Speech-to-text adapter shape. Injected by consumers (e.g. `useVoxtralDictation`
 * from `@gruenerator/voice`) so this design-system package carries no voice/domain dependency.
 */
export type UseDictation = (opts: { onTranscript: (text: string) => void }) => {
  isDictating: boolean;
  toggle: () => void;
};

const useNoDictation: UseDictation = () => ({ isDictating: false, toggle: () => {} });

export interface AIPromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: () => void;
  placeholder?: string;
  isLoading?: boolean;
  disabled?: boolean;
  /** Example pills rendered inline in the toolbar row when the input is empty */
  examples?: AIPromptInputExample[];
  /** Renders inside the input border, bottom-left (e.g. FeatureIcons, dropdowns).
   * In the pill variant this sits inline right of the input. */
  toolbar?: ReactNode;
  /** Renders outside the input border */
  footer?: ReactNode;
  error?: string | null;
  rows?: number;
  transparent?: boolean;
  className?: string;
  /** Replaces the textarea region (e.g. for file-upload sub-modes). */
  inputAreaOverride?: ReactNode;
  /** When defined, overrides the default `text.length >= 3` gate for the submit button. */
  canSubmit?: boolean;
  /** Speech-to-text hook; omit to disable dictation (the mic button hides side effects to a no-op). */
  useDictation?: UseDictation;
  /** 'card' (default): textarea with toolbar row below. 'pill': slim
   * single-row rounded-full composer; `leading` sits left of the input,
   * `toolbar` right of it, `belowRow` renders under the pill. */
  variant?: 'card' | 'pill';
  /** Pill variant: controls left of the input (mode dropdown, upload slot). */
  leading?: ReactNode;
  /** Pill variant: row under the pill (reference chips, size inputs, badges). */
  belowRow?: ReactNode;
}

function ActionButton({
  isEmpty,
  isDictating,
  isLoading,
  onDictate,
  onSubmit,
  noTextInput,
  canSubmitOverride,
}: {
  isEmpty: boolean;
  isDictating: boolean;
  isLoading: boolean;
  onDictate: () => void;
  onSubmit: () => void;
  noTextInput: boolean;
  canSubmitOverride: boolean | undefined;
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

  if (noTextInput) {
    const allowed = canSubmitOverride === true;
    return (
      <button
        type="button"
        onClick={allowed ? onSubmit : undefined}
        disabled={!allowed}
        className={cn(
          base,
          allowed
            ? 'bg-primary text-primary-foreground hover:bg-primary/90'
            : 'bg-grey-200 text-grey-400 cursor-not-allowed dark:bg-grey-800 dark:text-grey-600'
        )}
        aria-label="Absenden"
      >
        <ArrowRight className="size-3.5" />
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
  inputAreaOverride,
  canSubmit,
  useDictation = useNoDictation,
  variant = 'card',
  leading,
  belowRow,
}: AIPromptInputProps) {
  const { isDictating, toggle: toggleDictation } = useDictation({
    onTranscript: (text) => onChange(text),
  });

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const noTextInput = !!inputAreaOverride;
  const isEmpty = value.trim().length < 3;
  const showInlineExamples =
    !noTextInput && isEmpty && !isLoading && examples && examples.length > 0;

  const actionButton = (
    <ActionButton
      isEmpty={isEmpty}
      isDictating={isDictating}
      isLoading={isLoading}
      onDictate={toggleDictation}
      onSubmit={onSubmit}
      noTextInput={noTextInput}
      canSubmitOverride={canSubmit}
    />
  );

  if (variant === 'pill') {
    return (
      <div className={cn('w-full max-w-[680px] mx-auto', className)}>
        <div
          className={cn(
            'flex items-center gap-1 pl-2 pr-2 py-1.5 min-h-[3.75rem]',
            !transparent &&
              'rounded-full border border-grey-200 dark:border-grey-700 bg-background-pure shadow-md focus-within:shadow-lg transition-shadow'
          )}
        >
          {leading}
          {noTextInput ? (
            <div className="flex-1 min-w-0 px-1.5">{inputAreaOverride}</div>
          ) : (
            <input
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={disabled || isLoading}
              className="flex-1 w-full min-w-0 text-[15px] outline-none placeholder:text-grey-400 bg-transparent border-none px-1.5 py-2"
            />
          )}
          {toolbar}
          {actionButton}
        </div>

        {(belowRow || showInlineExamples) && (
          <div className="flex flex-wrap items-center justify-center gap-1.5 mt-3">
            {belowRow}
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
        )}

        {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}

        {footer && (
          <div className="flex flex-wrap items-center justify-center gap-2 mt-4">{footer}</div>
        )}
      </div>
    );
  }

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
          {noTextInput ? (
            inputAreaOverride
          ) : (
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              rows={rows}
              disabled={disabled || isLoading}
              className="w-full min-w-0 text-[15px] outline-none resize-none placeholder:text-grey-400 leading-relaxed bg-transparent border-none p-0"
            />
          )}
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
          {actionButton}
        </div>
      </div>

      {error && <p className="text-red-500 text-sm mt-2">{error}</p>}

      {footer && (
        <div className="flex flex-wrap items-center justify-center gap-2 mt-4">{footer}</div>
      )}
    </div>
  );
});
