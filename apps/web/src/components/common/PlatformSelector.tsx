import React, { useState, useRef, useCallback, useMemo, useEffect, ComponentType } from 'react';
import { Controller, Control } from 'react-hook-form';
import EnhancedSelect from './EnhancedSelect/EnhancedSelect';
import Icon from './Icon';
import { createFilterOption, findMatches, PLATFORM_ALIASES } from '../../utils/autocompleteUtils';

interface PlatformOption {
  id?: string;
  value?: string | number;
  label: string;
  icon?: React.ReactNode | React.ComponentType | (() => React.ReactNode);
  subtitle?: string;
  description?: string;
}

interface MatchResult {
  value: string;
  label: string;
}

// Compatible with EnhancedSelectOption from EnhancedSelect
interface TransformedOption {
  value: string | number;
  label: string;
  subtitle?: string;
  icon?: ComponentType<{ className?: string; size?: number }> | string;
  [key: string]: unknown;
}

type PlatformAliasMap = typeof PLATFORM_ALIASES;

interface PlatformSelectorProps {
  name?: string;
  control?: Control<any>;
  platformOptions?: PlatformOption[];
  options?: PlatformOption[];
  label?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  helpText?: string;
  className?: string;
  rules?: Record<string, any>;
  tabIndex?: number;
  isMulti?: boolean;
  value?: any;
  defaultValue?: any;
  onChange?: (value: any) => void;
  enableIcons?: boolean;
  enableSubtitles?: boolean;
  iconType?: 'component' | 'react-icon' | 'function';
  isSearchable?: boolean;
  enableAutoSelect?: boolean;
  aliasMap?: PlatformAliasMap | Record<string, string[]>;
  autoSelectDelay?: number;
  onAutoSelect?: (match: MatchResult) => void;
  [key: string]: any;
}

/**
 * PlatformSelector - Flexible selection component using react-select
 * Supports both single and multi-select modes
 * Can be used for platforms, types, or any other selection needs
 * Supports both controlled (react-hook-form) and uncontrolled modes
 */
const PlatformSelector: React.FC<PlatformSelectorProps> = ({
  name = 'platforms',
  control,
  platformOptions = [],
  options = [],
  label = 'Auswählen',
  placeholder = 'Option auswählen...',
  required = true,
  disabled = false,
  helpText,
  className = '',
  rules = {},
  tabIndex,
  isMulti = true,
  value,
  defaultValue,
  onChange,
  enableIcons = true,
  enableSubtitles = false,
  iconType = 'component',
  isSearchable = true,
  enableAutoSelect = false,
  aliasMap = PLATFORM_ALIASES,
  autoSelectDelay = 500,
  onAutoSelect,
  ...rest
}) => {
  const selectOptionsSource = options.length > 0 ? options : platformOptions;
  const isControlled = !!control;
  const isUncontrolled = !isControlled;

  if (isUncontrolled && !onChange) {
    console.warn('PlatformSelector in uncontrolled mode should have an onChange handler');
  }

  const selectOptions: TransformedOption[] = selectOptionsSource
    .filter(option => option.id !== undefined || option.value !== undefined)
    .map(option => {
      const optionValue = option.id ?? option.value ?? '';
      const transformedOption: TransformedOption = {
        value: optionValue,
        label: option.label,
        subtitle: option.subtitle || option.description
      };

      if (enableIcons && option.icon) {
        if (iconType === 'component') {
          // Create a component that renders the Icon
          const IconComponent: ComponentType<{ className?: string; size?: number }> = (props) => (
            <Icon category="platforms" name={String(optionValue)} size={props.size ?? 16} />
          );
          transformedOption.icon = IconComponent;
        } else if (iconType === 'react-icon' || iconType === 'function') {
          // Cast the icon to the expected type - react-icons and function icons should be compatible
          transformedOption.icon = option.icon as ComponentType<{ className?: string; size?: number }>;
        }
      }

      return transformedOption;
    });

  const [menuIsOpen, setMenuIsOpen] = useState(false);
  const [pendingAutoSelect, setPendingAutoSelect] = useState<string | null>(null);
  const autoSelectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const selectRefInternal = useRef<any>(null);

  const filterOption = useMemo(() =>
    enableAutoSelect ? createFilterOption(aliasMap as typeof PLATFORM_ALIASES) : undefined,
    [enableAutoSelect, aliasMap]
  );

  useEffect(() => {
    return () => {
      if (autoSelectTimeoutRef.current) {
        clearTimeout(autoSelectTimeoutRef.current);
      }
    };
  }, []);

  const handleAutoSelectInputChange = useCallback((newValue: string, actionMeta: any, currentValues: any, onChangeCallback: any) => {
    if (!enableAutoSelect || actionMeta.action !== 'input-change') return;

    if (autoSelectTimeoutRef.current) {
      clearTimeout(autoSelectTimeoutRef.current);
    }

    if (!newValue || newValue.length < 2) {
      setPendingAutoSelect(null);
      return;
    }

    const optionsForMatching = selectOptions.map(opt => ({ value: String(opt.value), label: opt.label }));
    const { bestMatch, isUniqueMatch } = findMatches(newValue, optionsForMatching, { aliases: aliasMap as Record<string, string[]> });

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

          onAutoSelect?.({ value: bestMatch.value ?? '', label: bestMatch.label ?? '' });
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

  const autoSelectStyles = useMemo(() => {
    if (!enableAutoSelect || !pendingAutoSelect) return {};

    return {
      option: (provided: any, state: any) => ({
        ...provided,
        ...(state.data.value === pendingAutoSelect ? {
          backgroundColor: 'var(--klee-light, rgba(0, 128, 0, 0.15))',
          borderLeft: '3px solid var(--klee, #46962b)',
          transition: 'background-color 0.2s ease, border-left 0.2s ease'
        } : {})
      })
    };
  }, [enableAutoSelect, pendingAutoSelect]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter') {
      if (menuIsOpen) {
        return;
      } else {
        event.preventDefault();
      }
    }
  };

  if (isUncontrolled) {
    const selectRef = useRef<any>(null);
    const selectedValue = isMulti
      ? (value ? value.map((val: any) =>
          selectOptions.find(option => option.value === val)
        ).filter(Boolean) : [])
      : (value ? selectOptions.find(option => option.value === value) : null);

    return (
      <div className={`platform-selector ${className}`.trim()}>
        <EnhancedSelect
          ref={(ref: any) => {
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
          onChange={(selectedOptions: any) => {
            if (onChange) {
              if (isMulti) {
                const values = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
                onChange(values);
              } else {
                const changedValue = selectedOptions ? selectedOptions.value : null;
                onChange(changedValue);
              }
            }
          }}
          onInputChange={(newValue: string, actionMeta: any) => {
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

  return (
    <Controller
      name={name}
      control={control}
      rules={{
        required: required ? (isMulti ? 'Format wählen' : 'Bitte wählen') : false,
        validate: required ? (value: any) => {
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
            ref={(ref: any) => {
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
              ? (field.value ? field.value.map((val: any) =>
                  selectOptions.find(option => option.value === val)
                ).filter(Boolean) : [])
              : (field.value ? selectOptions.find(option => option.value === field.value) : null)
            }
            onChange={(selectedOptions: any) => {
              if (isMulti) {
                const values = selectedOptions ? selectedOptions.map((option: any) => option.value) : [];
                field.onChange(values);
              } else {
                const changedValue = selectedOptions ? selectedOptions.value : null;
                field.onChange(changedValue);
              }
            }}
            onInputChange={(newValue: string, actionMeta: any) => {
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

export default PlatformSelector;
