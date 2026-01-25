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

import type { TextFieldConfig } from '../../configs/unifiedTabs';

import './UnifiedTextSection.css';

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
    <div className="unified-font-size-stepper">
      <button
        type="button"
        className="unified-font-size-stepper__btn"
        onClick={handleDecrement}
        disabled={value <= min}
        aria-label="Schriftgröße verringern"
      >
        <FaMinus size={10} />
      </button>
      <input
        type="number"
        className="unified-font-size-stepper__input"
        value={Math.round(value)}
        onChange={handleInputChange}
        min={min}
        max={max}
        aria-label="Schriftgröße"
      />
      <button
        type="button"
        className="unified-font-size-stepper__btn"
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
    <div className="unified-textarea-wrapper">
      <textarea
        ref={textareaRef}
        id={id}
        className="unified-textarea"
        value={value}
        onChange={handleChange}
        placeholder={placeholder}
        rows={minRows}
        maxLength={maxLength}
      />
      {maxLength && (
        <div className="unified-textarea__count">
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
    <div className="unified-text-field">
      <div className="unified-text-field__header">
        <label htmlFor={fieldId} className="unified-text-field__label">
          {label}
        </label>
        {showFontSizeControl && (
          <FontSizeStepper value={fontSize} onChange={onFontSizeChange} />
        )}
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
          className="unified-text-input"
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
    <div className="sidebar-section sidebar-section--unified-text">
      <div className="unified-text-fields">
        {textFields.map((fieldConfig) => {
          const fontSize = fieldConfig.fontSizeStateKey
            ? fontSizes?.[fieldConfig.fontSizeStateKey]
            : undefined;

          const handleFontSizeChange = fieldConfig.fontSizeStateKey && onFontSizeChange
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
        Klicke auf den Text im Canvas, um ihn direkt zu bearbeiten.
        Du kannst Texte auch per Drag & Drop verschieben.
      </SidebarHint>
    </div>
  );
}
