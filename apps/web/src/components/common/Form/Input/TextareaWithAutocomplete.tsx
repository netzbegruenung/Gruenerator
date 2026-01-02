import { useCallback, ComponentType } from 'react';
import TextareaAutosize from 'react-textarea-autosize';
import { useTextAutocomplete, COMBINED_DICTIONARY } from '../../../../hooks/useTextAutocomplete';
import '../../../../assets/styles/components/form/form-inputs.css';

/**
 * TextareaWithAutocomplete - Standalone textarea component with ghost-text autocomplete
 *
 * This component must be separate from FormTextarea to prevent hook state loss
 * caused by component recreation on re-renders.
 */
interface TextareaWithAutocompleteProps {
  field: string | number;
  error?: Record<string, unknown>;
  textareaId?: string;
  placeholder?: string;
  disabled?: boolean;
  minRows?: number;
  maxRows?: number;
  maxLength?: number;
  className?: string;
  tabIndex?: number;
  textareaProps?: Record<string, unknown>;
  enableUrlDetection?: boolean;
  onFieldValueChange?: () => void;
  onExternalChange?: () => void;
  dictionary?: string[];
  minChars?: number;
  addHashtagOnAccept?: boolean;
  showCharacterCount?: boolean;
  CharacterCount?: ComponentType;
}

const TextareaWithAutocomplete = ({ }: TextareaWithAutocompleteProps): JSX.Element => ({
  field,
  error,
  textareaId,
  placeholder,
  disabled,
  minRows,
  maxRows,
  maxLength,
  className,
  tabIndex,
  textareaProps = {},
  enableUrlDetection = false,
  onFieldValueChange,
  onExternalChange,
  // Autocomplete options
  dictionary = COMBINED_DICTIONARY,
  minChars = 3,
  addHashtagOnAccept = true,
  // Character count
  showCharacterCount = false,
  CharacterCount
}) => {
  const autocomplete = useTextAutocomplete(field.value || '', field.onChange, {
    dictionary,
    minChars,
    addHashtagOnAccept
  });

  const handleChange = useCallback((e) => {
    autocomplete.handleChange(e);

    if (enableUrlDetection && onFieldValueChange) {
      onFieldValueChange(e.target.value);
    }

    if (onExternalChange) {
      onExternalChange(e.target.value);
    }
  }, [autocomplete, enableUrlDetection, onFieldValueChange, onExternalChange]);

  const handleKeyDown = useCallback((e) => {
    autocomplete.handleKeyDown(e);
    if (textareaProps.onKeyDown) {
      textareaProps.onKeyDown(e);
    }
  }, [autocomplete, textareaProps]);

  // Always apply wrapper class to ensure proper styling for ghost text
  const hasActiveSuggestion = !!autocomplete.suggestionSuffix;

  return (
    <div className={`textarea-autocomplete-wrapper${hasActiveSuggestion ? ' textarea-autocomplete-wrapper--active' : ''}`}>
      {hasActiveSuggestion && (
        <div className="textarea-ghost-text">
          <span className="textarea-ghost-prefix">{autocomplete.ghostPrefix}</span>
          <span className="textarea-ghost-suffix">{autocomplete.suggestionSuffix}</span>
        </div>
      )}
      <TextareaAutosize
        {...field}
        ref={(el) => {
          // Combine refs: react-hook-form ref and autocomplete ref
          if (typeof field.ref === 'function') {
            field.ref(el);
          } else if (field.ref) {
            field.ref.current = el;
          }
          autocomplete.textareaRef.current = el;
        }}
        id={textareaId}
        placeholder={placeholder}
        disabled={disabled}
        minRows={minRows}
        maxRows={maxRows}
        maxLength={maxLength}
        className={`${className} ${error ? 'error-input' : ''}`.trim()}
        tabIndex={tabIndex}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        {...textareaProps}
      />
      {hasActiveSuggestion && (
        <span className="textarea-autocomplete-hint">Tab um zu akzeptieren</span>
      )}
      {CharacterCount && <CharacterCount value={field.value} />}
    </div>
  );
};

export default TextareaWithAutocomplete;
