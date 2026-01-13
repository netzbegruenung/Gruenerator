import React, { useEffect, useMemo, useCallback } from 'react';
import { Controller, Control } from 'react-hook-form';
import { useRecentValues } from '../../../hooks/useRecentValues';
import { FormInput } from './Input';
import EnhancedSelect from '../EnhancedSelect/EnhancedSelect';
import { useLazyAuth } from '../../../hooks/useAuth';

interface SmartInputProps {
  fieldType: string;
  formName?: string | null;
  name: string;
  control: Control<Record<string, unknown>>;
  label?: string;
  placeholder?: string;
  rules?: Record<string, unknown>;
  tabIndex?: number;
  setValue?: (name: string, value: unknown, options?: Record<string, unknown>) => void;
  getValues?: (name?: string) => unknown;
  onSubmitSuccess?: string | null;
  shouldSave?: boolean;
  maxRecentValues?: number;
  className?: string;
  disabled?: boolean;
  subtext?: string;
  [key: string]: unknown;
}

interface RecentOption {
  value: string;
  label: string;
  tag: {
    label: string;
    variant: string;
  };
  __isRecentValue: boolean;
  __recentIndex: number;
  [key: string]: unknown;
}

/**
 * SmartInput - A unified form input component that intelligently handles recent values
 *
 * Behavior:
 * - Not authenticated: Shows standard FormInput
 * - Authenticated + 0 recent values: Shows standard FormInput
 * - Authenticated + 1+ recent values: Shows CreatableSelect dropdown with recent values
 */
const SmartInput: React.FC<SmartInputProps> = ({
  fieldType,
  formName = null,
  name,
  control,
  label,
  placeholder,
  rules,
  tabIndex,
  setValue,
  getValues,
  onSubmitSuccess = null,
  shouldSave = false,
  maxRecentValues = 5,
  className = '',
  disabled = false,
  ...inputProps
}) => {
  const { isAuthenticated } = useLazyAuth();

  const {
    recentValues,
    isLoading,
    saveRecentValue,
    hasRecentValue
  } = useRecentValues(fieldType, {
    limit: maxRecentValues,
    autoSave: false
  });

  const handleSaveValue = useCallback(async () => {
    if (isAuthenticated && shouldSave && onSubmitSuccess && typeof onSubmitSuccess === 'string' && onSubmitSuccess.trim()) {
      const valueToSave = onSubmitSuccess.trim();

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

  useEffect(() => {
    handleSaveValue();
  }, [handleSaveValue]);

  useEffect(() => {
    if (isAuthenticated && !isLoading && recentValues.length > 0 && setValue && getValues) {
      const currentValue = getValues(name);
      if (!currentValue) {
        setValue(name, recentValues[0], {
          shouldValidate: false,
          shouldDirty: false
        });
      }
    }
  }, [isAuthenticated, isLoading, recentValues, name, setValue, getValues]);

  const recentOptions: RecentOption[] = useMemo(() => {
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

  return (
    <Controller
      name={name}
      control={control}
      rules={rules}
      defaultValue=""
      render={({ field, fieldState: { error } }) => (
        <EnhancedSelect
          value={field.value ? { value: field.value, label: field.value } : null}
          onBlur={field.onBlur}
          inputId={name}
          label={label}
          required={rules?.required ? true : false}
          error={error?.message}
          enableTags={true}
          options={recentOptions}
          isLoading={isLoading}
          onChange={(selectedOption: RecentOption | null) => {
            field.onChange(selectedOption ? selectedOption.value : '');
          }}
          isSearchable={true}
          onInputChange={(inputValue: string, actionMeta: { action: string }) => {
            if (actionMeta.action === 'input-change') {
              field.onChange(inputValue);
            }
          }}
          noOptionsMessage={() => null}
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

export default SmartInput;
