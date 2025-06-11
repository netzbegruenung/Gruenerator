import React from 'react';
import PropTypes from 'prop-types';
import * as Switch from '@radix-ui/react-switch';

const FeatureToggle = ({ 
  isActive, 
  onToggle, 
  label, 
  icon: Icon, 
  description,
  className
}) => {
  const handleToggle = (checked) => {
    onToggle(checked);
  };

  return (
    <div className={`feature-toggle ${className || ''}`}>
      <div className="feature-header">
        <Switch.Root
          className="feature-switch"
          checked={isActive}
          onCheckedChange={handleToggle}
          aria-label={label}
        >
          <Switch.Thumb className="feature-switch-thumb" />
        </Switch.Root>
        <div className="feature-label">
          <Icon className={`feature-icon ${isActive ? 'active' : ''}`} />
          {label} {isActive ? '' : ''}
        </div>
      </div>

      <div className="feature-description">
        {description}
      </div>
    </div>
  );
};

FeatureToggle.propTypes = {
  isActive: PropTypes.bool.isRequired,
  onToggle: PropTypes.func.isRequired,
  label: PropTypes.string.isRequired,
  icon: PropTypes.elementType.isRequired,
  description: PropTypes.string.isRequired,
  className: PropTypes.string
};

export default FeatureToggle; 