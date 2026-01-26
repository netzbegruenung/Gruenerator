import {
  lazy,
  Suspense,
  useCallback,
  memo,
  type ComponentType,
  type ReactNode,
  forwardRef,
  useRef,
  useImperativeHandle,
} from 'react';

import type {
  Props as ReactSelectProps,
  GroupBase,
  StylesConfig,
  MultiValueProps,
  PlaceholderProps,
} from 'react-select';
import type SelectType from 'react-select';
import type CreatableSelectType from 'react-select/creatable';

const Select = lazy(() => import('react-select')) as unknown as typeof SelectType;
const CreatableSelect = lazy(
  () => import('react-select/creatable')
) as unknown as typeof CreatableSelectType;
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';

import OptionIcon from './OptionIcon';
import '../../../assets/styles/components/ui/react-select.css';

/**
 * EnhancedSelect - A wrapper around react-select with native support for tags, icons, and metadata
 *
 * Props:
 * - placeholderIcon?: Component - Icon to show in placeholder (e.g., for active mode indicators)
 *
 * Standardized option format:
 * {
 *   value: string,
 *   label: string,
 *   selectedLabel?: string,  // Optional: different label when selected (e.g., chip display)
 *   icon?: Component | string,
 *   iconType?: string,
 *   tag?: {
 *     label: string,
 *     type?: string,
 *     variant?: 'user' | 'group' | 'custom',
 *     icon?: Component
 *   },
 *   subtitle?: string,
 *   searchableContent?: string,
 *   metadata?: object
 * }
 */

interface EnhancedSelectOption {
  value: string | number;
  label: string;
  selectedLabel?: string;
  icon?: ComponentType<{ className?: string; size?: number }> | string;
  iconType?: string;
  tag?: {
    label: string;
    type?: string;
    variant?: string;
    icon?: ComponentType;
  };
  subtitle?: string;
  searchableContent?: string;
  metadata?: {
    isSpecialMode?: boolean;
    [key: string]: unknown;
  };
  // Allow additional properties for extensibility
  [key: string]: unknown;
}

interface IconConfig {
  size?: number;
  className?: string;
  [key: string]: unknown;
}

interface EnhancedSelectRef {
  inputRef?: { blur: () => void } | null;
  [key: string]: unknown;
}

interface EnhancedSelectProps extends Omit<
  ReactSelectProps<EnhancedSelectOption, boolean, GroupBase<EnhancedSelectOption>>,
  'options' | 'formatOptionLabel'
> {
  // Enhanced functionality
  enableTags?: boolean;
  enableIcons?: boolean;
  enableSubtitles?: boolean;
  tagVariants?: Record<string, unknown>;
  iconConfig?: IconConfig;
  placeholderIcon?: ComponentType<{ className?: string }> | null;
  // Creatable functionality
  isCreatable?: boolean;
  // Form wrapper
  label?: string;
  helpText?: string;
  required?: boolean;
  error?: string;
  // Standard react-select
  options?: EnhancedSelectOption[];
  formatOptionLabel?: (
    option: EnhancedSelectOption,
    meta: { context: 'menu' | 'value' }
  ) => ReactNode;
  className?: string;
  classNamePrefix?: string;
  styles?: StylesConfig<EnhancedSelectOption, boolean, GroupBase<EnhancedSelectOption>>;
  inputId?: string;
  components?: Record<string, ComponentType<unknown>>;
}

