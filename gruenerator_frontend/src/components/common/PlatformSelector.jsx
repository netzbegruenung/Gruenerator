import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import PropTypes from 'prop-types';
import { Controller } from 'react-hook-form';
import EnhancedSelect from './EnhancedSelect/EnhancedSelect';
import Icon from './Icon';
import { createFilterOption, findMatches, PLATFORM_ALIASES } from '../../utils/autocompleteUtils';

/**
 * PlatformSelector - Flexible selection component using react-select
 * Supports both single and multi-select modes
 * Can be used for platforms, types, or any other selection needs
 * Supports both controlled (react-hook-form) and uncontrolled modes
 */
const PlatformSelector = ({
  name = 'platforms',
  control,
  platformOptions = [], // Legacy prop for backward compatibility
  options = [], // New generic options prop
  label = 'Auswählen',
  placeholder = 'Option auswählen...',
  required = true,
  disabled = false,
  helpText,
  className = '',
  rules = {},
  tabIndex,
  // New props for enhanced functionality
  isMulti = true,
  value,
  defaultValue,
  onChange,
  enableIcons = true,
  enableSubtitles = false,
  iconType = 'component', // 'component' | 'react-icon' | 'function'
  isSearchable = true,
  // Auto-select props
  enableAutoSelect = false,
  aliasMap = PLATFORM_ALIASES,
  autoSelectDelay = 500,
  onAutoSelect,
  ...rest
}) => {
  // Determine options source (backward compatibility)
  const selectOptionsSource = options.length > 0 ? options : platformOptions;

  // Control is now optional - support both controlled and uncontrolled modes
  const isControlled = !!control;
  const isUncontrolled = !isControlled;

  if (isUncontrolled && !onChange) {
    console.warn('PlatformSelector in uncontrolled mode should have an onChange handler');
  }

  // Transform options to EnhancedSelect format with flexible icon support
  const selectOptions = selectOptionsSource.map(option => {
    const transformedOption = {
      value: option.id || option.value,
      label: option.label,
      subtitle: option.subtitle || option.description
    };

    // Handle different icon types
    if (enableIcons && option.icon) {
      if (iconType === 'component') {
        // Legacy platform icons using Icon component
        transformedOption.icon = () => <Icon category="platforms" name={option.id || option.value} size={16} />;
      } else if (iconType === 'react-icon') {
        // Direct React Icon component
        transformedOption.icon = option.icon;
      } else if (iconType === 'function') {
        // Custom icon function
        transformedOption.icon = option.icon;
      }
    }

    return transformedOption;
  });

  // State to track if menu is open (for preventing Enter key form submission)
  const [menuIsOpen, setMenuIsOpen] = useState(false);

  // Auto-select state
  const [pendingAutoSelect, setPendingAutoSelect] = useState(null);
  const autoSelectTimeoutRef = useRef(null);
  const selectRefInternal = useRef(null);

  // Custom filter option with alias support
  const filterOption = useMemo(() =>
    enableAutoSelect ? createFilterOption(aliasMap) : undefined,
    [enableAutoSelect, aliasMap]
  );

  // Cleanup auto-select timeout on unmount
  useEffect(() => {
    return () => {
      if (autoSelectTimeoutRef.current) {
        clearTimeout(autoSelectTimeoutRef.current);
      }
    };
  }, []);

  // Handle input change for auto-select
  const handleAutoSelectInputChange = useCallback((newValue, actionMeta, currentValues, onChangeCallback) => {
    if (!enableAutoSelect || actionMeta.action !== 'input-change') return;

    if (autoSelectTimeoutRef.current) {
      clearTimeout(autoSelectTimeoutRef.current);
    }

    if (!newValue || newValue.length < 2) {
      setPendingAutoSelect(null);
      return;
    }

    const optionsForMatching = selectOptions.map(opt => ({ value: opt.value, label: opt.label }));
    const { bestMatch, isUniqueMatch } = findMatches(newValue, optionsForMatching, { aliases: aliasMap });

    if (isUniqueMatch && bestMatch) {
      const alreadySelected = isMulti
        ? (currentValues || []).includes(bestMatch.value)
        : currentValues === bestMatch.value;

      if (!alreadySelected) {
        setPendingAutoSelect(bestMatch.value);

        autoSelectTimeoutRef.current = setTimeout(() => {
          if (isMulti) {
            const newValues = [...(currentValues || []), bestMatch.value];
            onChangeCallback(newValues);
          } else {
            onChangeCallback(bestMatch.value);
          }

          onAutoSelect?.(bestMatch);
          setPendingAutoSelect(null);

          if (selectRefInternal.current?.clearValue) {
            selectRefInternal.current.inputRef?.blur();
          }
        }, autoSelectDelay);
      } else {
        setPendingAutoSelect(null);
      }
    } else {
      setPendingAutoSelect(null);
    }
  }, [enableAutoSelect, selectOptions, aliasMap, autoSelectDelay, isMulti, onAutoSelect]);

  // Custom styles to highlight pending auto-select option
  const autoSelectStyles = useMemo(() => {
    if (!enableAutoSelect || !pendingAutoSelect) return {};

    return {
      option: (provided, state) => ({
        ...provided,
        ...(state.data.value === pendingAutoSelect ? {
          backgroundColor: 'var(--klee-light, rgba(0, 128, 0, 0.15))',
          borderLeft: '3px solid var(--klee, #46962b)',
          transition: 'background-color 0.2s ease, border-left 0.2s ease'
        } : {})
      })
    };
  }, [enableAutoSelect, pendingAutoSelect]);

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

  // Uncontrolled mode (no react-hook-form)
  if (isUncontrolled) {
    const selectRef = useRef(null);
    const selectedValue = isMulti
      ? (value ? value.map(val =>
          selectOptions.find(option => option.value === val)
        ).filter(Boolean) : [])
      : (value ? selectOptions.find(option => option.value === value) : null);

    return (
      <div className={`platform-selector ${className}`.trim()}>
        <EnhancedSelect
          ref={(ref) => {
            selectRef.current = ref;
            selectRefInternal.current = ref;
          }}
          inputId={`${name}-select`}
          label={label}
          required={required}
          helpText={helpText}
          enableIcons={enableIcons}
          enableSubtitles={enableSubtitles}
          className="react-select"
          classNamePrefix="react-select"
          isMulti={isMulti}
          options={selectOptions}
          placeholder={placeholder}
          isDisabled={disabled}
          value={selectedValue}
          defaultValue={defaultValue}
          onChange={(selectedOptions) => {
            if (onChange) {
              if (isMulti) {
                const values = selectedOptions ? selectedOptions.map(option => option.value) : [];
                onChange(values);
              } else {
                const changedValue = selectedOptions ? selectedOptions.value : null;
                onChange(changedValue);
              }
            }
          }}
          onInputChange={(newValue, actionMeta) => {
            handleAutoSelectInputChange(newValue, actionMeta, value, onChange);
          }}
          onMenuOpen={() => setMenuIsOpen(true)}
          onMenuClose={() => setMenuIsOpen(false)}
          onKeyDown={handleKeyDown}
          closeMenuOnSelect={!isMulti}
          hideSelectedOptions={false}
          isClearable={false}
          isSearchable={isSearchable}
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
          menuPlacement="auto"
          filterOption={filterOption}
          styles={autoSelectStyles}
          {...rest}
        />
      </div>
    );
  }

  // Controlled mode (with react-hook-form)
  return (
    <Controller
      name={name}
      control={control}
      rules={{
        required: required ? (isMulti ? 'Format wählen' : 'Bitte wählen') : false,
        validate: required ? (value) => {
          if (isMulti) {
            if (!value || (Array.isArray(value) && value.length === 0)) {
              return 'Format wählen';
            }
          } else {
            if (!value) {
              return 'Bitte wählen';
            }
          }
          return true;
        } : undefined,
        ...rules
      }}
      defaultValue={isMulti ? [] : null}
      render={({ field, fieldState: { error } }) => (
        <div className={`platform-selector ${className}`.trim()}>
          <EnhancedSelect
            {...field}
            ref={(ref) => {
              selectRefInternal.current = ref;
            }}
            inputId={`${name}-select`}
            label={label}
            required={required}
            error={error?.message}
            helpText={helpText}
            enableIcons={enableIcons}
            enableSubtitles={enableSubtitles}
            className={`react-select ${error ? 'error' : ''}`.trim()}
            classNamePrefix="react-select"
            isMulti={isMulti}
            options={selectOptions}
            placeholder={placeholder}
            isDisabled={disabled}
            value={isMulti
              ? (field.value ? field.value.map(val =>
                  selectOptions.find(option => option.value === val)
                ).filter(Boolean) : [])
              : (field.value ? selectOptions.find(option => option.value === field.value) : null)
            }
            onChange={(selectedOptions) => {
              if (isMulti) {
                const values = selectedOptions ? selectedOptions.map(option => option.value) : [];
                field.onChange(values);
              } else {
                const changedValue = selectedOptions ? selectedOptions.value : null;
                field.onChange(changedValue);
              }
            }}
            onInputChange={(newValue, actionMeta) => {
              handleAutoSelectInputChange(newValue, actionMeta, field.value, field.onChange);
            }}
            onBlur={field.onBlur}
            onMenuOpen={() => setMenuIsOpen(true)}
            onMenuClose={() => setMenuIsOpen(false)}
            onKeyDown={handleKeyDown}
            closeMenuOnSelect={!isMulti}
            hideSelectedOptions={false}
            isClearable={false}
            isSearchable={isSearchable}
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
            menuPlacement="auto"
            filterOption={filterOption}
            styles={autoSelectStyles}
            {...rest}
          />
        </div>
      )}
    />
  );
};

