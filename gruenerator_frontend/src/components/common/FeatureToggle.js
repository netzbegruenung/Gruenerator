import React from 'react';
import PropTypes from 'prop-types';
import '../../assets/styles/components/FeatureToggle.css';

const FeatureToggle = ({ 
  isActive, 
  onToggle, 
  label, 
  icon: Icon, 
  description
}) => {
  const handleToggle = () => {
    onToggle(!isActive);
  };

  return (
    <div className="feature-toggle">
      <div className="feature-header">
        <label className="feature-switch">
          <input
            type="checkbox"
            checked={isActive}
            onChange={handleToggle}
            aria-label={label}
          />
          <span className="feature-slider"></span>
        </label>
        <div className="feature-label">
          <Icon className="feature-icon" />
          {label} {isActive ? '(aktiviert)' : ''}
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
  description: PropTypes.string.isRequired
};

export default FeatureToggle; 