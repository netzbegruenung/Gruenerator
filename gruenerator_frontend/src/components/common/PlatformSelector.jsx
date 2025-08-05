import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import Select from 'react-select';
import FormFieldWrapper from './Form/Input/FormFieldWrapper';
import Icon from './Icon';

/**
 * PlatformSelector - Multi-selectable platform selection component using react-select
 * Used for selecting multiple social media platforms and content formats
 */
const PlatformSelector = ({
  name = 'platforms',
  control,
  platformOptions = [],
  label = 'Formate wählen',
  placeholder = 'Formate auswählen...',
  required = true,
  disabled = false,
  helpText,
  className = '',
  rules = {},
  tabIndex,
  ...rest
}) => {
  if (!control) {
    console.error('PlatformSelector requires a control prop from react-hook-form');
    return null;
  }

  // Transform platform options to react-select format with icons
  const selectOptions = platformOptions.map(option => ({
    value: option.id,
    label: option.label,
    platform: option.id
  }));

  // State to track if menu is open (for preventing Enter key form submission)
  const [menuIsOpen, setMenuIsOpen] = useState(false);

  // Custom option component to display icons (only in dropdown, not in selected values)
  const formatOptionLabel = ({ platform, label }, { context }) => {
    // Show icons only in the dropdown menu, not in selected values to save space
    if (context === 'menu') {
      return (
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Icon category="platforms" name={platform} size={16} />
          <span>{label}</span>
        </div>
      );
    }
    // For selected values, show only text
    return <span>{label}</span>;
  };

  // Handle Enter key - prevent form submission when menu is open but no options available
  const handleKeyDown = (event) => {
    if (event.key === 'Enter') {
      if (menuIsOpen) {
        // Menu is open - let react-select handle option selection
        // Don't prevent default - react-select needs this to select options
        return;
      } else {
        // Menu is closed - this would submit the form, so prevent it
        event.preventDefault();
      }
    }
    // Allow natural Tab navigation - don't interfere
  };


  return (
    <Controller
      name={name}
      control={control}
      rules={{
        required: required ? 'Bitte wählen Sie mindestens ein Format' : false,
        validate: required ? (value) => {
          if (!value || (Array.isArray(value) && value.length === 0)) {
            return 'Bitte wählen Sie mindestens ein Format';
          }
          return true;
        } : undefined,
        ...rules
      }}
      defaultValue={[]}
      render={({ field, fieldState: { error } }) => (
        <FormFieldWrapper
          label={label}
          required={required}
          error={error?.message}
          helpText={helpText}
          htmlFor={`${name}-select`}
        >
          <div className={`platform-selector ${className}`.trim()}>
            <Select
              {...field}
              inputId={`${name}-select`}
              className={`react-select ${error ? 'error' : ''}`.trim()}
              classNamePrefix="react-select"
              isMulti
              options={selectOptions}
              placeholder={placeholder}
              isDisabled={disabled}
              formatOptionLabel={formatOptionLabel}
              value={field.value ? field.value.map(val => 
                selectOptions.find(option => option.value === val)
              ).filter(Boolean) : []}
              onChange={(selectedOptions) => {
                const values = selectedOptions ? selectedOptions.map(option => option.value) : [];
                field.onChange(values);
              }}
              onBlur={field.onBlur}
              onMenuOpen={() => setMenuIsOpen(true)}
              onMenuClose={() => setMenuIsOpen(false)}
              onKeyDown={handleKeyDown}
              closeMenuOnSelect={false}
              hideSelectedOptions={false}
              isClearable={false}
              isSearchable={true}
              openMenuOnFocus={false}
              blurInputOnSelect={true}
              autoFocus={false}
              tabSelectsValue={true}
              backspaceRemovesValue={true}
              captureMenuScroll={false}
              menuShouldBlockScroll={false}
              menuShouldScrollIntoView={false}
              tabIndex={tabIndex}
              noOptionsMessage={() => 'Keine Optionen verfügbar'}
              menuPortalTarget={document.body}
              menuPosition="fixed"
              {...rest}
            />
          </div>
        </FormFieldWrapper>
      )}
    />
  );
};

PlatformSelector.propTypes = {
  name: PropTypes.string,
  control: PropTypes.object.isRequired,
  platformOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ).isRequired,
  label: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  rules: PropTypes.object,
  tabIndex: PropTypes.number
};

export default PlatformSelector;