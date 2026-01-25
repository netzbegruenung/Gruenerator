import { motion } from 'motion/react';
import React, { useRef, useEffect, useCallback, useState } from 'react';
import { HiArrowLeft, HiArrowUp } from 'react-icons/hi';

import Button from '../../../components/common/SubmitButton';
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
      className="typeform-field"
      onKeyDown={handleKeyDown}
    >
      <div className="typeform-input-wrapper">
        <div className="typeform-input-content">
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
              className={`typeform-textarea ${hasError ? 'error-input' : ''}`}
            />
          ) : field?.type === 'select' ? (
            <select
              ref={selectRef}
              id={field?.name}
              name={field?.name}
              value={value}
              onChange={handleChange}
              disabled={loading}
              className={`typeform-select ${hasError ? 'error-input' : ''}`}
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
              className={`typeform-input ${hasError ? 'error-input' : ''}`}
            />
          )}

          {field?.maxLength && value && value.length > field.maxLength - 100 && (
            <div className="typeform-char-count">
              {value.length}/{field.maxLength}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={validateAndProceed}
          disabled={loading}
          className={`typeform-submit ${loading ? 'loading' : ''}`}
          aria-label={isLastInput ? 'Text generieren' : 'Weiter'}
        >
          {loading ? <span className="spinner-small" /> : <HiArrowUp />}
        </button>
      </div>

      {displayError && (
        <motion.p
          className="typeform-error"
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {displayError}
        </motion.p>
      )}

      <div className="template-input-step__actions template-input-step__actions--back-only">
        <Button
          onClick={onBack}
          text="Zurück"
          icon={<HiArrowLeft />}
          className="btn-secondary"
          ariaLabel="Zurück"
        />
      </div>
    </motion.div>
  );
};

export default InputStep;
