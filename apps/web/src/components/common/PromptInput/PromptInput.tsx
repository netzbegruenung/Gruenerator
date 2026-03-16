import { motion } from 'motion/react';
import React, { useCallback, type FormEvent } from 'react';
import { HiArrowUp } from 'react-icons/hi';

import { cn } from '../../../utils/cn';

export interface PromptExample {
  label: string;
  text: string;
}

export interface PromptInputProps {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (e?: FormEvent) => void;
  placeholder?: string;
  isLoading?: boolean;
  error?: string | null;
  examples?: PromptExample[];
  minRows?: number;
  maxRows?: number;
  disabled?: boolean;
  className?: string;
  submitLabel?: string;
}

const PromptInput: React.FC<PromptInputProps> = ({
  value,
  onChange,
  onSubmit,
  placeholder = 'Beschreibe dein Vorhaben...',
  isLoading = false,
  error = null,
  examples = [],
  minRows = 2,
  disabled = false,
  className = '',
  submitLabel = 'Absenden',
}) => {
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        onSubmit();
      }
    },
    [onSubmit]
  );

  const handleExampleClick = useCallback(
    (text: string) => {
      onChange(text);
    },
    [onChange]
  );

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      onSubmit(e);
    },
    [onSubmit]
  );

  const isDisabled = disabled || isLoading;
  const canSubmit = value.trim().length > 0 && !isDisabled;

  return (
    <div className={cn('w-full mx-auto mb-xl text-center', className)}>
      <form className="w-full" onSubmit={handleSubmit}>
        <div
          className={cn(
            'flex items-end gap-sm bg-[var(--card-background)] border border-grey-200 dark:border-grey-700',
            'rounded-[24px] py-sm px-md shadow-lg',
            'transition-all duration-300 ease-[cubic-bezier(0.4,0,0.2,1)] relative',
            'focus-within:border-primary-600',
            'max-md:rounded-[16px] max-md:py-xs max-md:px-sm max-md:gap-xs'
          )}
        >
          <div className="flex-1 flex flex-col gap-xs min-w-0">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              rows={minRows}
              className={cn(
                'w-full border-none bg-transparent text-base text-foreground',
                'p-sm resize-none min-h-[80px] max-h-[160px] leading-relaxed font-[inherit]',
                'placeholder:text-grey-400 focus:outline-none',
                'max-md:min-h-[60px] max-md:p-xs max-md:text-[0.95rem]'
              )}
            />
            {examples.length > 0 && (
              <div
                className={cn(
                  'flex flex-wrap gap-sm justify-start py-xs',
                  '[&::-webkit-scrollbar]:hidden',
                  'max-md:flex-nowrap max-md:overflow-x-auto max-md:[-webkit-overflow-scrolling:touch] max-md:gap-xs'
                )}
              >
                {examples.map((example, index) => (
                  <button
                    key={index}
                    type="button"
                    className={cn(
                      'py-2 px-4 bg-background-alt border border-grey-200 dark:border-grey-700',
                      'rounded-[20px] text-foreground text-[0.9rem] font-medium',
                      'cursor-pointer transition-all duration-200 ease-in-out whitespace-nowrap',
                      'hover:not-disabled:bg-[var(--card-background)] hover:not-disabled:border-primary-600',
                      'disabled:opacity-50 disabled:cursor-not-allowed',
                      'max-md:py-1 max-md:px-2.5 max-md:text-xs max-md:shrink-0'
                    )}
                    onClick={() => handleExampleClick(example.text)}
                    disabled={isDisabled}
                  >
                    {example.label}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="submit"
            className={cn(
              'size-11 rounded-full border-none bg-primary-600 text-white',
              'flex items-center justify-center cursor-pointer',
              'transition-[background-color,transform] duration-200 ease-in-out shrink-0',
              'hover:not-disabled:bg-[var(--klee)]',
              'disabled:bg-grey-400 disabled:cursor-not-allowed',
              '[&_svg]:size-5',
              'max-md:size-[38px] max-md:[&_svg]:size-[18px]',
              isLoading && 'pointer-events-none'
            )}
            disabled={!canSubmit}
            aria-label={submitLabel}
          >
            {isLoading ? (
              <span className="size-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <HiArrowUp />
            )}
          </button>
        </div>
      </form>

      {error && (
        <motion.p
          className="text-[var(--error-red)] text-[0.9rem] mt-sm text-left"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          {error}
        </motion.p>
      )}
    </div>
  );
};

export default PromptInput;
