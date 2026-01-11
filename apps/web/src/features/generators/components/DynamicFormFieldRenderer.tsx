/**
 * Dynamic Form Field Renderer Component
 *
 * Unified component for rendering form fields based on GeneratorFormField configuration.
 * Consolidates duplicate rendering logic from:
 * - CustomGeneratorPage.tsx (renderFormInputs function, lines 276-354)
 * - Similar logic in FieldEditorAssistant.tsx
 *
 * This component eliminates ~90 lines of duplicated field rendering code.
 */

import React, { useCallback } from 'react';
import { Control, Controller } from 'react-hook-form';
import FormInput from '../../../components/common/Form/Input/FormInput';
import FormTextarea from '../../../components/common/Form/Input/FormTextarea';
import EnhancedSelect from '../../../components/common/EnhancedSelect';
import { GeneratorFormField } from '../types/generatorTypes';

interface DynamicFormFieldRendererProps {
  fields: GeneratorFormField[];
  control: Control<any>;
  onUrlsDetected?: (urls: string[]) => void;
  enableUrlDetection?: boolean;
}

/**
 * Renders dynamic form fields based on field configuration
 */
export const DynamicFormFieldRenderer: React.FC<DynamicFormFieldRendererProps> = ({
  fields,
  control,
  onUrlsDetected,
  enableUrlDetection = false
}) => {
  const renderField = useCallback((field: GeneratorFormField) => {
    const requiredRule = field.required
      ? { required: `${field.label} ist ein Pflichtfeld` }
      : {};

    if (field.type === 'textarea') {
      return (
        <FormTextarea
          key={field.name}
          name={field.name}
          label={field.label}
          placeholder={field.placeholder}
          required={field.required}
          control={control}
          defaultValue={field.defaultValue || ''}
          rows={4}
          rules={requiredRule}
          enableUrlDetection={enableUrlDetection}
          onUrlsDetected={onUrlsDetected}
        />
      );
    }

    if (field.type === 'select') {
      const selectOptions = (field.options || []).map(option => ({
        value: option.value,
        label: option.label
      }));

      return (
        <Controller
          key={field.name}
          name={field.name as never}
          control={control}
          defaultValue={(field.defaultValue || '') as never}
          rules={requiredRule}
          render={({ field: controllerField, fieldState }) => (
            <EnhancedSelect
              inputId={`${field.name}-select`}
              label={field.label}
              options={selectOptions}
              placeholder={field.placeholder || 'Bitte wählen...'}
              value={controllerField.value
                ? selectOptions.find(opt => opt.value === controllerField.value)
                : null}
              onChange={(selectedOption) => {
                const value = selectedOption && !Array.isArray(selectedOption)
                  ? (selectedOption as { value: string | number }).value
                  : null;
                controllerField.onChange(value);
              }}
              onBlur={controllerField.onBlur}
              isClearable={!field.required}
              isSearchable={false}
              className="react-select"
              classNamePrefix="react-select"
              error={fieldState.error?.message}
              required={field.required}
              menuPortalTarget={document.body}
              menuPosition="fixed"
            />
          )}
        />
      );
    }

    return (
      <FormInput
        key={field.name}
        name={field.name}
        label={field.label}
        placeholder={field.placeholder}
        type={field.type}
        required={field.required}
        control={control}
        defaultValue={field.defaultValue || ''}
        rules={requiredRule}
      />
    );
  }, [control, onUrlsDetected, enableUrlDetection]);

  return (
    <>
      {fields.map(renderField)}
    </>
  );
};

export default DynamicFormFieldRenderer;
