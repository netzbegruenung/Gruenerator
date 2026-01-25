import { type JSX, useCallback, useMemo } from 'react';
import CreatableSelect from 'react-select/creatable';

import { useRecentValues } from '../../../hooks/useRecentValues';

import FormFieldWrapper from './Input/FormFieldWrapper';

import type { MultiValue, SingleValue, ActionMeta, StylesConfig, GroupBase } from 'react-select';

/**
 * RecentValuesDropdown - A dropdown that shows recent values and allows free typing
 * Uses CreatableSelect to combine autocomplete suggestions with free text input
 */
interface SelectOption {
  value: string;
  label: string;
  [key: string]: unknown;
}

interface RecentValuesDropdownProps {
  // Field configuration
  fieldType: string;
  value?: string | number;
  onChange?: (value: string | string[]) => void;
  onBlur?: (event: React.FocusEvent<HTMLDivElement>) => void;
  // Form props
  name?: string;
  label?: string;
  placeholder?: string;
  helpText?: string;
  required?: boolean;
  error?: string;
  disabled?: boolean;
  // Recent values configuration
  maxRecentValues?: number;
  autoSave?: boolean;
  formName?: string;
  showClearButton?: boolean;
  // UI customization
  isClearable?: boolean;
  isSearchable?: boolean;
  isMulti?: boolean;
  className?: string;
  classNamePrefix?: string;
  tabIndex?: number;
  [key: string]: unknown;
}

