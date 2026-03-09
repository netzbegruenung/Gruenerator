/**
 * UnifiedTextSection - Dynamic text editing section for unified tab system
 *
 * This component renders text input fields based on a configuration array,
 * allowing it to work with any template type in the heterogeneous multi-page system.
 *
 * Instead of having template-specific text sections (ZitatTextSection, InfoTextSection, etc.),
 * this single component adapts to render the appropriate fields based on config.textFields.
 *
 * Features:
 * - Dynamic field rendering based on textFields config
 * - Optional font size controls per field
 * - Character count display for fields with maxLength
 * - Auto-expanding textareas
 */

import { useCallback, useRef, useEffect } from 'react';
import { FaMinus, FaPlus } from 'react-icons/fa';

import { SidebarHint } from '../components/SidebarHint';
import { SIDEBAR_SECTION } from '../primitives';

import type { TextFieldConfig } from '../../configs/unifiedTabs';

import { cn } from '@/utils/cn';

// ============================================================================
// TYPES
// ============================================================================

export interface UnifiedTextSectionProps {
  /** Text field configurations from the template config */
  textFields: TextFieldConfig[];
  /** Current state values for each text field */
  values: Record<string, string>;
  /** Handler for text changes */
  onFieldChange: (key: string, value: string) => void;
  /** Optional: Current font sizes for fields with font size controls */
  fontSizes?: Record<string, number>;
  /** Optional: Handler for font size changes */
  onFontSizeChange?: (key: string, size: number) => void;
}

// ============================================================================
// FONT SIZE STEPPER COMPONENT
// ============================================================================

interface FontSizeStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}

function FontSizeStepper({ value, onChange, min = 12, max = 200 }: FontSizeStepperProps) {
  const handleDecrement = () => {
    if (value > min) onChange(value - 1);
  };

  const handleIncrement = () => {
    if (value < max) onChange(value + 1);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newValue = parseInt(e.target.value, 10);
    if (!isNaN(newValue) && newValue >= min && newValue <= max) {
      onChange(newValue);
    }
  };

  return (
    <div className="flex items-center gap-0.5 bg-grey-100 dark:bg-grey-800 rounded-full p-0.5 max-canvas-mobile:[&_button]:w-5 max-canvas-mobile:[&_button]:h-5">
      <button
        type="button"
        className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:not-disabled:bg-hover-alt hover:not-disabled:text-primary-600 active:not-disabled:bg-grey-100 active:not-disabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:text-grey-400"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Schriftgröße verringern"
      >
        <FaMinus size={10} />
      </button>
      <input
        type="number"
        className="w-9 h-6 border-none bg-transparent text-center text-[0.8125rem] font-semibold text-foreground tabular-nums p-0 [appearance:textfield] [-moz-appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none focus:outline-none max-canvas-mobile:w-8 max-canvas-mobile:h-5 max-canvas-mobile:text-xs"
        value={Math.round(value)}
        onChange={handleInputChange}
        min={min}
        max={max}
        aria-label="Schriftgröße"
      />
      <button
        type="button"
        className="w-6 h-6 rounded-full border-none bg-transparent cursor-pointer flex items-center justify-center text-foreground transition-[background-color,color] duration-200 hover:not-disabled:bg-hover-alt hover:not-disabled:text-primary-600 active:not-disabled:bg-grey-100 active:not-disabled:dark:bg-grey-800 disabled:opacity-30 disabled:cursor-not-allowed disabled:text-grey-400"
        onClick={handleIncrement}
        disabled={value >= max}
        aria-label="Schriftgröße erhöhen"
      >
        <FaPlus size={10} />
      </button>
    </div>
  );
}

// ============================================================================
// AUTO-EXPANDING TEXTAREA COMPONENT
// ============================================================================

interface AutoExpandTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  maxLength?: number;
  minRows?: number;
  id: string;
}

