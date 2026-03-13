import React, { useState, useEffect, useCallback, useMemo, memo } from 'react';
import { useForm, Controller, type FieldValues, type Control } from 'react-hook-form';

import FormInput from '../../../components/common/Form/Input/FormInput';
import { useFieldAutoSuggest } from '../hooks/useFieldAutoSuggest';
import { type GeneratorFormField } from '../types/generatorTypes';
import { sanitizeFieldName, sanitizeOptionValue } from '../utils/sanitization';
import { GENERATOR_VALIDATION_RULES, validateFieldNameUniqueness } from '../utils/validation';

import { cn } from '@/utils/cn';

const alertClasses =
  'bg-amber-100/80 dark:bg-amber-900/20 border border-amber-400 dark:border-amber-600 text-amber-700 dark:text-amber-400 rounded p-sm mb-md text-sm';
const typeSelectorBaseClasses =
  'flex-1 py-sm px-md border-none bg-transparent text-foreground cursor-pointer transition-all duration-200 text-center font-medium hover:bg-grey-100 dark:hover:bg-grey-800';
const typeSelectorActiveClasses = '!bg-primary-500 !text-white font-semibold';
const optionInputClasses =
  'w-full min-w-0 p-xs border border-grey-200 dark:border-grey-700 rounded bg-background text-foreground text-sm';

// Static default values moved outside component
const DEFAULT_FIELD_VALUES: GeneratorFormField = {
  label: '',
  name: '',
  type: 'text',
  placeholder: '',
  required: false,
  options: [],
};

interface FieldEditorAssistantProps {
  initialFieldData?: GeneratorFormField | null;
  onSave: (fieldData: GeneratorFormField) => void;
  onCancel: () => void;
  existingFieldNames?: string[];
}

