import React from 'react';
import FormFieldWrapper from '../../../components/common/Form/Input/FormFieldWrapper';
import TextAreaInput from '../../../components/common/Form/Input/TextAreaInput';

import './ConfigDrivenFields.css';

/**
 * ConfigDrivenFields - Renders form fields based on configuration
 * Eliminates hardcoded type checks by using field config from TEMPLATE_FIELD_CONFIG
 */
const ConfigDrivenFields = ({
  fields,
  values,
  onChange,
  errors = {},
  disabled = false,
  className = '',
  hideLabels = false
}) => {
  if (!fields || fields.length === 0) return null;

  const handleFieldChange = (e) => {
    const { name, value } = e.target;
    if (onChange) {
      onChange({ target: { name, value } });
    }
  };

  return (
    <div className={`config-driven-fields ${className}`}>
      {fields.map(field => {
        const value = values?.[field.name] || '';
        const error = errors?.[field.name];
        const hasError = !!error;

        return (
          <FormFieldWrapper
            key={field.name}
            label={hideLabels ? null : field.label}
            htmlFor={field.name}
            error={error}
          >
            {field.type === 'textarea' ? (
              <TextAreaInput
                id={field.name}
                name={field.name}
                value={value}
                onChange={handleFieldChange}
                placeholder={field.placeholder}
                rows={field.rows || 2}
                maxLength={field.maxLength}
                disabled={disabled}
                className={hasError ? 'error-input' : ''}
              />
            ) : (
              <input
                type={field.type || 'text'}
                id={field.name}
                name={field.name}
                value={value}
                onChange={handleFieldChange}
                placeholder={field.placeholder}
                required={field.required}
                disabled={disabled}
                className={`form-input ${hasError ? 'error-input' : ''}`}
              />
            )}
          </FormFieldWrapper>
        );
      })}
    </div>
  );
};

export default ConfigDrivenFields;
