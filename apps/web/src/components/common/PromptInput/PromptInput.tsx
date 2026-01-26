import { motion } from 'motion/react';
import React, { useCallback, type FormEvent } from 'react';
import { HiArrowUp } from 'react-icons/hi';
import './PromptInput.css';

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
    <div className={`prompt-input-section ${className}`}>
      <form className="prompt-input-form" onSubmit={handleSubmit}>
        <div className="prompt-input-container">
          <div className="prompt-input-wrapper">
            <textarea
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              disabled={isDisabled}
              rows={minRows}
              className="prompt-input-textarea"
            />
            {examples.length > 0 && (
              <div className="prompt-input-examples">
                {examples.map((example, index) => (
                  <button
                    key={index}
                    type="button"
                    className="prompt-input-example"
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
            className={`prompt-input-submit ${isLoading ? 'loading' : ''}`}
            disabled={!canSubmit}
            aria-label={submitLabel}
          >
            {isLoading ? <span className="spinner-small" /> : <HiArrowUp />}
          </button>
        </div>
      </form>

      {error && (
        <motion.p className="prompt-input-error" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          {error}
        </motion.p>
      )}
    </div>
  );
};

export default PromptInput;