const FieldEditorAssistant: React.FC<FieldEditorAssistantProps> = memo(
  ({ initialFieldData, onSave, onCancel, existingFieldNames = [] }) => {
    // Initialize React Hook Form
    const {
      control,
      handleSubmit,
      watch,
      setValue,
      formState: { errors },
      reset,
    } = useForm<GeneratorFormField>({
      defaultValues: DEFAULT_FIELD_VALUES,
      mode: 'onChange',
    });

    const [error, setError] = useState<string | null>(null);

    // Watch label for auto-generation
    const watchedLabel = watch('label');
    const watchedType = watch('type');
    const watchedOptions = watch('options');

    // Memoized helper functions for managing select options
    const addOption = useCallback(() => {
      const currentOptions = watchedOptions || [];
      setValue('options', [...currentOptions, { label: '', value: '' }], { shouldValidate: false });
    }, [watchedOptions, setValue]);

    const updateOption = useCallback(
      (index: number, field: 'label' | 'value', value: string): void => {
        const currentOptions = watchedOptions || [];
        const newOptions = [...currentOptions];
        newOptions[index] = { ...newOptions[index], [field]: value };
        setValue('options', newOptions, { shouldValidate: false });
      },
      [watchedOptions, setValue]
    );

    const removeOption = useCallback(
      (index: number): void => {
        const currentOptions = watchedOptions || [];
        setValue(
          'options',
          currentOptions.filter((_, i) => i !== index),
          { shouldValidate: false }
        );
      },
      [watchedOptions, setValue]
    );

    useEffect(() => {
      // Initialize with existing data if provided (for editing)
      if (initialFieldData) {
        reset({
          ...initialFieldData,
          name: initialFieldData.name || sanitizeFieldName(initialFieldData.label || ''),
        });
      } else {
        reset(DEFAULT_FIELD_VALUES);
      }
      setError(null);
    }, [initialFieldData, reset]);

    // Use custom hook for field auto-suggestions
    useFieldAutoSuggest({ label: watchedLabel, setValue, currentType: watchedType });

    // Effect to handle type changes and options initialization
    useEffect(() => {
      const currentOptions = watchedOptions || [];

      if (watchedType === 'select' && currentOptions.length === 0) {
        // When switching to select type, ensure at least one option exists
        setValue('options', [{ label: '', value: '' }], { shouldValidate: false });
      } else if (watchedType !== 'select' && currentOptions.length > 0) {
        // When switching away from select type, clear options
        setValue('options', [], { shouldValidate: false });
      }
    }, [watchedType, watchedOptions, setValue]);

    // Memoize validation rules
    const validationRules = useMemo(
      () => ({
        label: GENERATOR_VALIDATION_RULES.fieldLabel,
        name: {
          ...GENERATOR_VALIDATION_RULES.fieldName,
          validate: (value: string): string | boolean =>
            validateFieldNameUniqueness(value, existingFieldNames, initialFieldData?.name),
        },
      }),
      [existingFieldNames, initialFieldData?.name]
    );

    // Memoized form submission handler
    const onSubmit = useCallback(
      (data: GeneratorFormField): void => {
        setError(null);
        onSave(data);
      },
      [onSave]
    );

    const handleSaveClick = useMemo(() => handleSubmit(onSubmit), [handleSubmit, onSubmit]);

    return (
      <div className="border-none p-md mb-md rounded-lg">
        <h5 className="text-foreground-heading mt-5 mb-md font-semibold">
          Feld bearbeiten/hinzufügen
        </h5>
        {error && <div className={alertClasses}>{error}</div>}
        {(errors.label || errors.name) && (
          <div className={alertClasses}>{errors.label?.message || errors.name?.message}</div>
        )}

        {/* Label Input */}
        <FormInput
          name="label"
          label="Was soll im Formular stehen?"
          placeholder="z.B. Thema des Artikels"
          required={true}
          control={control as unknown as Control<FieldValues>}
          rules={validationRules.label}
        />

        {/* Type Selection - Custom Controller for Toggle Buttons */}
        <div className="mb-md">
          <label className="block mb-sm font-semibold text-foreground text-sm">Feld-Typ</label>
          <Controller
            name="type"
            control={control}
            render={({ field }) => (
              <div
                className="flex rounded-md overflow-hidden border border-grey-200 dark:border-grey-700 w-fit pt-sm gap-sm"
                role="radiogroup"
                aria-labelledby="type-label"
              >
                <button
                  type="button"
                  className={cn(
                    typeSelectorBaseClasses,
                    field.value === 'text' && typeSelectorActiveClasses
                  )}
                  onClick={() => {
                    field.onChange('text');
                    setError(null);
                  }}
                  aria-pressed={field.value === 'text'}
                >
                  Kurzer Text
                </button>
                <button
                  type="button"
                  className={cn(
                    typeSelectorBaseClasses,
                    field.value === 'textarea' && typeSelectorActiveClasses
                  )}
                  onClick={() => {
                    field.onChange('textarea');
                    setError(null);
                  }}
                  aria-pressed={field.value === 'textarea'}
                >
                  Langer Text
                </button>
                <button
                  type="button"
                  className={cn(
                    typeSelectorBaseClasses,
                    field.value === 'select' && typeSelectorActiveClasses
                  )}
                  onClick={() => {
                    field.onChange('select');
                    setError(null);
                  }}
                  aria-pressed={field.value === 'select'}
                >
                  Auswahlfeld
                </button>
              </div>
            )}
          />
        </div>

        {/* Placeholder Input */}
        <FormInput
          name="placeholder"
          label={
            watchedType === 'select' ? 'Standardtext (optional)' : 'Hilfetext im Feld (optional)'
          }
          placeholder={
            watchedType === 'select' ? 'z.B. Bitte wählen...' : 'z.B. Gib hier das Hauptthema an'
          }
          required={false}
          control={control as unknown as Control<FieldValues>}
        />

        {/* Options Management - Only shown for select type */}
        {watchedType === 'select' && (
          <div className="mb-md">
            <label className="block mb-sm font-semibold text-foreground text-sm">
              Auswahlmöglichkeiten
            </label>
            <div className="mt-sm p-md bg-background-alt rounded-sm border border-grey-200 dark:border-grey-700">
              {(watchedOptions || []).map((option, index) => (
                <div
                  key={index}
                  className="grid grid-cols-[1.5fr_1fr_auto] gap-sm items-center mb-sm max-md:grid-cols-1 max-md:gap-xs"
                >
                  <input
                    type="text"
                    placeholder="Anzeigetext"
                    value={option.label || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                      const newLabel = e.target.value;
                      const newValue = sanitizeOptionValue(newLabel);
                      updateOption(index, 'label', newLabel);
                      updateOption(index, 'value', newValue);
                    }}
                    className={optionInputClasses}
                  />
                  <input
                    type="text"
                    placeholder="Technischer Wert"
                    value={option.value || ''}
                    onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                      updateOption(index, 'value', e.target.value)
                    }
                    className={optionInputClasses}
                  />
                  <button
                    type="button"
                    onClick={() => removeOption(index)}
                    className="px-2 py-1 text-sm bg-transparent border border-red-400 text-red-500 rounded cursor-pointer hover:bg-red-500 hover:text-white transition-colors duration-200"
                    aria-label="Option entfernen"
                  >
                    ×
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={addOption}
                className="px-3 py-1.5 text-sm bg-transparent border border-grey-200 dark:border-grey-700 text-foreground rounded cursor-pointer hover:bg-background-alt transition-colors duration-200"
              >
                + Option hinzufügen
              </button>
            </div>
          </div>
        )}

        {/* Required Toggle Switch - Custom Controller */}
        <div className="flex items-center justify-between mb-lg">
          <label
            className="mb-0 mr-md inline text-foreground text-sm"
            htmlFor="assistant-required-toggle"
          >
            Muss dieses Feld ausgefüllt werden? (Pflichtfeld)
          </label>
          <Controller
            name="required"
            control={control}
            render={({ field }) => (
              <button
                type="button"
                role="switch"
                aria-checked={field.value}
                id="assistant-required-toggle"
                className={cn(
                  'relative inline-block w-[50px] h-7 bg-grey-200 dark:bg-grey-700 rounded-[14px] cursor-pointer border-2 border-grey-300 dark:border-grey-600 p-0 transition-all duration-300',
                  field.value && '!bg-primary-500 !border-primary-500'
                )}
                onClick={() => {
                  field.onChange(!field.value);
                  setError(null);
                }}
              >
                <span
                  className={cn(
                    'absolute top-px left-px w-[22px] h-[22px] bg-white rounded-full transition-transform duration-300',
                    field.value && 'translate-x-[22px]'
                  )}
                />
              </button>
            )}
          />
        </div>

        {/* Action Buttons */}
        <div className="flex justify-center gap-md mt-lg">
          <button
            type="button"
            onClick={onCancel}
            className="px-5 py-2.5 bg-transparent border-2 border-grey-200 dark:border-grey-700 text-foreground rounded-[10px] font-semibold cursor-pointer transition-all duration-200 hover:bg-grey-100 dark:hover:bg-grey-800"
          >
            Abbrechen
          </button>
          <button
            type="button"
            onClick={handleSaveClick}
            className="px-5 py-2.5 bg-primary-600 border-2 border-primary-600 text-white rounded-[10px] font-semibold cursor-pointer transition-all duration-200 hover:bg-primary-700 hover:border-primary-700 active:translate-y-px"
          >
            Feld speichern
          </button>
        </div>
      </div>
    );
  }
);

FieldEditorAssistant.displayName = 'FieldEditorAssistant';

export default FieldEditorAssistant;
