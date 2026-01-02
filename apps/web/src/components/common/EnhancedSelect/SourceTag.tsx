import { memo } from 'react';

/**
 * SourceTag - Flexible tag component for showing content origin or metadata
 */
interface SourceTagProps {
  label?: string;
  variant?: 'user' | 'group' | 'custom';
  icon?: () => void;
  type?: string;
  customVariants?: Record<string, unknown>;
}

const SourceTag = memo(({ label, variant = 'custom', icon: Icon, type, customVariants = {} }) => {
  // Get CSS class based on variant
  const getVariantClass = () => {
    if (customVariants[variant]) {
      return customVariants[variant];
    }

    switch (variant) {
      case 'user':
        return 'source-tag--user';
      case 'group':
        return 'source-tag--group';
      default:
        return 'source-tag--custom';
    }
  };

  // Default icons for built-in variants
  const getDefaultIcon = () => {
    if (Icon) {
      return <Icon className="source-tag__icon" />;
    }

    if (variant === 'group') {
      return (
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" className="source-tag__icon">
          <path d="M16 4c0-1.11.89-2 2-2s2 .89 2 2c0 1.11-.89 2-2 2s-2-.89-2-2zM4 18v-1c0-2.66 5.33-4 8-4s8 1.34 8 4v1H4zM12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4z"/>
        </svg>
      );
    }

    return null;
  };

  // For user variant without custom label, show default text
  const displayLabel = variant === 'user' && !label ? 'Mein Profil' : label;

  return (
    <span className={`source-tag ${getVariantClass()}`}>
      {getDefaultIcon()}
      {displayLabel}
    </span>
  );
});

SourceTag.displayName = 'SourceTag';

export default SourceTag;