function AutoExpandTextarea({
  value,
  onChange,
  placeholder,
  maxLength,
  minRows = 3,
  id,
}: AutoExpandTextareaProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  }, []);

  useEffect(() => {
    adjustHeight();
  }, [value, adjustHeight]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    if (maxLength && newValue.length > maxLength) return;
    onChange(newValue);
  };

  return (
    <div className="relative">
      <textarea
        ref={textareaRef}
        id={id}
        className="w-full py-[var(--spacing-small)] px-[var(--spacing-medium)] text-[0.9375rem] font-[inherit] text-foreground bg-background border border-grey-200 dark:border-grey-700 rounded-lg outline-none resize-none overflow-hidden leading-relaxed transition-[border-color,box-shadow] duration-200 focus:border-primary-600 focus:shadow-[0_0_0_3px_var(--primary-100)] placeholder:text-foreground-muted"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={minRows}
        maxLength={maxLength}
      />
      {maxLength && (
        <div className="absolute bottom-[var(--spacing-small)] right-[var(--spacing-small)] text-xs text-foreground-muted bg-background px-[var(--spacing-xxsmall)] rounded-[var(--border-radius-small)]">
          {value.length} / {maxLength}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// SINGLE FIELD COMPONENT
// ============================================================================

interface TextFieldProps {
  config: TextFieldConfig;
  value: string;
  onChange: (value: string) => void;
  fontSize?: number;
  onFontSizeChange?: (size: number) => void;
}

function TextField({ config, value, onChange, fontSize, onFontSizeChange }: TextFieldProps) {
  const { key, label, placeholder, multiline = true, maxLength, minRows } = config;
  const fieldId = `unified-text-field-${key}`;

  const showFontSizeControl = fontSize !== undefined && onFontSizeChange !== undefined;

  return (
    <div className="flex flex-col gap-[var(--spacing-small)]">
      <div className="flex justify-between items-center min-h-7 max-canvas-mobile:flex-wrap max-canvas-mobile:gap-[var(--spacing-small)]">
        <label htmlFor={fieldId} className="text-sm font-semibold text-foreground">
          {label}
        </label>
        {showFontSizeControl && <FontSizeStepper value={fontSize} onChange={onFontSizeChange} />}
      </div>

      {multiline ? (
        <AutoExpandTextarea
          id={fieldId}
          value={value}
          onChange={onChange}
          placeholder={placeholder || `${label} eingeben...`}
          maxLength={maxLength}
          minRows={minRows}
        />
      ) : (
        <input
          id={fieldId}
          type="text"
          className="w-full py-[var(--spacing-small)] px-[var(--spacing-medium)] text-[0.9375rem] font-[inherit] text-foreground bg-background border border-grey-200 dark:border-grey-700 rounded-lg outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary-600 focus:shadow-[0_0_0_3px_var(--primary-100)] placeholder:text-foreground-muted"
          value={value}
          onChange={(e) => {
            const newValue = e.target.value;
            if (maxLength && newValue.length > maxLength) return;
            onChange(newValue);
          }}
          placeholder={placeholder || `${label} eingeben...`}
          maxLength={maxLength}
        />
      )}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function UnifiedTextSection({
  textFields,
  values,
  onFieldChange,
  fontSizes,
  onFontSizeChange,
}: UnifiedTextSectionProps) {
  return (
    <div
      className={cn(
        SIDEBAR_SECTION,
        'gap-[var(--spacing-medium)] p-[var(--spacing-medium)] max-canvas-mobile:p-[var(--spacing-small)]'
      )}
    >
      <div className="flex flex-col gap-[var(--spacing-large)] max-canvas-mobile:gap-[var(--spacing-medium)]">
        {textFields.map((fieldConfig) => {
          const fontSize = fieldConfig.fontSizeStateKey
            ? fontSizes?.[fieldConfig.fontSizeStateKey]
            : undefined;

          const handleFontSizeChange =
            fieldConfig.fontSizeStateKey && onFontSizeChange
              ? (size: number) => onFontSizeChange(fieldConfig.fontSizeStateKey!, size)
              : undefined;

          return (
            <TextField
              key={fieldConfig.key}
              config={fieldConfig}
              value={values[fieldConfig.key] || ''}
              onChange={(val) => onFieldChange(fieldConfig.key, val)}
              fontSize={fontSize}
              onFontSizeChange={handleFontSizeChange}
            />
          );
        })}
      </div>

      <SidebarHint>
        Klicke auf den Text im Canvas, um ihn direkt zu bearbeiten. Du kannst Texte auch per Drag &
        Drop verschieben.
      </SidebarHint>
    </div>
  );
}
