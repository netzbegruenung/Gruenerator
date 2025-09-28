import React, { useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import { useRecentValues } from '../../../hooks/useRecentValues';
import { FormInput } from './Input';
import EnhancedSelect from '../EnhancedSelect/EnhancedSelect';
import { useLazyAuth } from '../../../hooks/useAuth';

/**
 * SmartInput - A unified form input component that intelligently handles recent values
 *
 * Behavior:
 * - Not authenticated: Shows standard FormInput
 * - Authenticated + 0 recent values: Shows standard FormInput
 * - Authenticated + 1+ recent values: Shows CreatableSelect dropdown with recent values
 */
const SmartInput = ({
  // Field identification
  fieldType,
  formName = null,

  // Standard form props
  name,
  control,
  label,
  placeholder,
  rules,
  tabIndex,

  // Success handling
  onSubmitSuccess = null,
  shouldSave = false,

  // Recent values configuration
  maxRecentValues = 5,

  // Additional props
  className = '',
  disabled = false,
  ...inputProps
}) => {

  // Check authentication status
  const { isAuthenticated } = useLazyAuth();

  // Fetch recent values (hook handles errors gracefully)
  const {
    recentValues,
    isLoading,
    saveRecentValue,
    hasRecentValue
  } = useRecentValues(fieldType, {
    limit: maxRecentValues,
    autoSave: false // We'll handle saving manually
  });

  // Handle saving value after successful submission
  const handleSaveValue = useCallback(async () => {
    if (isAuthenticated && shouldSave && onSubmitSuccess && typeof onSubmitSuccess === 'string' && onSubmitSuccess.trim()) {
      const valueToSave = onSubmitSuccess.trim();

      // Only save if it's not already in recent values
      if (!hasRecentValue(valueToSave)) {
        try {
          await saveRecentValue(valueToSave, formName);
          console.log(`[SmartInput] Saved recent value for ${fieldType}:`, valueToSave.substring(0, 50) + '...');
        } catch (error) {
          console.error(`[SmartInput] Failed to save recent value for ${fieldType}:`, error);
        }
      }
    }
  }, [isAuthenticated, shouldSave, onSubmitSuccess, hasRecentValue, saveRecentValue, formName, fieldType]);

  // Execute save when shouldSave becomes true
  useEffect(() => {
    handleSaveValue();
  }, [handleSaveValue]);

  // Convert recent values to options format with visual indicator
  const recentOptions = useMemo(() => {
    return recentValues.map((val, index) => ({
      value: val,
      label: val,
      tag: {
        label: '✓',
        variant: 'custom'
      },
      __isRecentValue: true,
      __recentIndex: index
    }));
  }, [recentValues]);



  const showDropdown = isAuthenticated && !isLoading && recentValues.length > 0;

  // For loading state or no recent values, show regular input (FormInput has its own Controller)
  if (!showDropdown) {
    return (
      <FormInput
        name={name}
        control={control}
        label={label}
        placeholder={placeholder}
        rules={rules}
        tabIndex={tabIndex}
        className={className}
        disabled={disabled}
        {...inputProps}
      />
    );
  }

  // For CreatableSelect with recent values, use Controller
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      defaultValue=""
      render={({ field, fieldState: { error } }) => (
        <EnhancedSelect
          // Convert string value to object format for EnhancedSelect
          value={field.value ? { value: field.value, label: field.value } : null}
          onBlur={field.onBlur}

          // Form wrapper props
          inputId={name}
          label={label}
          required={rules?.required ? true : false}
          error={error?.message}

          // Enhanced features - NO isCreatable
          enableTags={true}

          // Options (recent values as suggestions only)
          options={recentOptions}
          isLoading={isLoading}

          // Handle selection from dropdown
          onChange={(selectedOption) => {
            field.onChange(selectedOption ? selectedOption.value : '');
          }}

          // Input behavior - allow typing without clearing field value
          isSearchable={true}
          onInputChange={(inputValue, actionMeta) => {
            // Only update on user input, not on blur or menu close
            if (actionMeta.action === 'input-change') {
              field.onChange(inputValue);
            }
          }}

          // Hide dropdown when no options available
          noOptionsMessage={() => null}

          // Basic configuration
          placeholder={placeholder || `${label} eingeben oder aus vorherigen Werten auswählen...`}
          isDisabled={disabled}
          className={className}
          tabIndex={tabIndex}

          {...inputProps}
        />
      )}
    />
  );
};

SmartInput.propTypes = {
  // Field identification
  fieldType: PropTypes.string.isRequired,
  formName: PropTypes.string,

  // Standard form props
  name: PropTypes.string.isRequired,
  control: PropTypes.object.isRequired,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  rules: PropTypes.object,
  tabIndex: PropTypes.number,

  // Success handling
  onSubmitSuccess: PropTypes.string, // The value to save
  shouldSave: PropTypes.bool,

  // Recent values configuration
  maxRecentValues: PropTypes.number,

  // Additional props
  className: PropTypes.string,
  disabled: PropTypes.bool
};

export default SmartInput;