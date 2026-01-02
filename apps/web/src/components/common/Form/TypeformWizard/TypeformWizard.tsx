import { useState, useCallback, useRef, useEffect, forwardRef, useImperativeHandle, ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { HiArrowLeft, HiArrowRight, HiCheck } from 'react-icons/hi';
import Button from '../../SubmitButton';

import './TypeformWizard.css';

const DEFAULT_LABELS = {
  back: 'Zurück',
  next: 'Weiter',
  complete: 'Fertig',
  placeholder: 'Schreibe hier...'
};

const slideVariants = {
  enter: (direction) => ({
    y: direction > 0 ? 40 : -40,
    opacity: 0
  }),
  center: {
    y: 0,
    opacity: 1
  },
  exit: (direction) => ({
    y: direction < 0 ? 40 : -40,
    opacity: 0
  })
};

interface TypeformWizardProps {
  fields: 'text' | 'textarea' | 'select';
  values: Record<string, unknown>;
  onChange: (event: React.ChangeEvent) => void;
  errors?: Record<string, unknown>;
  disabled?: boolean;
  onComplete?: () => void;
  onBack?: () => void;
  validateField?: () => void;
  labels?: {
    back?: string;
    next?: string;
    complete?: string;
    placeholder?: string
  };
  showProgress?: boolean;
  showBackOnFirst?: boolean;
}

const TypeformWizard = forwardRef(({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
  onComplete,
  onBack: parentOnBack,
  validateField,
  labels: customLabels = {},
  showProgress = false,
  showBackOnFirst = true
}, ref) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [fieldError, setFieldError] = useState(null);
  const inputRef = useRef(null);

  const labels = { ...DEFAULT_LABELS, ...customLabels };
  const currentField = fields[currentIndex];
  const isLastField = currentIndex === fields.length - 1;
  const isFirstField = currentIndex === 0;

  useImperativeHandle(ref, () => ({
    goNext: () => goNext(),
    goBack: () => handleBack(),
    isFirstField,
    isLastField,
    currentIndex,
    totalFields: fields.length,
    reset: () => {
      setCurrentIndex(0);
      setDirection(1);
      setFieldError(null);
    }
  }), [isFirstField, isLastField, currentIndex, fields.length]);

  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [currentIndex]);

  const handleFieldChange = useCallback((e) => {
    const { name, value } = e.target;
    setFieldError(null);
    if (onChange) {
      onChange({ target: { name, value } });
    }
  }, [onChange]);

  const validateCurrentField = useCallback(() => {
    if (!currentField) return true;

    const value = values?.[currentField.name] || '';

    if (currentField.required && !value.toString().trim()) {
      setFieldError(`${currentField.label} ist erforderlich`);
      return false;
    }

    if (currentField.minLength && value.toString().trim().length < currentField.minLength) {
      setFieldError(`Mindestens ${currentField.minLength} Zeichen`);
      return false;
    }

    if (validateField) {
      const externalError = validateField(currentField.name, value);
      if (externalError) {
        setFieldError(externalError);
        return false;
      }
    }

    return true;
  }, [currentField, values, validateField]);

  const goNext = useCallback(() => {
    if (!validateCurrentField()) return false;

    if (isLastField) {
      onComplete?.();
      return true;
    } else {
      setDirection(1);
      setCurrentIndex(prev => prev + 1);
      setFieldError(null);
      return true;
    }
  }, [isLastField, onComplete, validateCurrentField]);

  const goBack = useCallback(() => {
    if (!isFirstField) {
      setDirection(-1);
      setCurrentIndex(prev => prev - 1);
      setFieldError(null);
      return true;
    }
    return false;
  }, [isFirstField]);

  const handleBack = useCallback(() => {
    if (isFirstField) {
      if (showBackOnFirst) {
        parentOnBack?.();
      }
    } else {
      goBack();
    }
  }, [isFirstField, showBackOnFirst, parentOnBack, goBack]);

  const handleKeyDown = useCallback((e) => {
    if (e.key === 'Enter') {
      if (currentField?.type === 'textarea' && !e.shiftKey) {
        return;
      }
      if (currentField?.type !== 'textarea' || e.shiftKey) {
        e.preventDefault();
        goNext();
      }
    }
  }, [currentField, goNext]);

  const renderInput = () => {
    const value = values?.[currentField?.name] || '';
    const hasError = !!fieldError || !!errors?.[currentField?.name];

    if (currentField?.type === 'select') {
      return (
        <select
          ref={inputRef}
          id={currentField.name}
          name={currentField.name}
          value={value}
          onChange={handleFieldChange}
          disabled={disabled}
          className={`typeform-select ${hasError ? 'error-input' : ''}`}
        >
          <option value="">{labels.placeholder}</option>
          {currentField.options?.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      );
    }

    if (currentField?.type === 'textarea') {
      return (
        <textarea
          ref={inputRef}
          id={currentField.name}
          name={currentField.name}
          value={value}
          onChange={handleFieldChange}
          placeholder={labels.placeholder}
          rows={currentField.rows || 1}
          maxLength={currentField.maxLength}
          disabled={disabled}
          className={`typeform-textarea ${hasError ? 'error-input' : ''}`}
        />
      );
    }

    return (
      <input
        ref={inputRef}
        type={currentField?.type || 'text'}
        id={currentField?.name}
        name={currentField?.name}
        value={value}
        onChange={handleFieldChange}
        placeholder={labels.placeholder}
        disabled={disabled}
        className={`typeform-input ${hasError ? 'error-input' : ''}`}
      />
    );
  };

  if (!fields || fields.length === 0) return null;

  const displayError = fieldError || errors?.[currentField?.name];
  const showBackButton = showBackOnFirst || !isFirstField;

  return (
    <div className="typeform-container" onKeyDown={handleKeyDown}>
      <div className="typeform-content">
        {showProgress && (
          <div className="typeform-progress">
            <span className="typeform-progress__text">
              {currentIndex + 1} / {fields.length}
            </span>
            <div className="typeform-progress__bar">
              <div
                className="typeform-progress__fill"
                style={{ width: `${((currentIndex + 1) / fields.length) * 100}%` }}
              />
            </div>
          </div>
        )}

        <AnimatePresence mode="wait" custom={direction}>
          <motion.div
            key={currentIndex}
            custom={direction}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ duration: 0.25, ease: 'easeOut' }}
            className="typeform-field"
          >
            <div className="typeform-question">
              <span className="typeform-question__text">
                {currentField?.label}
                {currentField?.required && <span className="typeform-required">*</span>}
              </span>
              {currentField?.placeholder && (
                <p className="typeform-question__subheader">{currentField.placeholder}</p>
              )}
            </div>

            <div className="typeform-input-wrapper">
              {renderInput()}

              {displayError && (
                <motion.p
                  className="typeform-error"
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  {displayError}
                </motion.p>
              )}
            </div>
          </motion.div>
        </AnimatePresence>

        <div className="typeform-actions">
          {showBackButton && (
            <Button
              onClick={handleBack}
              text={labels.back}
              icon={<HiArrowLeft />}
              className="submit-button"
              ariaLabel={labels.back}
            />
          )}
          <Button
            onClick={goNext}
            loading={disabled}
            text={isLastField ? labels.complete : labels.next}
            icon={isLastField ? <HiCheck /> : <HiArrowRight />}
            className="form-button"
            ariaLabel={isLastField ? labels.complete : labels.next}
          />
        </div>
      </div>
    </div>
  );
});

TypeformWizard.displayName = 'TypeformWizard';

export default TypeformWizard;
