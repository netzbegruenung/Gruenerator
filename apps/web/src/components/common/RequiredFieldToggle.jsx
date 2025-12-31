import React from 'react';
import PropTypes from 'prop-types';
import * as Switch from '@radix-ui/react-switch';
import '../../assets/styles/components/ui/RequiredFieldToggle.css';

const RequiredFieldToggle = ({
  checked = false,
  onChange,
  disabled = false,
  label = 'Pflichtfeld',
  showLabel = true
}) => {
  const handleToggle = (newChecked) => {
    if (!disabled && onChange) {
      onChange(newChecked);
    }
  };

  return (
    <div className={`required-field-toggle ${disabled ? 'disabled' : ''}`}>
      <Switch.Root
        className="required-switch"
        checked={checked}
        onCheckedChange={handleToggle}
        disabled={disabled}
        aria-label={label}
      >
        <Switch.Thumb className="required-switch-thumb" />
      </Switch.Root>
      {showLabel && (
        <span className="required-switch-label">
          {label}
        </span>
      )}
    </div>
  );
};

RequiredFieldToggle.propTypes = {
  checked: PropTypes.bool,
  onChange: PropTypes.func,
  disabled: PropTypes.bool,
  label: PropTypes.string,
  showLabel: PropTypes.bool
};

export default RequiredFieldToggle;
