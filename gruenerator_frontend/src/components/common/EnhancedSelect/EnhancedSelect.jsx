import React, { lazy, Suspense, useCallback, memo } from 'react';
import PropTypes from 'prop-types';
const Select = lazy(() => import('react-select'));
import FormFieldWrapper from '../Form/Input/FormFieldWrapper';
import SourceTag from './SourceTag';
import OptionIcon from './OptionIcon';
import '../../../assets/styles/components/ui/react-select.css';
import '../../../assets/styles/components/ui/enhanced-select.css';

/**
 * EnhancedSelect - A wrapper around react-select with native support for tags, icons, and metadata
 * 
 * Standardized option format:
 * {
 *   value: string,
 *   label: string,
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
const EnhancedSelect = ({
  // Enhanced functionality props
  enableTags = false,
  enableIcons = false,
  enableSubtitles = false,
  tagVariants = {},
  iconConfig = {},
  
  // Form wrapper props
  label,
  helpText,
  required = false,
  error,
  
  // Standard react-select props
  options = [],
  formatOptionLabel: customFormatOptionLabel,
  className = '',
  classNamePrefix = 'enhanced-select',
  ...selectProps
}) => {
  
  // Internal formatOptionLabel that handles enhanced features
  const internalFormatOptionLabel = useCallback((option, { context }) => {
    // If custom formatOptionLabel is provided, use it first
    if (customFormatOptionLabel) {
      return customFormatOptionLabel(option, { context });
    }

    // Enhanced formatting for menu options
    if (context === 'menu') {
      return (
        <div className="enhanced-option">
          {/* Icon */}
          {enableIcons && (option.icon || option.iconType) && (
            <OptionIcon 
              icon={option.icon} 
              iconType={option.iconType}
              size={iconConfig.size || 16}
              config={iconConfig}
            />
          )}
          
          {/* Content */}
          <div className="enhanced-option__content">
            <span className="enhanced-option__label">
              {option.label}
            </span>
            {enableSubtitles && option.subtitle && (
              <span className="enhanced-option__subtitle">
                {option.subtitle}
              </span>
            )}
          </div>
          
          {/* Tag */}
          {enableTags && option.tag && (
            <SourceTag 
              label={option.tag.label}
              variant={option.tag.variant || 'custom'}
              icon={option.tag.icon}
              type={option.tag.type}
              customVariants={tagVariants}
            />
          )}
        </div>
      );
    }
    
    // For selected values, show simplified format
    return (
      <span className="enhanced-selected-option">
        {option.label}
        {enableTags && option.tag && option.tag.variant === 'group' && (
          <span className="enhanced-selected-source">
            [{option.tag.label}]
          </span>
        )}
      </span>
    );
  }, [customFormatOptionLabel, enableTags, enableIcons, enableSubtitles, tagVariants, iconConfig]);

  const selectElement = (
    <Suspense fallback={<div>Loading...</div>}>
      <Select
        options={options}
        formatOptionLabel={internalFormatOptionLabel}
        className={`enhanced-select ${className}`.trim()}
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
      htmlFor={selectProps.inputId}
    >
      {selectElement}
    </FormFieldWrapper>
  );
};

EnhancedSelect.propTypes = {
  // Enhanced functionality
  enableTags: PropTypes.bool,
  enableIcons: PropTypes.bool,
  enableSubtitles: PropTypes.bool,
  tagVariants: PropTypes.object,
  iconConfig: PropTypes.object,
  
  // Form wrapper
  label: PropTypes.string,
  helpText: PropTypes.string,
  required: PropTypes.bool,
  error: PropTypes.string,
  
  // Standard react-select
  options: PropTypes.arrayOf(PropTypes.shape({
    value: PropTypes.any.isRequired,
    label: PropTypes.string.isRequired,
    icon: PropTypes.oneOfType([PropTypes.func, PropTypes.string]),
    iconType: PropTypes.string,
    tag: PropTypes.shape({
      label: PropTypes.string.isRequired,
      variant: PropTypes.oneOf(['user', 'group', 'custom']),
      type: PropTypes.string,
      icon: PropTypes.func
    }),
    subtitle: PropTypes.string,
    searchableContent: PropTypes.string,
    metadata: PropTypes.object
  })),
  formatOptionLabel: PropTypes.func,
  className: PropTypes.string,
  classNamePrefix: PropTypes.string
};

EnhancedSelect.displayName = 'EnhancedSelect';

export default memo(EnhancedSelect);