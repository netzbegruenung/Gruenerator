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

import React, { useCallback, useMemo, memo } from 'react';
import { type Control, Controller } from 'react-hook-form';

import EnhancedSelect from '../../../components/common/EnhancedSelect';
import FormInput from '../../../components/common/Form/Input/FormInput';
import FormTextarea from '../../../components/common/Form/Input/FormTextarea';
import { type GeneratorFormField } from '../types/generatorTypes';

// Static constant moved outside component
const MENU_PORTAL_TARGET = typeof document !== 'undefined' ? document.body : null;

interface DynamicFormFieldRendererProps {
  fields: GeneratorFormField[];
  control: Control<Record<string, unknown>>;
  onUrlsDetected?: (urls: string[]) => void;
  enableUrlDetection?: boolean;
}

/**
 * Renders dynamic form fields based on field configuration
 */
const DynamicFormFieldRenderer: React.FC<DynamicFormFieldRendererProps> = memo(
  ({ fields, control, onUrlsDetected, enableUrlDetection = false }) => {
    const renderField = useCallback(
      (field: GeneratorFormField) => {
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
          const selectOptions = (field.options || []).map((option) => ({
            value: option.value,
            label: option.label,
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
                  value={
                    controllerField.value
                      ? selectOptions.find((opt) => opt.value === controllerField.value)
                      : null
                  }
                  onChange={(selectedOption) => {
                    const value =
                      selectedOption && !Array.isArray(selectedOption)
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
                  menuPortalTarget={MENU_PORTAL_TARGET}
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
      },
      [control, onUrlsDetected, enableUrlDetection]
    );

    // Memoize rendered fields to prevent unnecessary re-renders
    const renderedFields = useMemo(() => fields.map(renderField), [fields, renderField]);

    return <>{renderedFields}</>;
  }
);

DynamicFormFieldRenderer.displayName = 'DynamicFormFieldRenderer';

export { DynamicFormFieldRenderer };
export default DynamicFormFieldRenderer;
