import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Controller, type Control } from 'react-hook-form';

import { useRecentValues } from '../../../hooks/useRecentValues';
import { useAuthStore } from '../../../stores/authStore';
import EnhancedSelect from '../EnhancedSelect/EnhancedSelect';

import { FormInput } from './Input';

import type { EnhancedSelectOption } from '../EnhancedSelect/EnhancedSelect';
import type { ActionMeta, SingleValue, MultiValue } from 'react-select';

interface SmartInputProps {
  fieldType: string;
  formName?: string | null;
  name: string;
  control: Control<Record<string, unknown>>;
  label?: string;
  placeholder?: string;
  rules?: Record<string, unknown>;
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

interface RecentOption extends EnhancedSelectOption {
  value: string;
  label: string;
  tag: {
    label: string;
    variant: string;
  };
  __isRecentValue: boolean;
  __recentIndex: number;
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
  setValue,
  getValues,
  onSubmitSuccess = null,
  shouldSave = false,
  maxRecentValues = 5,
  className = '',
  disabled = false,
  ...inputProps
}) => {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { recentValues, isLoading, saveRecentValue, hasRecentValue } = useRecentValues(fieldType, {
    limit: maxRecentValues,
    autoSave: false,
  });

  const prevSubmitRef = useRef<string | null>(null);
  const hasPrefilledRef = useRef(false);

  // Save recent value when onSubmitSuccess changes to a new non-null string
  useEffect(() => {
    if (
      !isAuthenticated ||
      !shouldSave ||
      !onSubmitSuccess ||
      typeof onSubmitSuccess !== 'string' ||
      !onSubmitSuccess.trim()
    )
      return;

    const valueToSave = onSubmitSuccess.trim();
    if (valueToSave === prevSubmitRef.current) return;
    prevSubmitRef.current = valueToSave;

    if (!hasRecentValue(valueToSave)) {
      saveRecentValue(valueToSave, formName).catch((error) => {
        console.error(`[SmartInput] Failed to save recent value for ${fieldType}:`, error);
      });
    }
  }, [
    onSubmitSuccess,
    isAuthenticated,
    shouldSave,
    hasRecentValue,
    saveRecentValue,
    formName,
    fieldType,
  ]);

  // Pre-fill with first recent value (once, after initial load)
  useEffect(() => {
    if (hasPrefilledRef.current) return;
    if (isAuthenticated && !isLoading && recentValues.length > 0 && setValue && getValues) {
      const currentValue = getValues(name);
      if (!currentValue) {
        setValue(name, recentValues[0], {
          shouldValidate: false,
          shouldDirty: false,
        });
      }
      hasPrefilledRef.current = true;
    }
  }, [isAuthenticated, isLoading, recentValues, name, setValue, getValues]);

  const recentOptions: RecentOption[] = useMemo(() => {
    return recentValues.map((val, index) => ({
      value: val,
      label: val,
      tag: {
        label: '✓',
        variant: 'custom',
      },
      __isRecentValue: true,
      __recentIndex: index,
    }));
  }, [recentValues]);

  const [inputText, setInputText] = useState('');
  const lastFieldValueRef = useRef<string>('');

  const showDropdown = isAuthenticated && !isLoading && recentValues.length > 0;

  if (!showDropdown) {
    return (
      <FormInput
        name={name}
        control={control}
        label={label}
        placeholder={placeholder}
        rules={rules}
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
      render={({ field, fieldState: { error } }) => {
        const currentValue = field.value as string | undefined;

        // Sync inputText when field.value changes externally (auto-fill, form reset)
        if (currentValue !== lastFieldValueRef.current) {
          lastFieldValueRef.current = currentValue || '';
          if (inputText !== (currentValue || '')) {
            setInputText(currentValue || '');
          }
        }

        // Only show a selected option when the value matches a recent option
        const selectedOption: SingleValue<EnhancedSelectOption> =
          recentOptions.find((o) => o.value === currentValue) || null;

        return (
          <EnhancedSelect
            value={selectedOption}
            inputValue={inputText}
            onBlur={() => {
              field.onBlur();
              if (inputText && inputText !== currentValue) {
                field.onChange(inputText);
                lastFieldValueRef.current = inputText;
              }
            }}
            inputId={name}
            label={label}
            required={rules?.required ? true : false}
            error={error?.message}
            enableTags={true}
            options={recentOptions}
            isLoading={isLoading}
            onChange={(
              newValue: MultiValue<EnhancedSelectOption> | SingleValue<EnhancedSelectOption>,
              _actionMeta: ActionMeta<EnhancedSelectOption>
            ) => {
              const val = Array.isArray(newValue)
                ? (newValue[0] as RecentOption | undefined)?.value || ''
                : (newValue as RecentOption | null)?.value || '';
              field.onChange(val);
              lastFieldValueRef.current = val;
              setInputText('');
            }}
            isSearchable={true}
            onInputChange={(newInput: string, actionMeta: { action: string }) => {
              if (actionMeta.action === 'input-change') {
                setInputText(newInput);
              }
            }}
            noOptionsMessage={() => null}
            placeholder={placeholder || `${label} eingeben oder aus vorherigen Werten auswählen...`}
            isDisabled={disabled}
            className={className}
            {...inputProps}
          />
        );
      }}
    />
  );
};

export default SmartInput;
