import React, { useCallback, useEffect, useMemo } from 'react';
import PropTypes from 'prop-types';
import CreatableSelect from 'react-select/creatable';
import FormFieldWrapper from './Input/FormFieldWrapper';
import { useRecentValues } from '../../../hooks/useRecentValues';

/**
 * RecentValuesDropdown - A dropdown that shows recent values and allows free typing
 * Uses CreatableSelect to combine autocomplete suggestions with free text input
 */
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
  formName = null,
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
}) => {
  // Fetch recent values using the custom hook
  const {
    recentValues,
    isLoading,
    saveRecentValue,
    clearRecentValues,
    hasRecentValue
  } = useRecentValues(fieldType, {
    limit: maxRecentValues,
    autoSave
  });

  // Convert recent values to options format
  const recentOptions = useMemo(() => {
    return recentValues.map((val, index) => ({
      value: val,
      label: val,
      // Add metadata to distinguish recent values
      __isRecentValue: true,
      __recentIndex: index
    }));
  }, [recentValues]);

  // Convert current value to option format if needed
  const currentOption = useMemo(() => {
    if (!value) return null;

    // For multi-select
    if (isMulti && Array.isArray(value)) {
      return value.map(v => ({
        value: v,
        label: v
      }));
    }

    // For single select
    if (typeof value === 'string') {
      return {
        value: value,
        label: value
      };
    }

    // If already in option format
    return value;
  }, [value, isMulti]);

  /**
   * Handle selection change
   */
  const handleChange = useCallback((selectedOption) => {
    // Extract the value(s) from the option(s)
    let newValue;

    if (!selectedOption) {
      newValue = isMulti ? [] : '';
    } else if (isMulti) {
      newValue = Array.isArray(selectedOption)
        ? selectedOption.map(opt => opt.value)
        : [];
    } else {
      newValue = selectedOption.value || '';
    }

    // Call the parent onChange with the extracted value
    if (onChange) {
      onChange(newValue);
    }
  }, [onChange, isMulti]);

  /**
   * Handle blur event - save value if autoSave is enabled
   */
  const handleBlur = useCallback(() => {
    if (onBlur) {
      onBlur();
    }

    // Auto-save on blur if value is new
    if (autoSave && value && !hasRecentValue(value)) {
      if (isMulti && Array.isArray(value)) {
        // Save each new value in multi-select
        value.forEach(v => {
          if (v && !hasRecentValue(v)) {
            saveRecentValue(v, formName);
          }
        });
      } else if (typeof value === 'string' && value.trim()) {
        saveRecentValue(value, formName);
      }
    }
  }, [onBlur, autoSave, value, hasRecentValue, saveRecentValue, formName, isMulti]);

  /**
   * Handle creation of new option
   */
  const handleCreate = useCallback((inputValue) => {
    const trimmedValue = inputValue.trim();
    if (!trimmedValue) return;

    const newOption = {
      value: trimmedValue,
      label: trimmedValue
    };

    // For multi-select, add to existing values
    if (isMulti) {
      const currentValues = currentOption || [];
      handleChange([...currentValues, newOption]);
    } else {
      handleChange(newOption);
    }

    // Save the new value immediately if autoSave is enabled
    if (autoSave) {
      saveRecentValue(trimmedValue, formName);
    }
  }, [handleChange, isMulti, currentOption, autoSave, saveRecentValue, formName]);

  /**
   * Custom styles for the select component
   */
  const customStyles = useMemo(() => ({
    container: (provided) => ({
      ...provided,
      fontSize: 'var(--form-element-font-size)'
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
        borderColor: error
          ? 'var(--error-color, #e74c3c)'
          : 'var(--interactive-accent-color)'
      }
    }),
    menu: (provided) => ({
      ...provided,
      zIndex: 9999
    }),
    option: (provided, state) => ({
      ...provided,
      backgroundColor: state.isSelected
        ? 'var(--button-color)'
        : state.isFocused
          ? 'var(--klee-light, #e8f5e9)'
          : 'transparent',
      color: state.isSelected
        ? 'white'
        : 'var(--font-color)',
      fontSize: 'var(--form-element-font-size)',
      fontStyle: state.data?.__isRecentValue ? 'normal' : 'normal',
      '&:before': state.data?.__isRecentValue ? {
        content: '"✓ "',
        color: 'var(--success-color, #27ae60)',
        marginRight: '4px'
      } : {}
    }),
    placeholder: (provided) => ({
      ...provided,
      color: 'var(--input-placeholder-color, #999)'
    })
  }), [error, disabled]);

  /**
   * Format the "create" label
   */
  const formatCreateLabel = useCallback((inputValue) => {
    return `Neuer Wert: "${inputValue}"`;
  }, []);

  /**
   * Custom components
   */
  const components = useMemo(() => ({
    ...(selectProps?.components || {}),
    // Could add custom components here if needed
  }), [selectProps?.components]);

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
      onClick={() => clearRecentValues()}
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
        textDecoration: 'underline'
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
      {selectElement}
      {clearButton}
    </FormFieldWrapper>
  );
};

RecentValuesDropdown.propTypes = {
  // Field configuration
  fieldType: PropTypes.string.isRequired,
  value: PropTypes.oneOfType([
    PropTypes.string,
    PropTypes.array,
    PropTypes.object
  ]),
  onChange: PropTypes.func,
  onBlur: PropTypes.func,

  // Form props
  name: PropTypes.string,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  helpText: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
  disabled: PropTypes.bool,

  // Recent values configuration
  maxRecentValues: PropTypes.number,
  autoSave: PropTypes.bool,
  formName: PropTypes.string,
  showClearButton: PropTypes.bool,

  // UI customization
  isClearable: PropTypes.bool,
  isSearchable: PropTypes.bool,
  isMulti: PropTypes.bool,
  className: PropTypes.string,
  classNamePrefix: PropTypes.string,
  tabIndex: PropTypes.number
};

export default RecentValuesDropdown;