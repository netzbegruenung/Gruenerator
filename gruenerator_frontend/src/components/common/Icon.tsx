import React from 'react';
import { getIcon } from '../../config/icons';

interface IconProps {
  category: string;
  name: string;
  size?: number | string;
  className?: string;
  color?: string;
  'aria-label'?: string;
  [key: string]: any;
}

/**
 * Universal Icon component for consistent icon usage across the application
 */
const Icon: React.FC<IconProps> = ({
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
    console.warn(`Icon not found: ${category}/${name}`);
    return null;
  }

  const iconProps: Record<string, any> = {
    size,
    className: `icon ${className}`.trim(),
    'aria-label': ariaLabel || `${name} icon`,
    ...rest
  };

  if (color) {
    iconProps.color = color;
  }

  return <IconComponent {...iconProps} />;
};

export default Icon;