const RecentValuesDropdown = ({
  // Field configuration
  fieldType,
  value,
  onChange,
  onBlur,

  // Form props
  name,
  label,
  placeholder = 'Eingeben oder aus vorherigen Werten auswählen...',
  helpText,
  required = false,
  error,
  disabled = false,

  // Recent values configuration
  maxRecentValues = 5,
  autoSave = true,
  formName,
  showClearButton = true,

  // UI customization
  isClearable = true,
  isSearchable = true,
  isMulti = false,
  className = '',
  classNamePrefix = 'recent-values-select',
  tabIndex,

  // Additional react-select props
  ...selectProps
}: RecentValuesDropdownProps): JSX.Element => {
  // Fetch recent values using the custom hook
  const { recentValues, isLoading, saveRecentValue, clearRecentValues, hasRecentValue } =
    useRecentValues(fieldType, {
      limit: maxRecentValues,
      autoSave,
    });

  // Convert recent values to options format
  const recentOptions = useMemo(() => {
    return recentValues.map((val, index) => ({
      value: val,
      label: val,
      // Add metadata to distinguish recent values
      __isRecentValue: true,
      __recentIndex: index,
    }));
  }, [recentValues]);

  // Convert current value to option format if needed
  const currentOption = useMemo(() => {
    if (!value) return null;

    // For multi-select
    if (isMulti && Array.isArray(value)) {
      return value.map((v) => ({
        value: v,
        label: String(v),
      }));
    }

    // For single select - convert string or number to option format
    if (typeof value === 'string' || typeof value === 'number') {
      return {
        value: String(value),
        label: String(value),
      };
    }

    // If already in option format, return null (shouldn't happen with current prop types)
    return null;
  }, [value, isMulti]);

  /**
   * Handle selection change
   */
  const handleChange = useCallback(
    (
      selectedOption: MultiValue<SelectOption> | SingleValue<SelectOption>,
      _actionMeta: ActionMeta<SelectOption>
    ) => {
      // Extract the value(s) from the option(s)
      let newValue: string | string[];

      if (!selectedOption) {
        newValue = isMulti ? [] : '';
      } else if (isMulti) {
        const options = selectedOption as MultiValue<SelectOption>;
        newValue = options.map((opt) => opt.value);
      } else {
        const option = selectedOption as SingleValue<SelectOption>;
        newValue = option ? option.value : '';
      }

      // Call the parent onChange with the extracted value
      if (onChange) {
        onChange(newValue);
      }
    },
    [onChange, isMulti]
  );

  /**
   * Handle blur event - save value if autoSave is enabled
   */
  const handleBlur = useCallback(() => {
    if (onBlur) {
      onBlur({} as React.FocusEvent<HTMLDivElement>);
    }

    // Auto-save on blur if value is new
    if (autoSave && value && !hasRecentValue(String(value))) {
      if (isMulti && Array.isArray(value)) {
        // Save each new value in multi-select
        value.forEach((v) => {
          if (v && !hasRecentValue(String(v))) {
            void saveRecentValue(String(v), formName || undefined);
          }
        });
      } else if (typeof value === 'string' && value.trim()) {
        void saveRecentValue(value, formName || undefined);
      }
    }
  }, [onBlur, autoSave, value, hasRecentValue, saveRecentValue, formName, isMulti]);

  /**
   * Handle creation of new option
   */
  const handleCreate = useCallback(
    (inputValue: string) => {
      const trimmedValue = inputValue.trim();
      if (!trimmedValue) return;

      const newOption: SelectOption = {
        value: trimmedValue,
        label: trimmedValue,
      };

      const createAction: ActionMeta<SelectOption> = { action: 'create-option', option: newOption };

      // For multi-select, add to existing values
      if (isMulti) {
        const currentValues = Array.isArray(currentOption) ? currentOption : [];
        handleChange([...currentValues, newOption], createAction);
      } else {
        handleChange(newOption, createAction);
      }

      // Save the new value immediately if autoSave is enabled
      if (autoSave) {
        void saveRecentValue(trimmedValue, formName || undefined);
      }
    },
    [handleChange, isMulti, currentOption, autoSave, saveRecentValue, formName]
  );

  /**
   * Custom styles for the select component
   */
  const customStyles = useMemo(
    (): StylesConfig<SelectOption, boolean, GroupBase<SelectOption>> => ({
      container: (provided) => ({
        ...provided,
        fontSize: 'var(--form-element-font-size)',
      }),
      control: (provided, state) => ({
        ...provided,
        borderColor: error
          ? 'var(--error-color, #e74c3c)'
          : state.isFocused
            ? 'var(--interactive-accent-color)'
            : 'var(--input-border)',
        backgroundColor: disabled
          ? 'var(--input-disabled-background, #f5f5f5)'
          : 'var(--input-background, #fff)',
        '&:hover': {
          borderColor: error ? 'var(--error-color, #e74c3c)' : 'var(--interactive-accent-color)',
        },
      }),
      menu: (provided) => ({
        ...provided,
        zIndex: 9999,
      }),
      option: (provided, state) => ({
        ...provided,
        backgroundColor: state.isSelected
          ? 'var(--button-color)'
          : state.isFocused
            ? 'var(--klee-light, #e8f5e9)'
            : 'transparent',
        color: state.isSelected ? 'white' : 'var(--font-color)',
        fontSize: 'var(--form-element-font-size)',
        fontStyle: (state.data as SelectOption)?.__isRecentValue ? 'normal' : 'normal',
        '&:before': (state.data as SelectOption)?.__isRecentValue
          ? {
              content: '"✓ "',
              color: 'var(--success-color, #27ae60)',
              marginRight: '4px',
            }
          : {},
      }),
      placeholder: (provided) => ({
        ...provided,
        color: 'var(--input-placeholder-color, #999)',
      }),
    }),
    [error, disabled]
  );

  /**
   * Format the "create" label
   */
  const formatCreateLabel = useCallback((inputValue: string) => {
    return `Neuer Wert: "${inputValue}"`;
  }, []);

  /**
   * Custom components
   */
  interface SelectPropsWithComponents {
    components?: Record<string, unknown>;
    [key: string]: unknown;
  }
  const selectPropsTyped = selectProps as SelectPropsWithComponents;
  const components = useMemo(
    () => ({
      ...(selectPropsTyped?.components || {}),
      // Could add custom components here if needed
    }),
    [selectPropsTyped?.components]
  );

  const selectElement = (
    <CreatableSelect
      // Core props
      name={name}
      value={currentOption}
      onChange={handleChange}
      onBlur={handleBlur}
      onCreateOption={handleCreate}
      // Options
      options={recentOptions}
      isLoading={isLoading}
      // UI Configuration
      placeholder={placeholder}
      isDisabled={disabled}
      isClearable={isClearable}
      isSearchable={isSearchable}
      isMulti={isMulti}
      // Styling
      className={className}
      classNamePrefix={classNamePrefix}
      styles={customStyles}
      // Labels and messages
      formatCreateLabel={formatCreateLabel}
      noOptionsMessage={() => 'Keine vorherigen Werte gefunden'}
      loadingMessage={() => 'Lade vorherige Werte...'}
      // Behavior
      createOptionPosition="first"
      closeMenuOnSelect={!isMulti}
      hideSelectedOptions={false}
      menuPortalTarget={typeof document !== 'undefined' ? document.body : null}
      menuPosition="fixed"
      tabIndex={tabIndex}
      // Additional props
      {...selectProps}
      // Components override
      components={components}
    />
  );

  // Clear button for recent values
  const clearButton = showClearButton && recentValues.length > 0 && (
    <button
      type="button"
      onClick={() => void clearRecentValues()}
      className="recent-values-clear-button"
      disabled={disabled}
      title="Verlauf löschen"
      style={{
        marginTop: '4px',
        fontSize: '0.85em',
        color: 'var(--muted-color, #666)',
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        textDecoration: 'underline',
      }}
    >
      Verlauf löschen
    </button>
  );

  // If no wrapper props, return just the select
  if (!label && !helpText && !error) {
    return (
      <div className="recent-values-dropdown">
        {selectElement}
        {clearButton}
      </div>
    );
  }

  // Return wrapped in FormFieldWrapper
  return (
    <FormFieldWrapper
      label={label}
      helpText={helpText}
      required={required}
      error={error}
      htmlFor={name}
    >
      <div className="recent-values-dropdown">
        {selectElement}
        {clearButton}
      </div>
    </FormFieldWrapper>
  );
};

export default RecentValuesDropdown;
