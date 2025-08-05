import React from 'react';
import PropTypes from 'prop-types';
import { getIcon } from '../../config/icons';

/**
 * Universal Icon component for consistent icon usage across the application
 * 
 * @param {Object} props
 * @param {string} props.category - Icon category (platforms, navigation, actions, ui)
 * @param {string} props.name - Icon name within the category
 * @param {number|string} props.size - Icon size in pixels (default: 20)
 * @param {string} props.className - Additional CSS classes
 * @param {string} props.color - Icon color (passed to underlying icon component)
 * @param {string} props['aria-label'] - Accessibility label
 * @param {Object} props...rest - Additional props passed to the icon component
 */
const Icon = ({ 
  category, 
  name, 
  size = 20, 
  className = '', 
  color,
  'aria-label': ariaLabel,
  ...rest 
}) => {
  const IconComponent = getIcon(category, name);

  if (!IconComponent) {
    // Return null for missing icons to avoid rendering errors
    console.warn(`Icon not found: ${category}/${name}`);
    return null;
  }

  const iconProps = {
    size,
    className: `icon ${className}`.trim(),
    'aria-label': ariaLabel || `${name} icon`,
    ...rest
  };

  // Add color prop if provided
  if (color) {
    iconProps.color = color;
  }

  return <IconComponent {...iconProps} />;
};

Icon.propTypes = {
  category: PropTypes.string.isRequired,
  name: PropTypes.string.isRequired,
  size: PropTypes.oneOfType([PropTypes.number, PropTypes.string]),
  className: PropTypes.string,
  color: PropTypes.string,
  'aria-label': PropTypes.string
};

export default Icon;