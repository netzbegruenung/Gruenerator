import React from 'react';
import PropTypes from 'prop-types';
import * as Switch from '@radix-ui/react-switch';
import '../../assets/styles/components/ui/FeatureToggle.css';

const FeatureToggle = ({
  isActive,
  onToggle,
  label,
  icon: Icon,
  description,
  className,
  tabIndex,
  disabled = false,
  noBorder = false
}) => {
  const handleToggle = (checked) => {
    if (!disabled && onToggle) {
      onToggle(checked);
    }
  };

  return (
    <div className={`feature-toggle ${className || ''} ${disabled ? 'feature-toggle-disabled' : ''} ${noBorder ? 'feature-toggle-no-border' : ''}`}>
      <div className="feature-header">
        <Switch.Root
          className="feature-switch"
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label={label}
          tabIndex={tabIndex}
          disabled={disabled}
        >
          <Switch.Thumb className="feature-switch-thumb" />
        </Switch.Root>
        <div className="feature-label">
          <Icon className={`feature-toggle-icon ${isActive ? 'active' : ''} ${disabled ? 'disabled' : ''}`} />
          {label} {isActive ? '' : ''}
        </div>
      </div>

      {description && description.trim() && (
        <div className="feature-description">
          {description}
        </div>
      )}
    </div>
  );
};

FeatureToggle.propTypes = {
  isActive: PropTypes.bool.isRequired,
  onToggle: PropTypes.func,
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  description: PropTypes.string,
  className: PropTypes.string,
  tabIndex: PropTypes.number,
  disabled: PropTypes.bool,
  noBorder: PropTypes.bool
};

export default FeatureToggle; 