import React, { useState } from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import Select from 'react-select';
import FormFieldWrapper from './Form/Input/FormFieldWrapper';

// Social media platform icons (SVG icons as components)
const PlatformIcon = ({ platform, size = 16 }) => {
  const iconStyle = { width: size, height: size, display: 'inline-block' };
  
  switch (platform) {
    case 'instagram':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/>
        </svg>
      );
    case 'facebook':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
        </svg>
      );
    case 'twitter':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
        </svg>
      );
    case 'linkedin':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z"/>
        </svg>
      );
    case 'tiktok':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z"/>
        </svg>
      );
    case 'messenger':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 0C5.374 0 0 4.975 0 11.111c0 3.497 1.745 6.616 4.472 8.652V24l4.086-2.242c1.09.301 2.246.464 3.442.464 6.626 0 12-4.974 12-11.111C24 4.975 18.626 0 12 0zm1.193 14.963l-3.056-3.259-5.963 3.259L10.733 8l3.13 3.259L19.783 8l-6.59 6.963z"/>
        </svg>
      );
    case 'reelScript':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="m7 4 10 8-10 8V4z"/>
        </svg>
      );
    case 'actionIdeas':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
        </svg>
      );
    case 'pressemitteilung':
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M16 6v2H5.5C4.11 8 3 9.11 3 10.5v9C3 20.89 4.11 22 5.5 22h9c1.39 0 2.5-1.11 2.5-2.5V18h2c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-3zm-1 2h2v6h-2V8zM5.5 10H15v9.5c0 .28-.22.5-.5.5h-9c-.28 0-.5-.22-.5-.5v-9c0-.28.22-.5.5-.5z"/>
        </svg>
      );
    default:
      return (
        <svg style={iconStyle} viewBox="0 0 24 24" fill="currentColor">
          <path d="M17 7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h10c2.76 0 5-2.24 5-5s-2.24-5-5-5zM7 15c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3z"/>
        </svg>
      );
  }
};

/**
 * PlatformSelector - Multi-selectable platform selection component using react-select
 * Used for selecting multiple social media platforms and content formats
 */
const PlatformSelector = ({
  name = 'platforms',
  control,
  platformOptions = [],
  label = 'Plattformen wählen',
  placeholder = 'Plattformen auswählen...',
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
          <PlatformIcon platform={platform} size={16} />
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
        required: required ? 'Bitte wählen Sie mindestens eine Plattform' : false,
        validate: required ? (value) => {
          if (!value || (Array.isArray(value) && value.length === 0)) {
            return 'Bitte wählen Sie mindestens eine Plattform';
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