PlatformSelector.propTypes = {
  name: PropTypes.string,
  control: PropTypes.object,
  platformOptions: PropTypes.arrayOf(
    PropTypes.shape({
      id: PropTypes.string.isRequired,
      label: PropTypes.string.isRequired
    })
  ),
  options: PropTypes.arrayOf(
    PropTypes.shape({
      value: PropTypes.oneOfType([PropTypes.string, PropTypes.number]).isRequired,
      label: PropTypes.string.isRequired,
      icon: PropTypes.oneOfType([PropTypes.func, PropTypes.elementType]),
      subtitle: PropTypes.string,
      description: PropTypes.string
    })
  ),
  label: PropTypes.string,
  placeholder: PropTypes.string,
  required: PropTypes.bool,
  disabled: PropTypes.bool,
  helpText: PropTypes.string,
  className: PropTypes.string,
  rules: PropTypes.object,
  tabIndex: PropTypes.number,
  isMulti: PropTypes.bool,
  value: PropTypes.any,
  defaultValue: PropTypes.any,
  onChange: PropTypes.func,
  enableIcons: PropTypes.bool,
  enableSubtitles: PropTypes.bool,
  iconType: PropTypes.oneOf(['component', 'react-icon', 'function']),
  isSearchable: PropTypes.bool,
  enableAutoSelect: PropTypes.bool,
  aliasMap: PropTypes.object,
  autoSelectDelay: PropTypes.number,
  onAutoSelect: PropTypes.func
};

export default PlatformSelector;