const EnhancedSelect = forwardRef<EnhancedSelectRef, EnhancedSelectProps>(
  (
    {
      // Enhanced functionality props
      enableTags = false,
      enableIcons = false,
      enableSubtitles = false,
      tagVariants = {},
      iconConfig = {},
      placeholderIcon = null,

      // Creatable functionality
      isCreatable = false,

      // Form wrapper props
      label,
      helpText,
      required = false,
      error,

      // Standard react-select props
      options = [],
      formatOptionLabel: customFormatOptionLabel,
      className = '',
      classNamePrefix = 'react-select',
      components: customComponents = {},
      styles: customStyles,
      inputId,
      ...selectProps
    },
    forwardedRef
  ) => {
    // Ref to the internal select component
    const selectRef = useRef<{ inputRef?: { blur: () => void } | null }>(null);

    // Expose select API through imperative handle
    useImperativeHandle(
      forwardedRef,
      () => ({
        inputRef: selectRef.current?.inputRef,
      }),
      []
    );

    // Internal formatOptionLabel that handles enhanced features
    const internalFormatOptionLabel = useCallback(
      (option: EnhancedSelectOption, { context }: { context: 'menu' | 'value' }) => {
        // If custom formatOptionLabel is provided, use it first
        if (customFormatOptionLabel) {
          return customFormatOptionLabel(option, { context });
        }

        // Enhanced formatting for menu options
        if (context === 'menu') {
          const isSpecialMode = option.metadata?.isSpecialMode || false;

          return (
            <div
              className={`enhanced-option ${isSpecialMode ? 'enhanced-option--special-mode' : ''}`}
            >
              {/* Icon */}
              {enableIcons && (option.icon || option.iconType) && (
                <OptionIcon
                  icon={option.icon}
                  iconType={option.iconType}
                  size={iconConfig?.size || 16}
                  config={iconConfig}
                />
              )}

              {/* Content */}
              <div className="enhanced-option__content">
                <span className="enhanced-option__label">{option.label}</span>
              </div>
            </div>
          );
        }

        // For selected values, show simplified format
        return (
          <span className="enhanced-selected-option">{option.selectedLabel || option.label}</span>
        );
      },
      [customFormatOptionLabel, enableTags, enableIcons, enableSubtitles, tagVariants, iconConfig]
    );

    // Custom Placeholder to show icon if provided
    const CustomPlaceholder = useCallback(
      (props: { children: ReactNode }) => {
        const { children } = props;
        const Icon = placeholderIcon;

        return (
          <div className="react-select__placeholder-wrapper">
            {Icon && <Icon className="react-select__placeholder-icon" />}
            <span>{children}</span>
          </div>
        );
      },
      [placeholderIcon]
    );

    // Custom MultiValueLabel to show icons in selected chips
    const CustomMultiValueLabel = useCallback(
      (props: { data: EnhancedSelectOption }) => {
        const { data } = props;
        const Icon = data.icon;
        const isSpecialMode = data.metadata?.isSpecialMode || false;
        const displayLabel = data.selectedLabel || data.label;

        return (
          <div
            className={`react-select__multi-value__label-wrapper ${isSpecialMode ? 'special-mode' : ''}`}
          >
            {enableIcons && Icon && typeof Icon === 'function' && (
              <Icon className="react-select__multi-value__icon" />
            )}
            <span>{displayLabel}</span>
          </div>
        );
      },
      [enableIcons]
    );

    // Merge custom components
    const components = {
      ...customComponents,
      Placeholder: CustomPlaceholder,
      MultiValueLabel: CustomMultiValueLabel,
    };

    // Enhanced styles for multi-value chips
    const enhancedStyles: StylesConfig<
      EnhancedSelectOption,
      boolean,
      GroupBase<EnhancedSelectOption>
    > = {
      multiValue: (base, state) => {
        const isSpecialMode =
          (state.data as EnhancedSelectOption)?.metadata?.isSpecialMode || false;
        if (isSpecialMode) {
          return {
            ...base,
            backgroundColor: 'rgba(135, 206, 250, 0.15)',
            border: '1px solid var(--himmel)',
            borderRadius: 'var(--card-border-radius-small)',
          };
        }
        return base;
      },
      multiValueLabel: (base, state) => {
        const isSpecialMode =
          (state.data as EnhancedSelectOption)?.metadata?.isSpecialMode || false;
        if (isSpecialMode) {
          return {
            ...base,
            color: 'var(--himmel-dark, var(--font-color))',
            fontWeight: 600,
          };
        }
        return base;
      },
    };

    const SelectComponent = isCreatable ? CreatableSelect : Select;

    // Merge enhanced styles with user-provided styles
    const mergedStyles: StylesConfig<
      EnhancedSelectOption,
      boolean,
      GroupBase<EnhancedSelectOption>
    > = {
      ...enhancedStyles,
      ...customStyles,
      // Merge functions for overlapping style keys
      ...(customStyles
        ? Object.keys(customStyles).reduce<Record<string, unknown>>((acc, key) => {
            const styleKey = key as keyof StylesConfig<
              EnhancedSelectOption,
              boolean,
              GroupBase<EnhancedSelectOption>
            >;
            const enhancedStyleFn = enhancedStyles[styleKey];
            const customStyleFn = customStyles[styleKey];
            if (
              enhancedStyleFn &&
              typeof enhancedStyleFn === 'function' &&
              typeof customStyleFn === 'function'
            ) {
              acc[key] = (base: unknown, state: unknown) => {
                const enhancedStyle = (enhancedStyleFn as (b: unknown, s: unknown) => unknown)(
                  base,
                  state
                );
                return (customStyleFn as (b: unknown, s: unknown) => unknown)(enhancedStyle, state);
              };
            }
            return acc;
          }, {})
        : {}),
    };

    const selectElement = (
      <Suspense fallback={<div>Loading...</div>}>
        <SelectComponent
          ref={selectRef as any}
          options={options}
          formatOptionLabel={internalFormatOptionLabel}
          components={components}
          styles={mergedStyles}
          className={`react-select ${className}`.trim()}
          classNamePrefix={classNamePrefix}
          {...selectProps}
        />
      </Suspense>
    );

    // If no form wrapper props are provided, return just the select
    if (!label && !helpText && !error) {
      return selectElement;
    }

    // Return wrapped in FormFieldWrapper
    return (
      <FormFieldWrapper
        label={label}
        helpText={helpText}
        required={required}
        error={error}
        htmlFor={inputId}
      >
        {selectElement}
      </FormFieldWrapper>
    );
  }
);

EnhancedSelect.displayName = 'EnhancedSelect';

export default memo(EnhancedSelect);
export type { EnhancedSelectOption };
