import { buttonVariants } from '@gruenerator/ui';
import { motion } from 'motion/react';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { HiArrowLeft, HiArrowUp } from 'react-icons/hi';

import Button from '../../../components/common/SubmitButton';
import { cn } from '../../../utils/cn';
import { slideVariants } from '../components/StepFlow';

// Props Interface (copied from StepFlow.tsx)
interface FieldOption {
  value: string;
  label: string;
}

interface FormField {
  name: string;
  label: string;
  type?: 'text' | 'textarea' | 'select';
  placeholder?: string;
  helpText?: string;
  subtitle?: string;
  required?: boolean;
  minLength?: number;
  maxLength?: number;
  rows?: number;
  options?: FieldOption[];
}

export interface InputStepProps {
  field: FormField | undefined;
  value: string;
  onChange: (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>
  ) => void;
  onNext: () => void;
  onBack: () => void;
  isLastInput: boolean;
  loading: boolean;
  error: string | null;
  direction: number;
}

const InputStep: React.FC<InputStepProps> = ({
  field,
  value,
  onChange,
  onNext,
  onBack,
  isLastInput,
  loading,
  error,
  direction,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const selectRef = useRef<HTMLSelectElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    // Focus the appropriate input based on field type
    if (field?.type === 'textarea' && textareaRef.current) {
      textareaRef.current.focus();
    } else if (field?.type === 'select' && selectRef.current) {
      selectRef.current.focus();
    } else if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [field?.name, field?.type]);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
      setFieldError(null);
      onChange(e);
    },
    [onChange]
  );

  const validateAndProceed = useCallback(() => {
    if (!field) return;

    const currentValue = value || '';

    if (field.required && !currentValue.trim()) {
      setFieldError(`${field.label} ist erforderlich`);
      return;
    }

    if (field.minLength && currentValue.trim().length < field.minLength) {
      setFieldError(`Mindestens ${field.minLength} Zeichen`);
      return;
    }

    onNext();
  }, [field, value, onNext]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        if (field?.type === 'textarea' && !e.shiftKey) {
          return;
        }
        if (field?.type !== 'textarea' || e.shiftKey) {
          e.preventDefault();
          validateAndProceed();
        }
      }
    },
    [field, validateAndProceed]
  );

  const hasError = !!fieldError || !!error;
  const displayError = fieldError || error;

  return (
    <motion.div
      key={field?.name}
      custom={direction}
      variants={slideVariants}
      initial="enter"
      animate="center"
      exit="exit"
      transition={{ duration: 0.25, ease: 'easeOut' }}
      className="flex flex-col gap-md w-full"
      onKeyDown={handleKeyDown}
    >
      <div className="flex items-end gap-sm bg-[var(--card-background)] border border-grey-200 dark:border-grey-700 rounded-2xl p-sm shadow-lg transition-all focus-within:border-[var(--interactive-accent-color)]">
        <div className="flex-1 flex flex-col gap-xs min-w-0">
          {field?.type === 'textarea' ? (
            <textarea
              ref={textareaRef}
              id={field.name}
              name={field.name}
              value={value}
              onChange={handleChange}
              placeholder={field.placeholder || 'Schreibe hier...'}
              rows={field.rows || 4}
              maxLength={field.maxLength}
              disabled={loading}
              className={cn(
                'w-full border-none bg-transparent text-foreground p-sm resize-none min-h-[80px] max-h-[160px] leading-normal font-[inherit] outline-none',
                'placeholder:text-grey-400',
                hasError && 'text-[var(--error-red)]'
              )}
            />
          ) : field?.type === 'select' ? (
            <select
              ref={selectRef}
              id={field?.name}
              name={field?.name}
              value={value}
              onChange={handleChange}
              disabled={loading}
              className={cn(
                'w-full border-none bg-transparent text-foreground p-sm outline-none',
                hasError && 'text-[var(--error-red)]'
              )}
            >
              <option value="">{field?.placeholder || 'Bitte wählen...'}</option>
              {field?.options?.map((opt: FieldOption) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          ) : (
            <input
              ref={inputRef}
              type={field?.type || 'text'}
              id={field?.name}
              name={field?.name}
              value={value}
              onChange={handleChange}
              placeholder={field?.placeholder || 'Schreibe hier...'}
              disabled={loading}
              className={cn(
                'w-full border-none bg-transparent text-foreground p-sm outline-none',
                'placeholder:text-grey-400',
                hasError && 'text-[var(--error-red)]'
              )}
            />
          )}

          {field?.maxLength && value && value.length > field.maxLength - 100 && (
            <div className="text-xs text-grey-400 text-right px-sm">
              {value.length}/{field.maxLength}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={validateAndProceed}
          disabled={loading}
          className={cn(
            'w-[44px] h-[44px] rounded-full border-none bg-primary-600 text-white flex items-center justify-center cursor-pointer transition-colors shrink-0',
            'hover:bg-[var(--klee)] disabled:bg-grey-400 disabled:cursor-not-allowed',
            loading && 'pointer-events-none'
          )}
          aria-label={isLastInput ? 'Text generieren' : 'Weiter'}
        >
          {loading ? (
            <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <HiArrowUp />
          )}
        </button>
      </div>

      {displayError && (
        <motion.p
          className="text-[var(--error-red)] text-sm mt-xs"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {displayError}
        </motion.p>
      )}

      <div className="flex justify-start mt-sm">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className={buttonVariants({ variant: 'brand-outline', size: 'brand' })}
          ariaLabel="Zurück"
        />
      </div>
    </motion.div>
  );
};

export default InputStep;
