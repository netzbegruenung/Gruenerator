import React, { useEffect, useMemo, useCallback } from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import { useRecentValues } from '../../../hooks/useRecentValues';
import RecentValuesDropdown from './RecentValuesDropdown';
import { useFormFields } from './hooks';

/**
 * SmartFormInput - A generic form input component that intelligently handles recent values
 *
 * Behavior:
 * - 0 recent values: Shows standard Input
 * - 1+ recent values: Shows RecentValuesDropdown for selection
 */
const SmartFormInput = ({
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

  // Additional props for Input component
  className = '',
  disabled = false,
  ...inputProps
}) => {
  const { Input } = useFormFields();

  // Fetch recent values
  const {
    recentValues,
    isLoading,
    saveRecentValue,
    hasRecentValue
  } = useRecentValues(fieldType, {
    limit: maxRecentValues,
    autoSave: false // We'll handle saving manually
  });

  // Determine component type based on recent values count
  const componentType = useMemo(() => {
    if (isLoading) return 'input'; // Show input while loading
    if (recentValues.length === 0) return 'input';
    return 'dropdown'; // Show dropdown for 1 or more recent values
  }, [recentValues.length, isLoading]);

  // Default value is empty since dropdown handles recent values
  const defaultValue = '';

  // Handle saving value after successful submission
  const handleSaveValue = useCallback(async () => {
    if (shouldSave && onSubmitSuccess && typeof onSubmitSuccess === 'string' && onSubmitSuccess.trim()) {
      const valueToSave = onSubmitSuccess.trim();

      // Only save if it's not already in recent values
      if (!hasRecentValue(valueToSave)) {
        try {
          await saveRecentValue(valueToSave, formName);
          console.log(`[SmartFormInput] Saved recent value for ${fieldType}:`, valueToSave.substring(0, 50) + '...');
        } catch (error) {
          console.error(`[SmartFormInput] Failed to save recent value for ${fieldType}:`, error);
        }
      }
    }
  }, [shouldSave, onSubmitSuccess, hasRecentValue, saveRecentValue, formName, fieldType]);

  // Execute save when shouldSave becomes true
  useEffect(() => {
    handleSaveValue();
  }, [handleSaveValue]);

  // Use Controller to properly integrate with react-hook-form
  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      defaultValue={defaultValue}
      render={({ field, fieldState: { error } }) => {
        // Render the appropriate component based on recent values
        if (componentType === 'dropdown') {
          return (
            <RecentValuesDropdown
              fieldType={fieldType}
              name={name}
              label={label}
              placeholder={placeholder || `${label} eingeben oder aus vorherigen Werten auswählen...`}
              required={rules?.required ? true : false}
              error={error?.message}
              disabled={disabled}
              maxRecentValues={maxRecentValues}
              autoSave={false} // We handle saving manually
              formName={formName}
              tabIndex={tabIndex}
              className={className}

              // Control integration for react-hook-form using field object
              value={field.value}
              onChange={field.onChange}
              onBlur={field.onBlur}

              {...inputProps}
            />
          );
        }

        // For 'input', render standard Input
        return (
          <Input
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
      }}
    />
  );
};

SmartFormInput.propTypes = {
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

export default SmartFormInput;